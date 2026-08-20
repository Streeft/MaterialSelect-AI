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
from app.knowledge.manifest import DeclaredProvenance, load_manifest
from app.knowledge.readers import SUPPORTED_EXTENSIONS, extract_text
from app.models.enums import IngestStatus
from app.models.knowledge import KnowledgeChunk, KnowledgeDocument
from app.repositories.knowledge_repository import KnowledgeRepository

#: Read in blocks so a 150 MB textbook never lands in memory whole just to be
#: fingerprinted.
_HASH_BLOCK = 1024 * 1024


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
    outcomes: list[DocumentOutcome] = field(default_factory=list)

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

    def discover(self) -> list[Path]:
        """Every supported file under the root, in a stable order.

        Sorted so two runs on the same corpus assign the same ordinals — a
        directory walk's native order is not guaranteed across platforms, and an
        unstable one would make every run look like a change.
        """
        root = self.root()
        found = [
            path
            for path in root.rglob("*")
            if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
        ]
        return sorted(found, key=lambda p: p.relative_to(root).as_posix())

    # --- ingestion ---------------------------------------------------------

    def ingest(self, force: bool = False) -> IngestReport:
        """Catalogue and index every discovered document.

        Args:
            force: re-extract even when the checksum matches. For when the
                chunker changed, not the corpus.
        """
        root = self.root()
        declared = load_manifest(root)
        report = IngestReport(root=str(root))

        for path in self.discover():
            relative = path.relative_to(root).as_posix()
            try:
                report.record(self._ingest_one(path, relative, declared.get(relative), force))
            except ValidationError as exc:
                # One unreadable document costs that document, not the run.
                report.record(self._record_failure(relative, str(exc)))
        return report

    def _ingest_one(
        self,
        path: Path,
        relative: str,
        provenance: DeclaredProvenance | None,
        force: bool,
    ) -> DocumentOutcome:
        size = path.stat().st_size
        if size > self.settings.knowledge_max_document_bytes:
            raise ValidationError(
                f"Documento maior que o limite "
                f"({size} > {self.settings.knowledge_max_document_bytes} bytes)."
            )

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
