"""Cadernos (D-92): sources, chat, guide and notes of one student's notebooks.

The rules this service exists to keep, in the order a request meets them:

1. **Owner first.** Every notebook is read through ``NotebookRepository``,
   which cannot be built without an owner. Somebody else's notebook is a 404.
2. **Only the selected sources are searched**, and retrieval ranks only the
   passages it is handed (``app.notebooks.retrieval``).
3. **A citation names a passage that was handed over.** The model answers with
   passage numbers; a number outside the list is dropped (D-47).
4. **A figure must be in a passage its paragraph cites** — or in the student's
   own question. The check is ``guardrails.ungrounded_numbers``, the same one
   that guards the explanation of a study. A paragraph that fails it gets one
   retry, told exactly which figures; a paragraph that fails twice is left out
   and the answer says so. Never repaired, never silently dropped.
5. **The daily quota is checked before the call and counted after a success.**
   One question is one request, retry included.
"""

from __future__ import annotations

import dataclasses
import hashlib
import logging
from collections.abc import Callable
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.ai.factory import get_provider
from app.ai.guardrails import numbers_in, ungrounded_numbers
from app.ai.notebook import (
    NotebookDigestContext,
    NotebookQuestion,
    Passage,
    retry_note,
)
from app.ai.provider import AIProvider, AIUnavailableError
from app.config import Settings
from app.config import settings as default_settings
from app.domain.errors import ConflictError, NotFoundError, QuotaExceededError, ValidationError
from app.knowledge.chunking import chunk_text
from app.knowledge.embeddings import EmbeddingClient, EmbeddingUnavailableError, pack_vector
from app.knowledge.lexical import fold
from app.knowledge.readers import ExtractedText, read_upload
from app.models.notebook import (
    Notebook,
    NotebookChunk,
    NotebookEmbedding,
    NotebookMessage,
    NotebookNote,
    NotebookSource,
)
from app.models.user import User
from app.notebooks import app_sources
from app.notebooks.grounding import format_figures, take_citations, ungrounded
from app.notebooks.retrieval import openings, search
from app.repositories.notebook_repository import NotebookRepository
from app.schemas.notebook import (
    SOURCE_DETAIL_KEYS,
    AnswerOut,
    AppSourceIn,
    AskIn,
    ChatOut,
    CitationOut,
    MessageOut,
    NotebookIn,
    NotebookOut,
    NotebookSummaryOut,
    NotebookUpdate,
    NoteIn,
    NoteOut,
    NoteUpdate,
    ParagraphOut,
    SourceDetailOut,
    SourceOut,
    SourceUpdate,
    TextSourceIn,
    UsageOut,
)

logger = logging.getLogger(__name__)

#: Earlier turns sent with a question, so "e o segundo?" can be understood.
_HISTORY_MESSAGES = 6
_HISTORY_CHARS = 1000

PRIVACY_NOTICE = (
    "Não envie material sigiloso ou dados pessoais: no plano gratuito, o provedor "
    "de IA pode usar o conteúdo enviado para melhorar os modelos, e revisores "
    "humanos podem lê-lo."
)
SIMULATED_NOTICE = (
    "Provedor simulado: as respostas citam o começo dos trechos mais relevantes, "
    "sem nenhum serviço externo. Nada sai do servidor."
)


class NotebookService:
    def __init__(
        self,
        db: Session,
        user: User,
        settings: Settings = default_settings,
        project_id: int | None = None,
    ) -> None:
        self.db = db
        self.user = user
        self.settings = settings
        self.project_id = project_id
        self.repo = NotebookRepository(db, user.id)

    # --- notebooks ---------------------------------------------------------

    def list_notebooks(self) -> list[NotebookSummaryOut]:
        return [
            NotebookSummaryOut(
                id=notebook.id,
                title=notebook.title,
                emoji=notebook.emoji,
                source_count=count,
                created_at=notebook.created_at,
                updated_at=notebook.updated_at,
            )
            for notebook, count in self.repo.list_notebooks()
        ]

    def create(self, payload: NotebookIn) -> NotebookOut:
        notebook = self.repo.add(Notebook(title=payload.title.strip(), emoji=payload.emoji))
        self.db.commit()
        return self.get(notebook.id)

    def get(self, notebook_id: int) -> NotebookOut:
        notebook = self._notebook(notebook_id)
        ai_enabled, simulated, notice = self._ai_state()
        return NotebookOut(
            id=notebook.id,
            title=notebook.title,
            emoji=notebook.emoji,
            created_at=notebook.created_at,
            updated_at=notebook.updated_at,
            chat_goal=notebook.chat_goal,  # type: ignore[arg-type]
            chat_instructions=notebook.chat_instructions,
            response_length=notebook.response_length,  # type: ignore[arg-type]
            summary=AnswerOut.model_validate(notebook.summary) if notebook.summary else None,
            suggested_questions=list(notebook.suggested_questions or []),
            sources=[_source_out(source) for source in notebook.sources],
            notes=[_note_out(note) for note in notebook.notes],
            usage=self.usage(),
            fetch_usage=self.fetch_usage(),
            max_sources=self.settings.notebook_max_sources,
            ai_enabled=ai_enabled,
            ai_simulated=simulated,
            ai_notice=notice,
        )

    def update(self, notebook_id: int, payload: NotebookUpdate) -> NotebookOut:
        notebook = self._notebook(notebook_id)
        if payload.title is not None:
            notebook.title = payload.title.strip()
        if payload.emoji is not None:
            notebook.emoji = payload.emoji
        if payload.chat_goal is not None:
            notebook.chat_goal = payload.chat_goal
        if payload.chat_instructions is not None:
            notebook.chat_instructions = payload.chat_instructions.strip() or None
        if payload.response_length is not None:
            notebook.response_length = payload.response_length
        if notebook.chat_goal == "personalizado" and not notebook.chat_instructions:
            raise ValidationError(
                "O objetivo personalizado precisa de instruções: descreva como o chat "
                "deve responder."
            )
        self.db.commit()
        return self.get(notebook_id)

    def delete(self, notebook_id: int) -> None:
        self.repo.delete(self._notebook(notebook_id))
        self.db.commit()

    def _notebook(self, notebook_id: int) -> Notebook:
        notebook = self.repo.get(notebook_id)
        if notebook is None:
            raise NotFoundError(f"Caderno não encontrado: {notebook_id}")
        return notebook

    def _touch(self, notebook: Notebook) -> None:
        notebook.updated_at = datetime.now(UTC)

    # --- sources -----------------------------------------------------------

    def add_upload(self, notebook_id: int, filename: str, data: bytes) -> SourceOut:
        notebook = self._notebook(notebook_id)
        self._check_room(notebook)
        extracted = read_upload(filename, data, max_pages=self.settings.notebook_max_pages)
        paged = filename.lower().endswith(".pdf")
        title = filename.rsplit(".", 1)[0].strip() or filename
        return self._ingest(notebook, "arquivo", title[:300], filename[:500], extracted, paged)

    def add_text(self, notebook_id: int, payload: TextSourceIn) -> SourceOut:
        notebook = self._notebook(notebook_id)
        self._check_room(notebook)
        extracted = ExtractedText(pages=[payload.text])
        return self._ingest(notebook, "texto", payload.title.strip(), None, extracted, False)

    def add_app_source(self, notebook_id: int, payload: AppSourceIn) -> SourceOut:
        """A datasheet or a saved study, written out as text.

        Read through the same services the screens use, with this user as the
        viewer — so a private record of somebody else is a 404 here exactly as
        it is on its datasheet (D-62), and a study outside this user's project
        does not exist.
        """
        notebook = self._notebook(notebook_id)
        self._check_room(notebook)
        if payload.kind == "ficha":
            from app.services.material_service import MaterialService

            detail = MaterialService(self.db, self.user).get_material_detail(payload.record_id)
            text = app_sources.material_text(detail)
            title = f"Ficha: {detail.name}"
            origin = f"material:{detail.id}"
        else:
            from app.services.selection_service import SelectionService

            if self.project_id is None:
                raise NotFoundError(f"Estudo não encontrado: {payload.record_id}")
            selection = SelectionService(self.db, self.project_id, self.user)
            study = selection.get_study(payload.record_id)
            model = selection.repo.get_study(payload.record_id, self.project_id)
            pipeline = selection.describe_pipeline(model)  # type: ignore[arg-type]
            result = selection.run_study(payload.record_id)
            text = app_sources.study_text(study, pipeline, result)
            title = f"Estudo: {study.name}"
            origin = f"estudo:{study.id}"
        return self._ingest(
            notebook, payload.kind, title[:300], origin, ExtractedText(pages=[text]), False
        )

    def _check_room(self, notebook: Notebook) -> None:
        if len(notebook.sources) >= self.settings.notebook_max_sources:
            raise ValidationError(
                f"O caderno já tem {len(notebook.sources)} fontes, o limite. Remova uma "
                "antes de adicionar outra."
            )

    def _ingest(
        self,
        notebook: Notebook,
        kind: str,
        title: str,
        origin: str | None,
        extracted: ExtractedText,
        paged: bool,
        meta: dict | None = None,
    ) -> SourceOut:
        """Cut ``extracted`` into passages and store it as a ready source.

        ``meta`` is where an external source came from and on what terms
        (D-97), built by the backend from what the fetch returned — stored as
        given, shown through ``_source_out`` and copied into every citation of
        its passages. ``None`` for the kinds that have nothing to attribute.
        """
        if extracted.is_empty:
            raise ValidationError(
                "Nenhum texto foi extraído deste arquivo. Se é um PDF digitalizado (imagem), "
                "não há texto para ler: cole o conteúdo como texto."
            )
        pages, truncated = _truncate(extracted.pages, self.settings.notebook_max_source_chars)
        content = "\n\n".join(page.strip() for page in pages if page.strip())
        checksum = hashlib.sha256(content.encode("utf-8")).hexdigest()
        existing = self.repo.source_checksum_exists(notebook.id, checksum)
        if existing is not None:
            raise ConflictError(f"Esta fonte já está no caderno: {existing.title}")

        chunks = chunk_text(ExtractedText(pages=pages))[
            : self.settings.knowledge_max_chunks_per_document
        ]
        source = NotebookSource(
            notebook_id=notebook.id,
            kind=kind,
            title=title,
            origin=origin,
            status="pronto",
            checksum=checksum,
            char_count=len(content),
            page_count=len(pages) if paged else None,
            selected=True,
            truncated=truncated,
            content=content,
            meta=meta or None,
        )
        self.db.add(source)
        self.db.flush()
        rows = [
            NotebookChunk(
                source_id=source.id,
                ordinal=chunk.ordinal,
                # A page is only a locator when the format has pages; a DOCX or
                # a pasted text is one flow, and "p. 1" on every passage would
                # be a locator that locates nothing.
                page_start=chunk.page_start if paged else None,
                page_end=chunk.page_end if paged else None,
                heading=chunk.heading[:300] if chunk.heading else None,
                text=chunk.text,
                search_text=fold(chunk.text),
            )
            for chunk in chunks
        ]
        self.db.add_all(rows)
        self.db.flush()
        self._embed(rows)

        # The guide describes the sources it was written from; with a new one
        # it is stale, and a stale guide is worse than none.
        notebook.summary = None
        notebook.suggested_questions = None
        self._touch(notebook)
        self.db.commit()
        self.db.refresh(source)
        return _source_out(source)

    def _embed(self, rows: list[NotebookChunk]) -> None:
        """Vectors for semantic search, when a real provider and an embedding
        endpoint are configured. A failure costs the vectors, never the source:
        lexical search still works (D-47)."""
        if not rows or self._simulated():
            return
        client = EmbeddingClient(self.settings)
        if not client.configured:
            return
        batch = max(1, self.settings.knowledge_embedding_batch)
        try:
            for start in range(0, len(rows), batch):
                part = rows[start : start + batch]
                vectors = client.embed([row.text for row in part])
                for row, vector in zip(part, vectors, strict=True):
                    self.db.add(
                        NotebookEmbedding(
                            chunk_id=row.id,
                            model=client.model,
                            dimensions=len(vector),
                            vector=pack_vector(vector),
                        )
                    )
        except (EmbeddingUnavailableError, ValidationError) as exc:
            logger.warning("Embeddings do caderno indisponíveis, seguindo só com léxica: %s", exc)

    def get_source(self, notebook_id: int, source_id: int) -> SourceDetailOut:
        source = self._source(notebook_id, source_id)
        return SourceDetailOut(**_source_out(source).model_dump(), content=source.content)

    def update_source(self, notebook_id: int, source_id: int, payload: SourceUpdate) -> SourceOut:
        source = self._source(notebook_id, source_id)
        if payload.title is not None:
            source.title = payload.title.strip()
        if payload.selected is not None:
            source.selected = payload.selected
        self.db.commit()
        return _source_out(source)

    def select_all(self, notebook_id: int, selected: bool) -> list[SourceOut]:
        notebook = self._notebook(notebook_id)
        for source in notebook.sources:
            source.selected = selected
        self.db.commit()
        return [_source_out(source) for source in notebook.sources]

    def delete_source(self, notebook_id: int, source_id: int) -> None:
        source = self._source(notebook_id, source_id)
        notebook = self._notebook(notebook_id)
        self.repo.delete_source(source)
        notebook.summary = None
        notebook.suggested_questions = None
        self._touch(notebook)
        self.db.commit()

    def _source(self, notebook_id: int, source_id: int) -> NotebookSource:
        source = self.repo.get_source(notebook_id, source_id)
        if source is None:
            raise NotFoundError(f"Fonte não encontrada: {source_id}")
        return source

    # --- chat --------------------------------------------------------------

    def messages(self, notebook_id: int) -> list[MessageOut]:
        self._notebook(notebook_id)
        return [_message_out(message) for message in self.repo.messages(notebook_id)]

    def clear_messages(self, notebook_id: int) -> None:
        self._notebook(notebook_id)
        self.repo.clear_messages(notebook_id)
        self.db.commit()

    def ask(self, notebook_id: int, payload: AskIn) -> ChatOut:
        notebook = self._notebook(notebook_id)
        question = payload.question.strip()
        if not question:
            raise ValidationError("Escreva uma pergunta.")
        chunks = self.repo.selected_chunks(notebook_id)
        if not chunks:
            raise ValidationError(
                "Nenhuma fonte marcada. Adicione uma fonte ou marque ao menos uma na lista."
            )
        provider = self._provider()
        self._check_quota()

        found = search(
            chunks,
            question,
            top_k=self.settings.notebook_context_passages,
            settings=self.settings,
            semantic=not provider.simulated,
        )
        passages = passages_for(found.chunks)
        history = tuple(
            (message.role, _message_text(message)[:_HISTORY_CHARS])
            for message in self.repo.messages(notebook_id, limit=_HISTORY_MESSAGES)
        )
        context = NotebookQuestion(
            question=question,
            passages=passages,
            history=history,
            goal=notebook.chat_goal,
            instructions=notebook.chat_instructions,
            length=notebook.response_length,
            fallback=found.fallback,
        )

        raw = self._call(lambda: provider.answer(context))
        answer = _check(raw, passages, found.chunks, question)
        if answer.withheld:
            note = retry_note(answer.withheld)
            retry = dataclasses.replace(context, retry_note=note)
            raw = self._call(lambda: provider.answer(retry))
            answer = _check(raw, passages, found.chunks, question)
        answer = _finalise(answer)

        asked = NotebookMessage(notebook_id=notebook.id, role="user", content={"text": question})
        answered = NotebookMessage(
            notebook_id=notebook.id, role="assistant", content=answer.model_dump()
        )
        self.db.add_all([asked, answered])
        self.repo.count_request(_today())
        self._touch(notebook)
        self.db.commit()
        return ChatOut(
            question=_message_out(asked), answer=_message_out(answered), usage=self.usage()
        )

    # --- the notebook guide ------------------------------------------------

    def summarize(self, notebook_id: int) -> NotebookOut:
        notebook = self._notebook(notebook_id)
        chunks = self.repo.selected_chunks(notebook_id)
        if not chunks:
            raise ValidationError("Marque ao menos uma fonte para escrever o guia do caderno.")
        provider = self._provider()
        self._check_quota()

        picked = openings(chunks, self.settings.notebook_context_passages)
        passages = passages_for(picked)
        titles = tuple(dict.fromkeys(chunk.source.title for chunk in picked))
        context = NotebookDigestContext(
            notebook_title=notebook.title, source_titles=titles, passages=passages
        )
        raw = self._call(lambda: provider.digest(context))
        guide = _check(raw, passages, picked, " ".join(titles))
        if guide.withheld:
            retry = dataclasses.replace(context, retry_note=retry_note(guide.withheld))
            raw = self._call(lambda: provider.digest(retry))
            guide = _check(raw, passages, picked, " ".join(titles))

        # A question is prose too: a figure in it has to come from the sources.
        allowed = set().union(*(numbers_in(p.text) for p in passages), numbers_in(" ".join(titles)))
        questions = [
            str(q).strip()
            for q in (raw.get("questions") or [])
            if str(q).strip() and not ungrounded_numbers(str(q), allowed)
        ][:3]

        notebook.summary = _finalise(guide).model_dump()
        notebook.suggested_questions = questions
        self.repo.count_request(_today())
        self.db.commit()
        return self.get(notebook_id)

    # --- notes -------------------------------------------------------------

    def add_note(self, notebook_id: int, payload: NoteIn) -> NoteOut:
        notebook = self._notebook(notebook_id)
        note = NotebookNote(
            notebook_id=notebook.id, title=payload.title.strip(), body=payload.body, origin="manual"
        )
        self.db.add(note)
        self._touch(notebook)
        self.db.commit()
        return _note_out(note)

    def update_note(self, notebook_id: int, note_id: int, payload: NoteUpdate) -> NoteOut:
        note = self._note(notebook_id, note_id)
        if payload.title is not None:
            note.title = payload.title.strip()
        if payload.body is not None:
            note.body = payload.body
        self.db.commit()
        return _note_out(note)

    def delete_note(self, notebook_id: int, note_id: int) -> None:
        note = self._note(notebook_id, note_id)
        self.db.delete(note)
        self.db.commit()

    def save_message_as_note(self, notebook_id: int, message_id: int) -> NoteOut:
        """An answer kept as a note, with its citations copied along."""
        notebook = self._notebook(notebook_id)
        message = self.repo.get_message(notebook_id, message_id)
        if message is None or message.role != "assistant":
            raise NotFoundError(f"Resposta não encontrada: {message_id}")
        answer = AnswerOut.model_validate(message.content)
        question = next(
            (
                m
                for m in reversed(self.repo.messages(notebook_id))
                if m.role == "user" and m.id < message.id
            ),
            None,
        )
        title = (question.content.get("text") if question else None) or "Resposta salva"
        body = "\n\n".join(
            paragraph.text
            + (" " + " ".join(f"[{n}]" for n in paragraph.citations) if paragraph.citations else "")
            for paragraph in answer.paragraphs
        )
        note = NotebookNote(
            notebook_id=notebook.id,
            title=title[:200],
            body=body,
            origin="chat",
            citations=[citation.model_dump() for citation in answer.citations],
        )
        self.db.add(note)
        self._touch(notebook)
        self.db.commit()
        return _note_out(note)

    def _note(self, notebook_id: int, note_id: int) -> NotebookNote:
        note = self.repo.get_note(notebook_id, note_id)
        if note is None:
            raise NotFoundError(f"Nota não encontrada: {note_id}")
        return note

    # --- provider and quota ------------------------------------------------

    def usage(self) -> UsageOut:
        usage = self.repo.usage(_today())
        used = usage.requests if usage is not None else 0
        limit = self.settings.notebook_daily_requests
        return UsageOut(used=used, limit=limit, remaining=max(limit - used, 0))

    def fetch_usage(self) -> UsageOut:
        """Today's requests to outside sources against ``notebook_daily_fetches``
        (D-97) — a quota apart from the AI one: a page fetched costs no model
        call, and a search on the web costs one of each."""
        usage = self.repo.usage(_today())
        used = usage.fetches if usage is not None else 0
        limit = self.settings.notebook_daily_fetches
        return UsageOut(used=used, limit=limit, remaining=max(limit - used, 0))

    def check_fetch_quota(self) -> None:
        """Refuse before anything leaves the server once today's fetches are
        spent. Counting is the caller's (``repo.count_fetch``), once the
        request is sent."""
        if self.fetch_usage().remaining <= 0:
            raise QuotaExceededError(
                f"Você usou as {self.settings.notebook_daily_fetches} buscas de fontes externas "
                "de hoje. O limite volta amanhã; colar o texto como fonte continua disponível."
            )

    def _check_quota(self) -> None:
        if self.usage().remaining <= 0:
            raise QuotaExceededError(
                f"Você usou as {self.settings.notebook_daily_requests} perguntas de hoje nos "
                "cadernos. O limite volta amanhã; suas fontes e notas continuam disponíveis."
            )

    def _provider(self) -> AIProvider:
        try:
            return get_provider(self.settings)
        except AIUnavailableError as exc:
            raise ValidationError(str(exc)) from exc

    def _simulated(self) -> bool:
        try:
            return get_provider(self.settings).simulated
        except AIUnavailableError:
            return True

    def _ai_state(self) -> tuple[bool, bool, str]:
        try:
            provider = get_provider(self.settings)
        except AIUnavailableError as exc:
            return False, True, str(exc)
        if provider.simulated:
            return True, True, SIMULATED_NOTICE
        return True, False, PRIVACY_NOTICE

    @staticmethod
    def _call(request: Callable[[], dict]) -> dict:
        """Run a provider call. ``AIUnavailableError`` propagates as it is: the
        app turns it into a 503 carrying the provider's own message."""
        raw = request()
        if not isinstance(raw, dict):
            raise AIUnavailableError("O provedor de IA respondeu num formato inesperado.")
        return raw


# --- checking an answer ------------------------------------------------------


def passages_for(chunks: list[NotebookChunk]) -> tuple[Passage, ...]:
    return tuple(
        Passage(
            number=position,
            source_title=chunk.source.title,
            heading=chunk.heading,
            page_start=chunk.page_start,
            page_end=chunk.page_end,
            text=chunk.text,
        )
        for position, chunk in enumerate(chunks, start=1)
    )


def _check(
    raw: dict, passages: tuple[Passage, ...], chunks: list[NotebookChunk], question: str
) -> AnswerOut:
    """Apply rules 3 and 4 of the module docstring to one model answer.

    Citation markers written into the prose are moved to the list; numbers
    outside the passages handed over are dropped. Then every figure a paragraph
    writes is looked for in the passages *that paragraph* cites, plus the
    question (``app.notebooks.grounding``).
    """
    question_numbers = numbers_in(question)
    kept: list[ParagraphOut] = []
    withheld: list[str] = []
    for item in raw.get("paragraphs") or []:
        if not isinstance(item, dict):
            continue
        text, cited = take_citations(
            str(item.get("text") or ""), item.get("citations"), len(passages)
        )
        if not text:
            continue
        invented = ungrounded([text], cited, passages, question_numbers)
        if invented:
            withheld.extend(format_figures(invented))
            continue
        kept.append(ParagraphOut(text=text, citations=cited))

    # Numbered as handed to the model; `_finalise` renumbers for the screen.
    return AnswerOut(
        paragraphs=kept,
        citations=citations_for(passages, chunks),
        not_found=raw.get("not_found") is True,
        withheld=list(dict.fromkeys(withheld)),
    )


def citations_for(passages: tuple[Passage, ...], chunks: list[NotebookChunk]) -> list[CitationOut]:
    """Every passage handed over, as a citation numbered as the model saw it.

    An external source's address and attribution travel with each of its
    passages (D-97): a licence that asks for credit asks for it wherever the
    text is quoted, and a citation outlives its source.
    """
    return [
        CitationOut(
            number=passage.number,
            chunk_id=chunk.id,
            source_id=chunk.source_id,
            source_title=passage.source_title,
            source_url=_meta_text(chunk.source.meta, "url"),
            source_attribution=_meta_text(chunk.source.meta, "attribution"),
            heading=passage.heading,
            page_start=passage.page_start,
            page_end=passage.page_end,
            excerpt=passage.text,
        )
        for passage, chunk in zip(passages, chunks, strict=True)
    ]


def _finalise(checked: AnswerOut) -> AnswerOut:
    """Keep only the passages cited, numbered 1, 2, … in reading order."""
    order: dict[int, int] = {}
    for paragraph in checked.paragraphs:
        for number in paragraph.citations:
            order.setdefault(number, len(order) + 1)
    by_number = {citation.number: citation for citation in checked.citations}
    withheld = (
        [
            "Um trecho da resposta foi omitido porque citava números que não aparecem "
            f"nas fontes citadas: {', '.join(checked.withheld)}."
        ]
        if checked.withheld
        else []
    )
    return AnswerOut(
        paragraphs=[
            ParagraphOut(text=p.text, citations=[order[n] for n in p.citations])
            for p in checked.paragraphs
        ],
        citations=[
            by_number[old].model_copy(update={"number": new})
            for old, new in order.items()
            if old in by_number
        ],
        not_found=checked.not_found,
        withheld=withheld,
    )


def _truncate(pages: list[str], limit: int) -> tuple[list[str], bool]:
    kept: list[str] = []
    total = 0
    for page in pages:
        if total + len(page) > limit:
            room = limit - total
            if room > 0:
                cut = page[:room].rsplit(" ", 1)[0]
                kept.append(cut)
            return kept, True
        kept.append(page)
        total += len(page)
    return kept, False


def _today() -> date:
    return datetime.now(UTC).date()


def _message_text(message: NotebookMessage) -> str:
    if message.role == "user":
        return str(message.content.get("text") or "")
    paragraphs = message.content.get("paragraphs") or []
    return " ".join(str(p.get("text") or "") for p in paragraphs)


def _message_out(message: NotebookMessage) -> MessageOut:
    if message.role == "user":
        return MessageOut(
            id=message.id,
            role="user",
            created_at=message.created_at,
            text=str(message.content.get("text") or ""),
        )
    return MessageOut(
        id=message.id,
        role="assistant",
        created_at=message.created_at,
        answer=AnswerOut.model_validate(message.content),
    )


def _source_out(source: NotebookSource) -> SourceOut:
    meta = source.meta
    return SourceOut(
        id=source.id,
        kind=source.kind,
        title=source.title,
        origin=source.origin,
        status=source.status,
        error=source.error,
        char_count=source.char_count,
        page_count=source.page_count,
        selected=source.selected,
        truncated=source.truncated,
        created_at=source.created_at,
        url=_meta_text(meta, "url"),
        attribution=_meta_text(meta, "attribution"),
        license=_meta_text(meta, "license"),
        details=_source_details(meta),
    )


def _meta_text(meta: dict | None, key: str) -> str | None:
    """A text field of a source's ``meta``, or ``None`` — never ``""``, which
    the screen would draw as a link or a credit that says nothing."""
    if not isinstance(meta, dict):
        return None
    value = meta.get(key)
    if not isinstance(value, str) or not value.strip():
        return None
    return value.strip()


def _source_details(meta: dict | None) -> dict[str, Any] | None:
    """The curated part of ``meta`` the screen shows (``SOURCE_DETAIL_KEYS``).

    Only keys with a value: an absent year is absent, never ``null`` or ``""``
    the screen could print as a value (D-24). ``None`` when nothing is left.
    """
    if not isinstance(meta, dict):
        return None
    details = {
        key: meta[key]
        for key in SOURCE_DETAIL_KEYS
        if meta.get(key) is not None and meta.get(key) != "" and meta.get(key) != []
    }
    return details or None


def _note_out(note: NotebookNote) -> NoteOut:
    return NoteOut(
        id=note.id,
        title=note.title,
        body=note.body,
        origin=note.origin,
        citations=(
            [CitationOut.model_validate(c) for c in note.citations] if note.citations else None
        ),
        created_at=note.created_at,
        updated_at=note.updated_at,
    )
