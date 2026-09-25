"""The Studio of a notebook (D-94): reports, flashcards, quizzes, tables, mind maps.

A generation is **created now and made later**. ``create`` validates the
choices against the catalogue, checks the quota and writes the artifact as
``gerando``; the router hands :func:`run_job` to FastAPI's background tasks,
and the job — in a session of its own — reads the passages, calls the
provider, checks every item and writes ``pronto`` or ``falhou``. A report can
take longer than the proxy in front of the API waits for one response, and the
student keeps asking questions meanwhile, as in NotebookLM.

The rules, in the order a generation meets them:

1. **Owner first**, as everywhere in the notebooks: an artifact is read only
   through ``NotebookRepository``; somebody else's is a 404.
2. **A choice the tool does not have is refused, never ignored** (D-56).
3. **Quota before the call, counted on success.** Running generations are
   already subtracted, so ten clicks cannot overshoot the day's limit; a failed
   one costs nothing.
4. **Every figure of every item is in a passage that item cites**
   (``app.notebooks.studio_content``) — one retry naming the figures, then the
   item is left out and the artifact says so.
5. **A job that never finished reads as failed.** A deploy restarts the
   machine; an artifact still ``gerando`` past its deadline is shown as
   ``falhou``, derived when read — a GET never writes.
"""

from __future__ import annotations

import dataclasses
import logging
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy.orm import Session

from app.ai.factory import get_provider
from app.ai.guardrails import numbers_in
from app.ai.notebook import retry_note
from app.ai.provider import AIProvider, AIUnavailableError
from app.ai.studio import CATALOG, CUSTOM, StudioRequest, ToolSpec
from app.config import Settings
from app.config import settings as default_settings
from app.domain.errors import ConflictError, NotFoundError, QuotaExceededError, ValidationError
from app.exporters import studio as studio_exporter
from app.models.notebook import Notebook, NotebookNote, StudioArtifact
from app.models.user import User
from app.notebooks import mindmap
from app.notebooks.retrieval import search, spread
from app.notebooks.studio_content import cell_text, check, finalise, item_count
from app.repositories.notebook_repository import NotebookRepository
from app.schemas.notebook import (
    ArtifactOut,
    ArtifactSummaryOut,
    ArtifactUpdate,
    CitationOut,
    MindMapEdgeOut,
    MindMapLayoutOut,
    MindMapNodeOut,
    NoteOut,
    StudioCatalogOut,
    StudioChoiceOut,
    StudioIn,
    StudioListOut,
    StudioToolOut,
    UsageOut,
)
from app.services.notebook_service import _note_out, citations_for, passages_for

logger = logging.getLogger(__name__)

MAX_COLUMNS = 8
MAX_COLUMN_CHARS = 60

INTERRUPTED = "A geração foi interrompida antes de terminar (o servidor reiniciou). Gere de novo."
UNEXPECTED = "Erro inesperado ao gerar. Tente de novo; se persistir, avise o professor."


@dataclass(frozen=True)
class ExportFile:
    body: bytes
    media_type: str
    filename: str


class StudioService:
    def __init__(self, db: Session, user: User, settings: Settings = default_settings) -> None:
        self.db = db
        self.user = user
        self.settings = settings
        self.repo = NotebookRepository(db, user.id)

    # --- catalogue ---------------------------------------------------------

    @staticmethod
    def catalog() -> StudioCatalogOut:
        def choices(items) -> list[StudioChoiceOut]:
            return [
                StudioChoiceOut(
                    slug=c.slug,
                    label=c.label,
                    description=c.description,
                    instructions=c.instructions,
                    columns=list(c.columns),
                    amount=c.amount,
                )
                for c in items
            ]

        return StudioCatalogOut(
            tools=[
                StudioToolOut(
                    slug=spec.slug,  # type: ignore[arg-type]
                    label=spec.label,
                    description=spec.description,
                    formats=choices(spec.formats),
                    templates=choices(spec.templates),
                    counts=choices(spec.counts),
                    difficulties=choices(spec.difficulties),
                    columns=spec.columns,
                    exports=list(spec.exports),
                )
                for spec in CATALOG.values()
            ],
            max_columns=MAX_COLUMNS,
        )

    # --- reading -----------------------------------------------------------

    def list(self, notebook_id: int) -> StudioListOut:
        self._notebook(notebook_id)
        return StudioListOut(
            artifacts=[self._summary(a) for a in self.repo.artifacts(notebook_id)],
            usage=self.usage(),
        )

    def get(self, notebook_id: int, artifact_id: int) -> ArtifactOut:
        return self._out(self._artifact(notebook_id, artifact_id))

    def usage(self) -> UsageOut:
        usage = self.repo.usage(_today())
        used = usage.artifacts if usage is not None else 0
        limit = self.settings.notebook_daily_artifacts
        return UsageOut(used=used, limit=limit, remaining=max(limit - used - self._running(), 0))

    # --- creating ----------------------------------------------------------

    def create(self, notebook_id: int, payload: StudioIn) -> ArtifactOut:
        notebook = self._notebook(notebook_id)
        spec = CATALOG[payload.tool]
        options = self._options(spec, payload)
        chunks = self.repo.selected_chunks(notebook_id)
        if not chunks:
            raise ValidationError(
                "Nenhuma fonte marcada. Adicione uma fonte ou marque ao menos uma na lista."
            )
        self._provider()
        running = self._running()
        if running >= self.settings.notebook_studio_in_flight:
            raise ConflictError(
                "Já há gerações em andamento. Espere uma terminar para começar outra."
            )
        if self.usage().remaining <= 0:
            raise QuotaExceededError(
                f"Você usou as {self.settings.notebook_daily_artifacts} gerações de hoje no "
                "Estúdio. O limite volta amanhã; o que você já gerou continua disponível."
            )
        template = spec.template(payload.template)
        artifact = StudioArtifact(
            notebook_id=notebook.id,
            tool=spec.slug,
            format=options["format"],
            template=options["template"],
            title=(template.label if template and template.slug != CUSTOM else spec.label),
            options=options,
            status="gerando",
            source_ids=list(dict.fromkeys(chunk.source_id for chunk in chunks)),
        )
        self.db.add(artifact)
        notebook.updated_at = datetime.now(UTC)
        self.db.commit()
        return self._out(artifact)

    def _options(self, spec: ToolSpec, payload: StudioIn) -> dict:
        """The student's choices, checked against the catalogue and resolved to
        what the job needs. Stored whole: the artifact records what it asked."""

        def pick(kind: str, value: str | None, choices, default: str | None):
            if not choices:
                if value is not None:
                    raise ValidationError(f"{spec.label} não tem {kind} para escolher.")
                return None
            slugs = [c.slug for c in choices]
            chosen = value or default or slugs[0]
            if chosen not in slugs:
                raise ValidationError(
                    f"{kind.capitalize()} desconhecido para {spec.label}: {chosen}. "
                    f"Aceitos: {', '.join(slugs)}."
                )
            return next(c for c in choices if c.slug == chosen)

        fmt = pick("formato", payload.format, spec.formats, None)
        template = pick("modelo", payload.template, spec.templates, None)
        count = pick("quantidade", payload.count, spec.counts, "padrao")
        difficulty = pick("dificuldade", payload.difficulty, spec.difficulties, "medio")

        instructions = None
        if payload.instructions is not None:
            if not template or not any(c.instructions or c.slug == CUSTOM for c in spec.templates):
                raise ValidationError(
                    f"{spec.label} não aceita instruções de modelo; use o campo de foco."
                )
            instructions = payload.instructions.strip() or None
        elif template is not None:
            instructions = template.instructions or None
        if template is not None and template.slug == CUSTOM and spec.slug == "report":
            if not instructions:
                raise ValidationError(
                    "O modelo “Crie o seu” precisa de instruções: descreva a estrutura, o "
                    "estilo e o público do relatório."
                )

        columns: list[str] = []
        if payload.columns is not None:
            if not spec.columns:
                raise ValidationError(f"{spec.label} não tem colunas para escolher.")
            columns = [c.strip() for c in payload.columns]
        elif template is not None:
            columns = list(template.columns)
        if spec.columns:
            if any(not c for c in columns):
                raise ValidationError("Uma coluna está sem nome.")
            if any(len(c) > MAX_COLUMN_CHARS for c in columns):
                raise ValidationError(
                    f"O nome de uma coluna passa de {MAX_COLUMN_CHARS} caracteres."
                )
            if len({c.casefold() for c in columns}) != len(columns):
                raise ValidationError("Duas colunas têm o mesmo nome.")
            if len(columns) > MAX_COLUMNS:
                raise ValidationError(f"No máximo {MAX_COLUMNS} colunas.")

        return {
            "format": fmt.slug if fmt else None,
            "template": template.slug if template else None,
            "instructions": instructions,
            "topic": (payload.topic or "").strip() or None,
            "count": count.slug if count else None,
            "amount": count.amount if count else None,
            "difficulty": difficulty.slug if difficulty else None,
            "columns": columns,
            "depth": fmt.amount if fmt and fmt.amount else 2,
        }

    # --- the job -----------------------------------------------------------

    def run(self, artifact_id: int) -> None:
        """Make one artifact. Never raises: every way to fail is written on it."""
        artifact = self.repo.find_artifact(artifact_id)
        if artifact is None or artifact.status != "gerando":
            return
        try:
            self._make(artifact)
        except AIUnavailableError as exc:
            self._fail(artifact, str(exc))
        except ValidationError as exc:
            self._fail(artifact, str(exc))
        except Exception:  # noqa: BLE001 - a job has no caller to raise to
            logger.exception("Geração do Estúdio falhou: artefato %s", artifact_id)
            self._fail(artifact, UNEXPECTED)

    def _make(self, artifact: StudioArtifact) -> None:
        notebook = self.repo.get(artifact.notebook_id)
        if notebook is None:  # pragma: no cover - deleted between request and job
            return
        options = artifact.options or {}
        chunks = self.repo.chunks_of(notebook.id, list(artifact.source_ids or []))
        if not chunks:
            raise ValidationError("As fontes desta geração foram removidas antes de ela terminar.")
        provider = get_provider(self.settings)
        limit = self.settings.notebook_studio_passages
        topic = options.get("topic")
        picked = spread(chunks, limit)
        if topic:
            found = search(
                chunks, topic, top_k=limit, settings=self.settings, semantic=not provider.simulated
            )
            if not found.fallback:
                picked = found.chunks
        passages = passages_for(picked)
        request = StudioRequest(
            tool=artifact.tool,
            notebook_title=notebook.title,
            source_titles=tuple(dict.fromkeys(chunk.source.title for chunk in picked)),
            passages=passages,
            format=options.get("format"),
            template=options.get("template"),
            instructions=options.get("instructions"),
            topic=topic,
            count=options.get("amount"),
            difficulty=options.get("difficulty"),
            columns=tuple(options.get("columns") or ()),
            depth=int(options.get("depth") or 2),
        )
        extra = numbers_in(
            " ".join(
                filter(None, [topic, options.get("instructions"), *(options.get("columns") or [])])
            )
        )

        checked = check(request, self._call(provider, request), extra, artifact.title)
        if checked.withheld:
            retry = dataclasses.replace(request, retry_note=retry_note(checked.figures))
            try:
                checked = check(request, self._call(provider, retry), extra, artifact.title)
            except AIUnavailableError:
                # The first answer is valid, only incomplete: keep it rather
                # than lose the whole generation to a busy provider.
                logger.warning("Nova tentativa do Estúdio indisponível; mantida a primeira.")
        if checked.items == 0:
            reason = "A IA não devolveu nenhum item que passasse na conferência com as fontes."
            if checked.figures:
                reason += f" Números sem lastro nos trechos citados: {', '.join(checked.figures)}."
            raise ValidationError(reason)

        body, citations, withheld = finalise(
            artifact.tool, checked, citations_for(passages, picked)
        )
        artifact.title = checked.title[:200]
        artifact.content = {
            "body": body,
            "citations": [citation.model_dump() for citation in citations],
            "withheld": withheld,
        }
        artifact.status = "pronto"
        artifact.error = None
        self.repo.count_artifact(_today())
        self.db.commit()

    @staticmethod
    def _call(provider: AIProvider, request: StudioRequest) -> dict:
        raw = provider.studio(request)
        if not isinstance(raw, dict):
            raise AIUnavailableError("O provedor de IA respondeu num formato inesperado.")
        return raw

    def _fail(self, artifact: StudioArtifact, reason: str) -> None:
        self.db.rollback()
        artifact.status = "falhou"
        artifact.error = reason[:500]
        self.db.commit()

    # --- editing -----------------------------------------------------------

    def rename(self, notebook_id: int, artifact_id: int, payload: ArtifactUpdate) -> ArtifactOut:
        artifact = self._artifact(notebook_id, artifact_id)
        artifact.title = payload.title.strip()
        self.db.commit()
        return self._out(artifact)

    def delete(self, notebook_id: int, artifact_id: int) -> None:
        self.db.delete(self._artifact(notebook_id, artifact_id))
        self.db.commit()

    def save_as_note(self, notebook_id: int, artifact_id: int) -> NoteOut:
        """The artifact as a note, with its citations copied along."""
        artifact = self._ready(notebook_id, artifact_id)
        content = artifact.content or {}
        note = NotebookNote(
            notebook_id=artifact.notebook_id,
            title=artifact.title[:200],
            body=plain_text(artifact.tool, content.get("body") or {})[:20_000],
            origin="estudio",
            citations=list(content.get("citations") or []),
        )
        self.db.add(note)
        self.db.commit()
        return _note_out(note)

    def export(self, notebook_id: int, artifact_id: int, fmt: str) -> ExportFile:
        artifact = self._ready(notebook_id, artifact_id)
        spec = CATALOG[artifact.tool]
        if fmt not in spec.exports:
            raise ValidationError(
                f"{spec.label} não se exporta em {fmt.upper()}. "
                f"Aceitos: {', '.join(e.upper() for e in spec.exports)}."
            )
        notebook = self._notebook(notebook_id)
        body, media_type = studio_exporter.render(self._out(artifact), fmt, notebook.title)
        return ExportFile(
            body=body,
            media_type=media_type,
            filename=f"{_slug(artifact.title) or artifact.tool}.{fmt}",
        )

    # --- helpers -----------------------------------------------------------

    def _notebook(self, notebook_id: int) -> Notebook:
        notebook = self.repo.get(notebook_id)
        if notebook is None:
            raise NotFoundError(f"Caderno não encontrado: {notebook_id}")
        return notebook

    def _artifact(self, notebook_id: int, artifact_id: int) -> StudioArtifact:
        artifact = self.repo.get_artifact(notebook_id, artifact_id)
        if artifact is None:
            raise NotFoundError(f"Item do Estúdio não encontrado: {artifact_id}")
        return artifact

    def _ready(self, notebook_id: int, artifact_id: int) -> StudioArtifact:
        artifact = self._artifact(notebook_id, artifact_id)
        if self._status(artifact) != "pronto":
            raise ValidationError("Este item ainda não está pronto.")
        return artifact

    def _provider(self) -> AIProvider:
        try:
            return get_provider(self.settings)
        except AIUnavailableError as exc:
            raise ValidationError(str(exc)) from exc

    def _deadline(self) -> timedelta:
        return timedelta(seconds=self.settings.ai_timeout_seconds * 3 + 60)

    def _stuck(self, artifact: StudioArtifact) -> bool:
        created = artifact.created_at
        if created.tzinfo is None:  # SQLite hands timestamps back naive, in UTC
            created = created.replace(tzinfo=UTC)
        return datetime.now(UTC) - created > self._deadline()

    def _status(self, artifact: StudioArtifact) -> str:
        if artifact.status == "gerando" and self._stuck(artifact):
            return "falhou"
        return artifact.status

    def _running(self) -> int:
        return sum(1 for artifact in self.repo.running() if not self._stuck(artifact))

    def _summary(self, artifact: StudioArtifact) -> ArtifactSummaryOut:
        status = self._status(artifact)
        body = (artifact.content or {}).get("body") if status == "pronto" else None
        return ArtifactSummaryOut(
            id=artifact.id,
            tool=artifact.tool,  # type: ignore[arg-type]
            format=artifact.format,
            template=artifact.template,
            title=artifact.title,
            status=status,  # type: ignore[arg-type]
            error=INTERRUPTED if status != artifact.status else artifact.error,
            source_count=len(artifact.source_ids or []),
            item_count=item_count(artifact.tool, body),
            created_at=artifact.created_at,
            updated_at=artifact.updated_at,
        )

    def _out(self, artifact: StudioArtifact) -> ArtifactOut:
        summary = self._summary(artifact)
        content = (artifact.content or {}) if summary.status == "pronto" else {}
        body = content.get("body")
        drawn = mindmap.layout(body.get("root")) if body and artifact.tool == "mindmap" else None
        return ArtifactOut(
            **summary.model_dump(),
            options=dict(artifact.options or {}),
            content=body,
            citations=[CitationOut.model_validate(c) for c in content.get("citations") or []],
            withheld=list(content.get("withheld") or []),
            exports=list(CATALOG[artifact.tool].exports),
            layout=_layout_out(drawn) if drawn else None,
        )


def run_job(factory: Callable[[], Session], user_id: int, artifact_id: int) -> None:
    """The background task: its own session, its own user lookup."""
    with factory() as db:
        user = db.get(User, user_id)
        if user is not None:
            StudioService(db, user).run(artifact_id)


def _layout_out(drawn: mindmap.Layout) -> MindMapLayoutOut:
    return MindMapLayoutOut(
        width=drawn.width,
        height=drawn.height,
        nodes=[
            MindMapNodeOut(
                id=n.id,
                parent=n.parent,
                label=n.label,
                lines=n.lines,
                depth=n.depth,
                x=round(n.x, 1),
                y=round(n.y, 1),
                width=round(n.width, 1),
                height=round(n.height, 1),
                citations=n.citations,
            )
            for n in drawn.nodes
        ],
        edges=[
            MindMapEdgeOut(
                source=e.source,
                target=e.target,
                x1=round(e.x1, 1),
                y1=round(e.y1, 1),
                x2=round(e.x2, 1),
                y2=round(e.y2, 1),
            )
            for e in drawn.edges
        ],
    )


def _marks(citations: list[int]) -> str:
    return (" " + " ".join(f"[{n}]" for n in citations)) if citations else ""


def plain_text(tool: str, body: dict) -> str:
    """An artifact as plain text with ``[n]`` markers — a note's body."""
    lines: list[str] = []
    if tool == "report":
        for section in body.get("sections", []):
            lines.append(section["heading"].upper())
            lines.extend(p["text"] + _marks(p["citations"]) for p in section["paragraphs"])
            lines.append("")
    elif tool == "flashcards":
        for card in body.get("cards", []):
            lines += [
                f"Frente: {card['front']}",
                f"Verso: {card['back']}{_marks(card['citations'])}",
                "",
            ]
    elif tool == "quiz":
        for number, question in enumerate(body.get("questions", []), start=1):
            lines.append(f"{number}. {question['prompt']}")
            lines.extend(
                f"   {chr(97 + i)}) {option}" for i, option in enumerate(question["options"])
            )
            answer = question["answer_index"]
            lines.append(
                f"   Resposta: {chr(97 + answer)}) {question['options'][answer]}"
                + (f" — {question['explanation']}" if question["explanation"] else "")
                + _marks(question["citations"])
            )
            lines.append("")
    elif tool == "table":
        columns = body.get("columns", [])
        for row in body.get("rows", []):
            cells = [
                f"{column}: {cell_text(cell)}{_marks(cell['citations'])}"
                for column, cell in zip(columns, row["cells"], strict=False)
            ]
            lines.append("; ".join(cells))
    elif tool == "mindmap":

        def walk(node: dict, depth: int) -> None:
            lines.append("  " * depth + "- " + node["label"] + _marks(node["citations"]))
            for child in node["children"]:
                walk(child, depth + 1)

        if body.get("root"):
            walk(body["root"], 0)
    return "\n".join(lines).strip()


def _slug(title: str) -> str:
    """A filename from a title: ASCII letters, digits and hyphens only."""
    ascii_title = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    words = "".join(c if c.isalnum() else " " for c in ascii_title.lower()).split()
    return "-".join(words)[:60]


def _today() -> date:
    return datetime.now(UTC).date()
