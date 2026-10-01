"""Ingestion: discover documents, catalogue them, extract and split their text.

The run is **idempotent by checksum**. A document whose bytes are unchanged is
skipped without being re-read; one whose bytes changed has its passages replaced
rather than added to. Running the ingestion twice therefore costs one directory
walk and produces no duplicates — which is what makes "atualize o Cérebro" a
safe thing to say twice.

Failure is per document, never per run. A PDF that cannot be parsed is recorded
with ``FALHOU`` and the reason, and the walk continues: one broken file in a
corpus of a hundred should cost that file, not the other ninety-nine.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import Settings
from app.config import settings as default_settings
from app.domain.errors import ValidationError
from app.knowledge.chunking import chunk_text
from app.knowledge.embeddings import EmbeddingClient, EmbeddingUnavailableError
from app.knowledge.lexical import fold
from app.knowledge.manifest import MANIFEST_FILENAME, DeclaredProvenance, load_manifest
from app.knowledge.readers import MARKDOWN_EXTENSIONS, SUPPORTED_EXTENSIONS, extract_text
from app.knowledge.removal import REMOVAL_LIST_FILENAME, load_from_root, normalise
from app.models.enums import IngestStatus
from app.models.knowledge import KnowledgeChunk, KnowledgeDocument
from app.repositories.knowledge_repository import KnowledgeRepository

#: Read in blocks so a 150 MB textbook never lands in memory whole just to be
#: fingerprinted.
_HASH_BLOCK = 1024 * 1024

#: Files that run the corpus rather than belong to it, compared by name
#: (case-insensitive) at any depth. Never ingested — not even when a manifest
#: entry names one by mistake: a README describes the folder, and indexing it
#: would let the RAG cite the repository's housekeeping as a reference.
OPERATIONAL_FILES = frozenset(
    name.lower() for name in ("README.md", MANIFEST_FILENAME, REMOVAL_LIST_FILENAME)
)


@dataclass
class DocumentOutcome:
    """What happened to one document in an ingestion run."""

    path: str
    action: str  # "criado" | "atualizado" | "inalterado" | "falhou" | "ignorado"
    chunk_count: int = 0
    detail: str | None = None


@dataclass
class IngestReport:
    """Everything one run did, in the shape the operator needs to audit it."""

    root: str
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    failed: int = 0
    skipped: int = 0
    total_chunks: int = 0
    embedded_chunks: int = 0
    embeddings_skipped_reason: str | None = None
    outcomes: list[DocumentOutcome] = field(default_factory=list)
    #: Removal-list entries that look wrong against this corpus (a folder
    #: written without its trailing ``/``) — said, never silently ignored.
    removal_list_warnings: list[str] = field(default_factory=list)

    def record(self, outcome: DocumentOutcome) -> None:
        self.outcomes.append(outcome)
        counter = {
            "criado": "created",
            "atualizado": "updated",
            "inalterado": "unchanged",
            "falhou": "failed",
            "ignorado": "skipped",
        }[outcome.action]
        setattr(self, counter, getattr(self, counter) + 1)
        self.total_chunks += outcome.chunk_count


def checksum_of(path: Path) -> str:
    """SHA-256 of a file's bytes, read in blocks."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while block := handle.read(_HASH_BLOCK):
            digest.update(block)
    return digest.hexdigest()


class KnowledgeService:
    """Discovery and ingestion of the curated reference corpus."""

    def __init__(self, db: Session, settings: Settings = default_settings) -> None:
        self.db = db
        self.settings = settings
        self.repo = KnowledgeRepository(db)

    # --- discovery ---------------------------------------------------------

    def root(self) -> Path:
        """The configured corpus root.

        Raises:
            ValidationError: the layer is disabled or the directory is missing.
                Both are configuration states the operator can fix, and saying
                which one it is costs nothing.
        """
        if not self.settings.knowledge_enabled:
            raise ValidationError(
                "A base de conhecimento está desligada: defina KNOWLEDGE_DIR para ativá-la."
            )
        root = Path(self.settings.knowledge_dir).expanduser()
        if not root.is_dir():
            raise ValidationError(f"KNOWLEDGE_DIR não é um diretório: {root}")
        return root

    def discover(self, declared: dict[str, DeclaredProvenance] | None = None) -> list[Path]:
        """Every file to ingest under the root, in a stable order.

        A PDF is ingested wherever it sits. A Markdown file only when the
        manifest declares it (D-100): the corpus folder also holds Markdown
        that runs the repository — its README — and a whitelist means a note
        dropped into the folder does not become a citable source by accident.
        Operational files (:data:`OPERATIONAL_FILES`) are never ingested.

        A symbolic link is never followed, and neither is anything that
        resolves outside the root: the corpus is what sits in the folder, and a
        committed link to ``/etc`` or to another checkout would otherwise turn
        a file nobody declared into a citable source.

        Sorted so two runs on the same corpus assign the same ordinals — a
        directory walk's native order is not guaranteed across platforms, and an
        unstable one would make every run look like a change.
        """
        root = self.root()
        if declared is None:
            declared = load_manifest(root)
        declared_paths = {normalise(path) for path in declared}
        resolved_root = root.resolve()
        found = []
        for path in root.rglob("*"):
            suffix = path.suffix.lower()
            if not path.is_file() or suffix not in SUPPORTED_EXTENSIONS:
                continue
            if path.is_symlink() or not path.resolve().is_relative_to(resolved_root):
                continue
            if path.name.lower() in OPERATIONAL_FILES:
                continue
            relative = path.relative_to(root).as_posix()
            if suffix in MARKDOWN_EXTENSIONS and normalise(relative) not in declared_paths:
                continue
            found.append(path)
        return sorted(found, key=lambda p: p.relative_to(root).as_posix())

    def resolve_targets(
        self,
        targets: list[str | Path],
        declared: dict[str, DeclaredProvenance] | None = None,
    ) -> list[Path]:
        """Resolve and validate an explicit list of target paths under root.

        Used when indexing specific files (e.g. ``Links.md``) without walking
        the entire corpus or touching files that lack local content.
        """
        root = self.root()
        if declared is None:
            declared = load_manifest(root)
        declared_paths = {normalise(path) for path in declared}
        resolved_root = root.resolve()

        resolved: list[Path] = []
        seen: set[Path] = set()
        for target in targets:
            target_path = Path(target)
            p = (
                (root / target_path).resolve()
                if not target_path.is_absolute()
                else target_path.resolve()
            )
            if not p.is_relative_to(resolved_root):
                raise ValidationError(f"Caminho fora de KNOWLEDGE_DIR: {target}")
            if p.is_symlink():
                raise ValidationError(f"Link simbólico não é suportado: {target}")
            if not p.is_file():
                raise ValidationError(f"Arquivo não encontrado em KNOWLEDGE_DIR: {target}")
            suffix = p.suffix.lower()
            if suffix not in SUPPORTED_EXTENSIONS:
                raise ValidationError(f"Extensão não suportada para extração: {suffix or target}")
            if p.name.lower() in OPERATIONAL_FILES:
                raise ValidationError(f"Arquivo operacional não pode ser ingerido: {target}")
            relative = p.relative_to(root).as_posix()
            if suffix in MARKDOWN_EXTENSIONS and normalise(relative) not in declared_paths:
                raise ValidationError(f"Markdown não declarado no manifesto: {relative}")
            if p not in seen:
                seen.add(p)
                resolved.append(p)

        return sorted(resolved, key=lambda p: p.relative_to(root).as_posix())

    def _embeddings_configured(self) -> bool:
        # Delegates to EmbeddingClient.configured — the one place that
        # decides this — rather than re-checking the raw settings here,
        # which used to skip the AI_BASE_URL fallback that
        # knowledge_embedding_base_url documents.
        return self._embedding_client().configured

    def _embedding_client(self) -> EmbeddingClient:
        return EmbeddingClient(self.settings)

    def _sync_embeddings(self, embed_client: EmbeddingClient, document: KnowledgeDocument) -> int:
        """Embed every chunk of ``document`` lacking a vector from the current model.

        Self-healing on purpose: a chunk already embedded with today's model is
        left alone; one embedded with a *different* model (or never embedded)
        gets a fresh vector — so turning embeddings on after the fact, or
        switching models, never needs ``force=True`` to backfill.
        """
        chunks = self.repo.list_chunks(document.id)
        stale = [
            c for c in chunks if c.embedding is None or c.embedding.model != embed_client.model
        ]
        if not stale:
            return 0
        vectors = embed_client.embed([c.text for c in stale])
        for chunk, vector in zip(stale, vectors, strict=True):
            self.repo.set_embedding(chunk.id, model=embed_client.model, vector=vector)
        return len(stale)

    # --- ingestion ---------------------------------------------------------

    def ingest(
        self, force: bool = False, paths: list[str | Path] | None = None
    ) -> IngestReport:
        """Catalogue and index every discovered or targeted document.

        Args:
            force: re-extract even when the checksum matches. For when the
                chunker changed, not the corpus.
            paths: when provided, restrict ingestion to only these specific paths
                relative to ``root``. Avoids directory walks and parsing files
                that may lack physical content in cloud environments.
        """
        root = self.root()
        declared = load_manifest(root)
        # What left the base stays out even if a forgotten local copy puts the
        # file back on disk: ingestion only adds, so without this check one
        # run from a stale folder would undo a removal (D-100). The list names
        # paths *and* the SHA-256 of every removed file, so a copy under
        # another name or folder is caught by its bytes.
        removed = load_from_root(root)
        report = IngestReport(root=str(root))
        report.removal_list_warnings = [
            f'"{entry}" é uma pasta ({below} arquivos dentro), mas a linha de '
            f'{REMOVAL_LIST_FILENAME} não termina em "/" e não casa nada.'
            for entry, below in removed.folder_like_exact_entries(
                p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()
            ).items()
        ]
        embed_client = self._embedding_client() if self._embeddings_configured() else None

        target_paths = (
            self.discover(declared)
            if paths is None
            else self.resolve_targets(paths, declared)
        )

        for path in target_paths:
            relative = path.relative_to(root).as_posix()
            # Hashed once here, and handed on, only when the list has content
            # entries: hashing is a full read of the file.
            digest = checksum_of(path) if removed.checksums else None
            reason = removed.match_reason(relative, digest)
            if reason is not None:
                report.record(self._skip(relative, reason))
                continue
            try:
                outcome = self._ingest_one(path, relative, declared.get(relative), force, digest)
            except ValidationError as exc:
                # One unreadable document costs that document, not the run.
                outcome = self._record_failure(relative, str(exc))
            report.record(outcome)

            if (
                embed_client is not None
                and outcome.action != "falhou"
                and report.embeddings_skipped_reason is None
            ):
                document = self.repo.get_by_path(relative)
                if document is not None:
                    try:
                        report.embedded_chunks += self._sync_embeddings(embed_client, document)
                    except EmbeddingUnavailableError as exc:
                        # One systemic failure (network, credential) is enough
                        # to know retrying per document would only waste time —
                        # recorded once, the lexical pass already succeeded.
                        report.embeddings_skipped_reason = str(exc)
        return report

    def _skip(self, relative: str, reason: str) -> DocumentOutcome:
        """The outcome of a file on the removal list, with what to do about it.

        A skipped file may still have a row from before the removal — in the
        author's local base, say. Skipping it leaves that row where it is
        (ingestion only adds), so the outcome says to run the prune.
        """
        detail = f"Na lista de remoção ({REMOVAL_LIST_FILENAME}), por {reason}; não é indexado."
        if self.repo.get_by_path(relative) is not None:
            detail += (
                " Ainda está na base desta execução: rode "
                "`python -m app.knowledge.prune --list <Cérebro/removidos.txt>` para tirá-lo."
            )
        return DocumentOutcome(path=relative, action="ignorado", detail=detail)

    def _ingest_one(
        self,
        path: Path,
        relative: str,
        provenance: DeclaredProvenance | None,
        force: bool,
        digest: str | None = None,
    ) -> DocumentOutcome:
        size = path.stat().st_size
        if size > self.settings.knowledge_max_document_bytes:
            raise ValidationError(
                f"Documento maior que o limite "
                f"({size} > {self.settings.knowledge_max_document_bytes} bytes)."
            )

        if digest is None:
            digest = checksum_of(path)
        document = self.repo.get_by_path(relative)

        if document is None:
            document = KnowledgeDocument(path=relative, title=relative, checksum="")
            self.repo.add(document)
            action = "criado"
        elif document.checksum == digest and document.status == IngestStatus.EXTRAIDO and not force:
            # Provenance may still have been edited in the manifest since the
            # last run; applying it is cheap and does not require re-reading the
            # file, so an unchanged document still ends up correctly described.
            self._apply_provenance(document, relative, provenance)
            return DocumentOutcome(
                path=relative, action="inalterado", chunk_count=document.chunk_count
            )
        else:
            action = "atualizado"

        self._apply_provenance(document, relative, provenance)
        document.checksum = digest
        document.byte_size = size

        extracted = extract_text(path)
        document.page_count = extracted.page_count

        if extracted.is_empty:
            # A scanned book is a real, common case. Recording it as an empty
            # extraction — rather than a failure — keeps the document
            # catalogued and says exactly why it contributes nothing.
            self.repo.replace_chunks(document.id, [])
            document.chunk_count = 0
            document.status = IngestStatus.FALHOU
            document.error = "Nenhum texto extraível (provavelmente digitalizado como imagem)."
            document.indexed_at = datetime.now(UTC)
            return DocumentOutcome(
                path=relative, action="falhou", detail=document.error, chunk_count=0
            )

        chunks = chunk_text(extracted)
        limit = self.settings.knowledge_max_chunks_per_document
        truncated = len(chunks) > limit
        if truncated:
            chunks = chunks[:limit]

        self.repo.replace_chunks(
            document.id,
            [
                KnowledgeChunk(
                    ordinal=chunk.ordinal,
                    text=chunk.text,
                    char_count=chunk.char_count,
                    page_start=chunk.page_start,
                    page_end=chunk.page_end,
                    heading=chunk.heading,
                    search_text=fold(chunk.text),
                )
                for chunk in chunks
            ],
        )
        document.chunk_count = len(chunks)
        document.status = IngestStatus.EXTRAIDO
        # Truncation is reported, never silent: a corpus that quietly indexed
        # half a book would answer confidently about the half it has.
        document.error = (
            f"Truncado em {limit} trechos; o documento rende mais." if truncated else None
        )
        document.indexed_at = datetime.now(UTC)

        return DocumentOutcome(
            path=relative,
            action=action,
            chunk_count=len(chunks),
            detail=document.error,
        )

    def _apply_provenance(
        self,
        document: KnowledgeDocument,
        relative: str,
        provenance: DeclaredProvenance | None,
    ) -> None:
        """Copy declared provenance onto a document, or leave it undeclared."""
        if provenance is None:
            # Title falls back to the filename because a document needs
            # *something* to be listed under; every judgement field keeps its
            # "nobody has said" default.
            if not document.title or document.title == document.path:
                document.title = Path(relative).stem
            return

        document.title = provenance.title or Path(relative).stem
        document.kind = provenance.kind
        document.authority = provenance.authority
        document.author = provenance.author
        document.reference = provenance.reference
        document.source_url = provenance.source_url
        document.licence_note = provenance.licence_note
        document.is_versioned = provenance.is_versioned

    def _record_failure(self, relative: str, reason: str) -> DocumentOutcome:
        """Persist a failed extraction so the corpus reports its own gaps."""
        document = self.repo.get_by_path(relative)
        if document is None:
            document = KnowledgeDocument(path=relative, title=Path(relative).stem, checksum="")
            self.repo.add(document)
        document.status = IngestStatus.FALHOU
        document.error = reason[:500]
        return DocumentOutcome(path=relative, action="falhou", detail=reason)
