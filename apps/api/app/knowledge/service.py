"""Ingestion: discover documents, catalogue them, extract and split their text.

The run is **idempotent by checksum**. A document whose bytes are unchanged is
skipped without being re-read; one whose bytes changed has its passages replaced
rather than added to. Running the ingestion twice therefore costs one directory
walk and produces no duplicates — which is what makes "atualize o Cérebro" a
safe thing to say twice.

Failure is per document, never per run. A PDF that cannot be parsed is recorded
with ``FALHOU`` and the reason, and the walk continues: one broken file in a
corpus of a hundred should cost that file, not the other ninety-nine. That holds
for the database too: each document is written inside its own savepoint, so a
write the database refuses rolls back that document alone — its previous
passages included — and the run goes on (:meth:`KnowledgeService._ingest_one`).

And a failure never costs what the base already had. A new version of an
indexed document is read *before* anything about the document is touched, so a
version that cannot be read (or holds no text) leaves the previous passages,
vectors and checksum where they were and only says so in ``error``. A Git LFS
pointer checked out in place of the file is refused before the catalogue is
even looked up — a checkout without ``git lfs pull`` must not be able to empty
the base — unless its ``oid`` (the file's SHA-256) is what that very path
already has indexed: then it is unchanged, and needs no download
(:meth:`KnowledgeService.lfs_plan` lists the pointers a run does need). And
byte-identical copies of one file under several paths are indexed
once: the corpus carries whole folders twice, and each copy would otherwise
double its passages, its embedding cost and its weight in every ranking.
"""

from __future__ import annotations

import hashlib
import os
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from pathlib import Path

from sqlalchemy.exc import DBAPIError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import Settings
from app.config import settings as default_settings
from app.domain.errors import ValidationError
from app.knowledge.chunking import chunk_text
from app.knowledge.embeddings import (
    EmbeddingClient,
    EmbeddingUnavailableError,
    embedding_matches,
)
from app.knowledge.lexical import fold
from app.knowledge.manifest import MANIFEST_FILENAME, DeclaredProvenance, load_manifest
from app.knowledge.readers import (
    MARKDOWN_EXTENSIONS,
    SUPPORTED_EXTENSIONS,
    extract_text,
    storable_text,
)
from app.knowledge.removal import (
    REMOVAL_LIST_FILENAME,
    RemovalList,
    load_from_root,
    normalise,
)
from app.models.enums import IngestStatus
from app.models.knowledge import KnowledgeChunk, KnowledgeDocument
from app.repositories.knowledge_repository import KnowledgeRepository

#: Read in blocks so a 150 MB textbook never lands in memory whole just to be
#: fingerprinted.
_HASH_BLOCK = 1024 * 1024

#: First bytes of a Git LFS pointer file (the spec's mandatory first line).
LFS_POINTER_PREFIX = b"version https://git-lfs.github.com/spec/"
#: A pointer is a few lines of text; the spec caps it well below this.
LFS_POINTER_MAX_BYTES = 1024

#: The two lines of a pointer that name the file it stands for. The ``oid`` is
#: the SHA-256 of the file's bytes — exactly what ``knowledge_document.checksum``
#: stores — so a pointer says what it is a pointer *to* without being downloaded.
_POINTER_OID = re.compile(rb"^oid sha256:([0-9a-f]{64})\r?$", re.MULTILINE)
_POINTER_SIZE = re.compile(rb"^size ([0-9]+)\r?$", re.MULTILINE)

LFS_POINTER_DETAIL = (
    "É um ponteiro do Git LFS, não o arquivo: rode `git lfs pull` (ou `lfs: true`) "
    "e repita; nada deste documento foi alterado."
)
EMPTY_TEXT_REASON = "Nenhum texto extraível (provavelmente digitalizado como imagem)."
#: Why a document the database refused to store is ``falhou``. Only the error's
#: class is named: the driver's message quotes the SQL and its parameters —
#: the document's own text — and the Actions log is public.
WRITE_FAILED_REASON = (
    "O banco de dados recusou a gravação deste documento ({error}); nada desta "
    "versão foi gravado, e a execução seguiu com os outros."
)
#: What a refused write raises inside a document's savepoint. The encoding
#: error is the driver's own (``str.encode`` while binding a lone surrogate),
#: which SQLAlchemy does not wrap; ``storable_text`` already replaces
#: surrogates, so it is a second line, not the first. A *decode* error is not
#: here on purpose: that is a file that cannot be read, not a write refused.
_WRITE_ERRORS = (SQLAlchemyError, UnicodeEncodeError)
#: How much of a failure reason fits in ``error`` (String(500)) next to the
#: sentence saying the previous version was kept.
_REASON_BUDGET = 300

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
    #: SHA-256 of the file's bytes, so a public log can name the document
    #: without its file name (``app.knowledge.prune.redact``).
    checksum: str | None = None
    #: Whether ``Cérebro/manifesto.json`` declares this path. Only declared
    #: paths are printed whole in a public log.
    declared: bool = False
    #: The file opened but no page yielded text — a scanned book, most likely.
    #: Still a failure for the document; a warning, not an error, for the run.
    empty_text: bool = False
    #: A new version could not be read and the previous one stayed indexed.
    kept_previous: bool = False
    #: For a skipped byte-identical copy: the path that was indexed instead.
    duplicate_of: str | None = None
    #: A skipped path whose row from an earlier run is still in the base.
    still_in_base: bool = False


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
    #: Byte-identical copies skipped (also counted in ``skipped``).
    duplicates: int = 0
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
        if outcome.duplicate_of is not None:
            self.duplicates += 1
        self.total_chunks += outcome.chunk_count


def checksum_of(path: Path) -> str:
    """SHA-256 of a file's bytes, read in blocks."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while block := handle.read(_HASH_BLOCK):
            digest.update(block)
    return digest.hexdigest()


def is_lfs_pointer(path: Path, size: int | None = None) -> bool:
    """Whether ``path`` is a Git LFS pointer rather than the file it points to.

    A checkout made without ``git lfs pull`` leaves, in place of every PDF, a
    small text file naming the real one's hash. Read as a PDF it fails; left
    unchecked, that failure would be written over every indexed document.
    """
    if size is None:
        size = path.stat().st_size
    if size >= LFS_POINTER_MAX_BYTES:
        return False
    with path.open("rb") as handle:
        return handle.read(len(LFS_POINTER_PREFIX)) == LFS_POINTER_PREFIX


def lfs_pointer_target(path: Path) -> tuple[str, int] | None:
    """The ``(oid, size)`` a Git LFS pointer names, or ``None`` if it names none.

    Only meaningful for a file :func:`is_lfs_pointer` recognised; a pointer
    without a well-formed ``oid sha256:`` line is ``None`` and is treated as a
    file whose content is missing, as every pointer was before.
    """
    data = path.read_bytes()[:LFS_POINTER_MAX_BYTES]
    oid = _POINTER_OID.search(data)
    size = _POINTER_SIZE.search(data)
    if oid is None or size is None:
        return None
    return oid.group(1).decode("ascii"), int(size.group(1))


class TargetError(ValidationError):
    """A ``--file`` target that is not an ingestible file under the root.

    ``str()`` is the full message, path included — what the API and a local
    run show. ``position`` (1-based) and ``reason`` (the same message without
    the path) are what a public log prints instead (D-101): a name typed from
    memory may be exactly what the removal list exists to keep unpublished.
    """

    def __init__(self, position: int, reason: str, shown: str) -> None:
        super().__init__(f"{reason}: {shown}")
        self.position = position
        self.reason = reason


@dataclass(frozen=True)
class _Candidate:
    """One discovered file, fingerprinted before anything is written.

    For a Git LFS pointer with a well-formed ``oid``, ``digest`` is that oid —
    the SHA-256 of the file the pointer stands for, not of the pointer's own
    bytes — and ``pointer_size`` its declared size. So the removal list, the
    copy grouping and the "already indexed" check all see the real file, and a
    pointer to a document already indexed with those bytes needs no download.
    """

    path: Path
    relative: str
    size: int
    digest: str
    is_pointer: bool
    declared: bool
    removal_reason: str | None
    pointer_size: int | None = None

    @property
    def names_content(self) -> bool:
        """Real bytes, or a pointer that says which bytes it stands for."""
        return not self.is_pointer or self.pointer_size is not None


class _Action(Enum):
    """What a run does with one candidate — decided before anything is written."""

    REMOVED = "removed"
    COPY = "copy"
    #: A pointer to the bytes already indexed at this very path: nothing to read.
    UNCHANGED_POINTER = "unchanged_pointer"
    #: A pointer whose content the run would have to read: refused, unwritten.
    MISSING_CONTENT = "missing_content"
    INGEST = "ingest"


@dataclass(frozen=True)
class _Step:
    candidate: _Candidate
    action: _Action
    #: For ``COPY``: the path indexed instead.
    kept: str | None = None


@dataclass(frozen=True)
class _Prepared:
    root: Path
    declared: dict[str, DeclaredProvenance]
    removed: RemovalList
    steps: list[_Step]


@dataclass(frozen=True)
class LfsFetch:
    """One file the ingestion would have to read and only has as a pointer."""

    relative: str
    oid: str
    size: int
    #: Whether a row already exists at this path — a new version, or a
    #: document that failed before — rather than a document never seen.
    in_base: bool


@dataclass
class LfsPlan:
    """Which pointers a run needs downloaded, and why the others do not.

    Computed by the same decision the ingestion takes (:meth:`KnowledgeService
    ._prepare`), so after exactly ``fetch`` is downloaded no file the run reads
    is still a pointer — by construction, not by a second copy of the rules.
    """

    pointers: int = 0
    #: Pointers to the bytes already indexed (``EXTRAIDO``) at the same path.
    unchanged: int = 0
    #: Pointers to a copy of a file indexed (or downloaded) under another path.
    copies: int = 0
    #: Pointers on the removal list — never downloaded.
    removed: int = 0
    #: Pointers without a readable ``oid``: the run will refuse them.
    malformed: int = 0
    fetch: list[LfsFetch] = field(default_factory=list)

    @property
    def fetch_bytes(self) -> int:
        return sum(item.size for item in self.fetch)


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
        the entire corpus or touching files that lack local content. A target
        is relative to the root (or absolute inside it), and must be a file
        :meth:`discover` would have found: inside the root, reached without a
        symbolic link at any step, of a supported type, not operational, and —
        for Markdown — declared in the manifest. Any other target refuses the
        whole run before anything is written, naming the target: a typo must
        not turn into a run that quietly did less than was asked. The error is
        a :class:`TargetError`, which also carries the target's position, so a
        public log can say which one without printing it.

        Returns the paths as ``root / relative``, the same shape
        :meth:`discover` returns, so the rest of the run cannot tell them apart.
        """
        root = self.root()
        if declared is None:
            declared = load_manifest(root)
        declared_paths = {normalise(path) for path in declared}
        lexical_root = Path(os.path.normpath(root.absolute()))
        resolved_root = root.resolve()

        relatives: set[str] = set()
        for position, target in enumerate(targets, start=1):
            target_path = Path(target)
            joined = target_path if target_path.is_absolute() else root / target_path
            lexical = Path(os.path.normpath(joined.absolute()))
            resolved = joined.resolve()
            if not resolved.is_relative_to(resolved_root) or not lexical.is_relative_to(
                lexical_root
            ):
                raise TargetError(position, "Caminho fora de KNOWLEDGE_DIR", str(target))
            relative = resolved.relative_to(resolved_root).as_posix()
            # A link anywhere on the way makes the path written and the path
            # reached differ; discover() never follows one, and neither does this.
            if lexical.relative_to(lexical_root).as_posix() != relative:
                raise TargetError(position, "Link simbólico não é suportado", str(target))
            if not resolved.is_file():
                raise TargetError(position, "Arquivo não encontrado em KNOWLEDGE_DIR", str(target))
            suffix = resolved.suffix.lower()
            if suffix not in SUPPORTED_EXTENSIONS:
                raise TargetError(
                    position, "Extensão não suportada para extração", suffix or str(target)
                )
            if resolved.name.lower() in OPERATIONAL_FILES:
                raise TargetError(
                    position, "Arquivo operacional não pode ser ingerido", str(target)
                )
            if suffix in MARKDOWN_EXTENSIONS and normalise(relative) not in declared_paths:
                raise TargetError(position, "Markdown não declarado no manifesto", relative)
            relatives.add(relative)

        return [root / relative for relative in sorted(relatives)]

    def _embeddings_configured(self) -> bool:
        # Delegates to EmbeddingClient.configured — the one place that
        # decides this — rather than re-checking the raw settings here,
        # which used to skip the AI_BASE_URL fallback that
        # knowledge_embedding_base_url documents.
        return self._embedding_client().configured

    def _embedding_client(self) -> EmbeddingClient:
        return EmbeddingClient(self.settings)

    def _sync_embeddings(self, embed_client: EmbeddingClient, document: KnowledgeDocument) -> int:
        """Embed every chunk of ``document`` lacking a vector of the current identity.

        Self-healing on purpose: a chunk already embedded with today's model
        *and* dimension is left alone; one embedded with a different model or
        a different dimension (or never embedded) gets a fresh vector — so
        turning embeddings on after the fact, switching models or changing
        ``KNOWLEDGE_EMBEDDING_DIMENSIONS`` never needs ``force=True`` to
        backfill.
        """
        chunks = self.repo.list_chunks(document.id)
        stale = [
            c
            for c in chunks
            if c.embedding is None
            or not embedding_matches(c.embedding, embed_client.model, embed_client.dimensions)
        ]
        if not stale:
            return 0
        vectors = embed_client.embed([c.text for c in stale])
        for chunk, vector in zip(stale, vectors, strict=True):
            self.repo.set_embedding(chunk.id, model=embed_client.model, vector=vector)
        return len(stale)

    # --- ingestion ---------------------------------------------------------

    def ingest(
        self,
        force: bool = False,
        paths: list[str | Path] | None = None,
        *,
        embed: bool = True,
        on_document: Callable[[], None] | None = None,
    ) -> IngestReport:
        """Catalogue and index every discovered or targeted document.

        Args:
            force: re-extract even when the checksum matches. For when the
                chunker changed, not the corpus. It never lets an LFS pointer,
                a file on the removal list or a copy of an indexed file
                through: those decisions are taken before the checksum is even
                compared.
            paths: when provided, restrict ingestion to these files, relative
                to ``root`` (:meth:`resolve_targets`). The corpus is not
                walked, so a run that only needs ``Links.md`` does not need the
                PDFs on disk. Every guarantee of a full run still holds for the
                named files — removal list first, LFS pointer refused without a
                write, byte-identical copies indexed once. Since the rest of the
                corpus is not walked, "a copy elsewhere" is read from the
                database: a named file whose bytes are already indexed
                (``EXTRAIDO``) under another path that is still on disk is
                skipped as a copy of it, unless the named path is the one the
                manifest declares. A copy only on disk, never indexed, does not
                count — the operator asked for this path.
            embed: embed new passages in the same run when embeddings are
                configured. ``False`` never builds a client: the vectors are
                then the separate backfill's job (``python -m
                app.knowledge.embed``), paced against the provider's quota.
            on_document: called after each file is dealt with — the CLI passes
                ``db.commit`` so a long run keeps what it finished if it dies
                halfway. ``None`` (the API) leaves the transaction to the
                caller, as before — on PostgreSQL. On the plain dev SQLite
                engine (``app.db.base``, without the conftest's BEGIN recipe)
                pysqlite has not begun a transaction when the first document's
                ``SAVEPOINT`` is issued, so each ``RELEASE`` commits for real:
                there an API-driven ingestion is per document, not atomic.
        """
        prepared = self._prepare(force, paths)
        root, declared, removed = prepared.root, prepared.declared, prepared.removed
        report = IngestReport(root=str(root))
        report.removal_list_warnings = [
            f'"{entry}" é uma pasta ({below} arquivos dentro), mas a linha de '
            f'{REMOVAL_LIST_FILENAME} não termina em "/" e não casa nada.'
            for entry, below in removed.folder_like_exact_entries(
                p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()
            ).items()
        ]
        embed_client = self._embedding_client() if embed and self._embeddings_configured() else None

        for step in prepared.steps:
            candidate = step.candidate
            relative = candidate.relative
            if step.action is _Action.REMOVED:
                outcome = self._skip(relative, candidate.removal_reason or "")
            elif step.action is _Action.COPY:
                outcome = self._skip_copy(relative, step.kept or "")
            elif step.action is _Action.UNCHANGED_POINTER and (
                document := self.repo.get_by_path(relative)
            ):
                # The pointer names the bytes this path already has indexed:
                # what a real copy would get from the checksum shortcut, without
                # the file ever being downloaded.
                outcome = self._unchanged(document, relative, declared.get(relative))
            elif candidate.is_pointer:
                # Refused before the catalogue is looked up: nothing about the
                # document — row, passages, vectors, checksum — is touched.
                outcome = DocumentOutcome(path=relative, action="falhou", detail=LFS_POINTER_DETAIL)
            else:
                outcome = self._ingest_one(
                    candidate.path,
                    relative,
                    declared.get(relative),
                    force,
                    candidate.digest,
                    candidate.size,
                )
            outcome.checksum = candidate.digest
            outcome.declared = candidate.declared
            report.record(outcome)

            if (
                embed_client is not None
                and outcome.action not in ("falhou", "ignorado")
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
            if on_document is not None:
                on_document()
        return report

    def lfs_plan(self, force: bool = False, paths: list[str | Path] | None = None) -> LfsPlan:
        """Which Git LFS pointers :meth:`ingest` with the same arguments would read.

        Read-only. The workflow calls it before downloading anything, so a run
        fetches only the files the database does not already hold with those
        bytes — the pointer's ``oid`` is the file's SHA-256, the same digest
        ``knowledge_document.checksum`` stores. Pointers on the removal list,
        copies of a file indexed (or fetched) under another path, and pointers
        to the bytes already indexed at their own path are not fetched; the
        ingestion then reports the last as ``inalterado`` without reading them.
        A document that failed before (``FALHOU``) is fetched again, as its
        file is re-read on every run.
        """
        plan = LfsPlan()
        for step in self._prepare(force, paths).steps:
            candidate = step.candidate
            if not candidate.is_pointer:
                continue
            plan.pointers += 1
            if step.action is _Action.REMOVED:
                plan.removed += 1
            elif step.action is _Action.COPY:
                plan.copies += 1
            elif step.action is _Action.UNCHANGED_POINTER:
                plan.unchanged += 1
            elif candidate.pointer_size is None:
                plan.malformed += 1
            else:
                plan.fetch.append(
                    LfsFetch(
                        relative=candidate.relative,
                        oid=candidate.digest,
                        size=candidate.pointer_size,
                        in_base=self.repo.get_by_path(candidate.relative) is not None,
                    )
                )
        return plan

    def _prepare(self, force: bool, paths: list[str | Path] | None) -> _Prepared:
        """Fingerprint every file and decide what the run does with each one.

        Nothing is written. Every file is fingerprinted before any decision,
        because two of them need the whole set — which copy of a byte-identical
        group is indexed, and whether a file is an LFS pointer — and neither may
        be taken halfway through writing. :meth:`lfs_plan` reads the same
        decisions, which is what keeps "what to download" and "what the run
        reads" from ever disagreeing.
        """
        root = self.root()
        declared = load_manifest(root)
        declared_paths = {normalise(path) for path in declared}
        # What left the base stays out even if a forgotten local copy puts the
        # file back on disk: ingestion only adds, so without this check one
        # run from a stale folder would undo a removal (D-100). The list names
        # paths *and* the SHA-256 of every removed file, so a copy under
        # another name or folder is caught by its bytes — a pointer's too,
        # since its digest is the oid of the file it stands for.
        removed = load_from_root(root)
        targets = (
            self.discover(declared) if paths is None else self.resolve_targets(paths, declared)
        )

        candidates = []
        for path in targets:
            relative = path.relative_to(root).as_posix()
            size = path.stat().st_size
            is_pointer = is_lfs_pointer(path, size)
            pointed = lfs_pointer_target(path) if is_pointer else None
            digest = pointed[0] if pointed is not None else checksum_of(path)
            candidates.append(
                _Candidate(
                    path=path,
                    relative=relative,
                    size=size,
                    digest=digest,
                    is_pointer=is_pointer,
                    declared=normalise(relative) in declared_paths,
                    removal_reason=removed.match_reason(relative, digest),
                    pointer_size=pointed[1] if pointed is not None else None,
                )
            )
        kept_copy = self._canonical_copies(candidates)
        if paths is not None:
            kept_copy.update(self._indexed_elsewhere(root, removed, candidates, kept_copy))

        steps = []
        for candidate in candidates:
            relative = candidate.relative
            kept = kept_copy.get(candidate.digest) if candidate.names_content else None
            if candidate.removal_reason is not None:
                steps.append(_Step(candidate, _Action.REMOVED))
            elif kept is not None and kept != relative:
                steps.append(_Step(candidate, _Action.COPY, kept))
            elif candidate.is_pointer:
                unchanged = (
                    candidate.pointer_size is not None
                    and not force
                    and self._already_indexed(relative, candidate.digest)
                )
                action = _Action.UNCHANGED_POINTER if unchanged else _Action.MISSING_CONTENT
                steps.append(_Step(candidate, action))
            else:
                steps.append(_Step(candidate, _Action.INGEST))
        return _Prepared(root=root, declared=declared, removed=removed, steps=steps)

    def _canonical_copies(self, candidates: list[_Candidate]) -> dict[str, str]:
        """For each digest, the one path indexed among byte-identical copies.

        The manifest-declared path wins, because it is the one whose
        provenance was written down. With none (or several) declared, the copy
        already indexed with these bytes does: a new copy that happens to sort
        first must not be extracted and embedded again while the indexed one
        becomes an orphan row, both retrievable and the text counted twice.
        Only then the first in sorted order, so two runs pick the same one.

        A file on the removal list is not a candidate: the removal list must
        not be able to hide the surviving copy. A pointer is one when it names
        its oid — two pointers to one object are two copies of one file, and
        only the copy kept is ever downloaded; a pointer that names nothing is
        not, because its own bytes say nothing about the file.
        """
        groups: dict[str, list[_Candidate]] = {}
        for candidate in candidates:  # already in sorted order
            if candidate.removal_reason is not None or not candidate.names_content:
                continue
            groups.setdefault(candidate.digest, []).append(candidate)
        kept: dict[str, str] = {}
        for digest, members in groups.items():
            if len(members) == 1:  # the common case costs no query
                kept[digest] = members[0].relative
                continue
            # min() keeps the first of equal keys, so sorted order breaks ties.
            best = min(
                members,
                key=lambda c: (not c.declared, not self._already_indexed(c.relative, digest)),
            )
            kept[digest] = best.relative
        return kept

    def _indexed_elsewhere(
        self,
        root: Path,
        removed: RemovalList,
        candidates: list[_Candidate],
        kept_copy: dict[str, str],
    ) -> dict[str, str]:
        """For a targeted run: named files whose bytes are indexed under another path.

        A full run sees every copy on disk and keeps one; a targeted run sees
        only the named files, so the other copies are looked up in the
        database. A named file is skipped as a copy when its bytes are already
        indexed (``EXTRAIDO``) at another path that is still a file under the
        root and not on the removal list — the copy a full run would keep in
        its place. Not when the named path is the declared one (its provenance
        is the one written down), nor when it is itself already indexed with
        these bytes (it is not a new copy). A row whose file is gone is a file
        that moved: the named path is its new home, as in a full run.

        Returns ``{digest: kept path}`` overrides for :meth:`_prepare`.
        """
        overrides: dict[str, str] = {}
        for candidate in candidates:
            digest = candidate.digest
            if (
                candidate.removal_reason is not None
                or not candidate.names_content
                or kept_copy.get(digest) != candidate.relative
                or candidate.declared
                or self._already_indexed(candidate.relative, digest)
            ):
                continue
            others = [
                other
                for other in self.repo.indexed_paths_with_checksum(digest)
                if other != candidate.relative
                and not removed.matches(other)
                and (root / other).is_file()
                and not (root / other).is_symlink()
            ]
            if others:
                overrides[digest] = others[0]
        return overrides

    def _already_indexed(self, relative: str, digest: str) -> bool:
        document = self.repo.get_by_path(relative)
        return (
            document is not None
            and document.checksum == digest
            and document.status == IngestStatus.EXTRAIDO
        )

    def _unchanged(
        self,
        document: KnowledgeDocument,
        relative: str,
        provenance: DeclaredProvenance | None,
    ) -> DocumentOutcome:
        """The outcome of a document whose bytes are the ones already indexed.

        Provenance may still have been edited in the manifest since the last
        run; applying it is cheap and does not require re-reading the file, so
        an unchanged document still ends up correctly described.
        """
        self._apply_provenance(document, relative, provenance)
        return DocumentOutcome(path=relative, action="inalterado", chunk_count=document.chunk_count)

    def _skip(self, relative: str, reason: str) -> DocumentOutcome:
        """The outcome of a file on the removal list, with what to do about it.

        A skipped file may still have a row from before the removal — in the
        author's local base, say. Skipping it leaves that row where it is
        (ingestion only adds), so the outcome says to run the prune.
        """
        detail = f"Na lista de remoção ({REMOVAL_LIST_FILENAME}), por {reason}; não é indexado."
        in_base = self.repo.get_by_path(relative) is not None
        if in_base:
            detail += (
                " Ainda está na base desta execução: rode "
                "`python -m app.knowledge.prune --list <Cérebro/removidos.txt>` para tirá-lo."
            )
        return DocumentOutcome(
            path=relative, action="ignorado", detail=detail, still_in_base=in_base
        )

    def _skip_copy(self, relative: str, kept: str) -> DocumentOutcome:
        """The outcome of a byte-identical copy of a file indexed under ``kept``.

        A row left for this path by an earlier run is not deleted here —
        ingestion only adds — so the outcome says it is there.
        """
        detail = f"Cópia byte a byte de {kept}; indexada uma vez só."
        in_base = self.repo.get_by_path(relative) is not None
        if in_base:
            detail += " Este caminho ainda está na base; `status` lista esses órfãos."
        return DocumentOutcome(
            path=relative,
            action="ignorado",
            detail=detail,
            duplicate_of=kept,
            still_in_base=in_base,
        )

    def _ingest_one(
        self,
        path: Path,
        relative: str,
        provenance: DeclaredProvenance | None,
        force: bool,
        digest: str | None = None,
        size: int | None = None,
    ) -> DocumentOutcome:
        """Index one document inside its own savepoint.

        A write the database refuses — PostgreSQL's "text fields cannot
        contain NUL", a value too long for its column, a constraint — rolls
        back to the savepoint: this document's new row or its
        new passages go, the passages and vectors it already had come back,
        and the session stays usable for the next document and for the CLI's
        per-document commit. The document is then recorded ``falhou`` the way
        an unreadable version is (:meth:`_extraction_failed`), with
        :data:`WRITE_FAILED_REASON`.

        A connection the driver reports as lost is re-raised: no later
        document could be written either, and a run that continued would only
        print the same failure once per file.
        """
        if size is None:
            size = path.stat().st_size
        if digest is None:
            digest = checksum_of(path)
        try:
            with self.db.begin_nested():
                return self._index_one(path, relative, provenance, force, digest, size)
        except _WRITE_ERRORS as exc:
            if isinstance(exc, DBAPIError) and exc.connection_invalidated:
                raise
            return self._write_failed(relative, provenance, digest, size, exc)

    def _write_failed(
        self,
        relative: str,
        provenance: DeclaredProvenance | None,
        digest: str,
        size: int,
        exc: SQLAlchemyError | UnicodeEncodeError,
    ) -> DocumentOutcome:
        """Record a document whose write was rolled back, in a savepoint of its own.

        Read again after the rollback: a document this run created is gone,
        one that was indexed is back to what it had. If even this record is
        refused (by a value it shares with the refused write), nothing is
        written and the outcome alone says so.
        """
        # SQLAlchemy's own class (``DataError``, ``IntegrityError``) is the
        # same on every driver; a ``StatementError`` wrapping something else is
        # named by what it wraps. An encoding error raised by the driver while
        # binding (a lone surrogate, on psycopg and sqlite3 alike) is *not*
        # wrapped — SQLAlchemy reraises it as is — so it arrives here raw.
        cause = exc if isinstance(exc, DBAPIError) else (getattr(exc, "orig", None) or exc)
        reason = WRITE_FAILED_REASON.format(error=type(cause).__name__)
        try:
            with self.db.begin_nested():
                return self._extraction_failed(
                    self.repo.get_by_path(relative),
                    relative,
                    provenance,
                    digest,
                    size,
                    reason,
                    page_count=None,
                    stage="gravada",
                )
        except _WRITE_ERRORS as again:
            if isinstance(again, DBAPIError) and again.connection_invalidated:
                raise
            return DocumentOutcome(
                path=relative,
                action="falhou",
                detail=f"{reason} Nem a falha pôde ser registrada na base.",
            )

    def _index_one(
        self,
        path: Path,
        relative: str,
        provenance: DeclaredProvenance | None,
        force: bool,
        digest: str,
        size: int,
    ) -> DocumentOutcome:
        document = self.repo.get_by_path(relative)

        if (
            document is not None
            and document.checksum == digest
            and document.status == IngestStatus.EXTRAIDO
            and not force
        ):
            return self._unchanged(document, relative, provenance)

        # Read first, write after: until the new text is in hand, nothing about
        # the document changes, so a version that cannot be read never costs
        # the one that could.
        try:
            if size > self.settings.knowledge_max_document_bytes:
                raise ValidationError(
                    f"Documento maior que o limite "
                    f"({size} > {self.settings.knowledge_max_document_bytes} bytes)."
                )
            extracted = extract_text(path)
        except (ValidationError, OSError) as exc:
            # One unreadable document costs that document, not the run.
            return self._extraction_failed(
                document, relative, provenance, digest, size, str(exc), page_count=None
            )
        if extracted.is_empty:
            # A scanned book is a real, common case. Recording it as an empty
            # extraction — rather than a broken file — keeps the document
            # catalogued and says exactly why it contributes nothing.
            return self._extraction_failed(
                document,
                relative,
                provenance,
                digest,
                size,
                EMPTY_TEXT_REASON,
                page_count=extracted.page_count,
                empty_text=True,
            )

        chunks = chunk_text(extracted)
        limit = self.settings.knowledge_max_chunks_per_document
        truncated = len(chunks) > limit
        if truncated:
            chunks = chunks[:limit]

        if document is None:
            document = KnowledgeDocument(path=relative, title=relative, checksum="")
            self.repo.add(document)
            action = "criado"
        else:
            action = "atualizado"

        self._apply_provenance(document, relative, provenance)
        document.checksum = digest
        document.byte_size = size
        document.page_count = extracted.page_count
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

    def _extraction_failed(
        self,
        document: KnowledgeDocument | None,
        relative: str,
        provenance: DeclaredProvenance | None,
        digest: str,
        size: int,
        reason: str,
        *,
        page_count: int | None,
        empty_text: bool = False,
        stage: str = "lida",
    ) -> DocumentOutcome:
        """Record a version that could not be read, without losing the last one.

        An indexed document keeps everything the last readable version gave it
        — passages, vectors, checksum, size, page count, ``EXTRAIDO`` — and
        only ``error`` says the new bytes failed; the old checksum is what
        makes the next run try the file again. A document with nothing indexed
        (new, or failed before) is recorded ``FALHOU`` as it always was.

        ``stage`` is what failed — ``"lida"`` by default, ``"gravada"`` when
        the database refused the write (:meth:`_write_failed`). ``reason`` may
        quote a parser's message, which may quote the file's bytes; it is made
        storable before it is stored.
        """
        reason = storable_text(reason)
        if document is not None and document.status == IngestStatus.EXTRAIDO:
            self._apply_provenance(document, relative, provenance)
            motive = reason.strip().rstrip(".")[:_REASON_BUDGET]
            document.error = (
                f"A versão nova (sha256 {digest[:12]}) não pôde ser {stage}: {motive}. "
                "Os trechos da versão anterior continuam na base."
            )
            return DocumentOutcome(
                path=relative,
                action="falhou",
                detail=document.error,
                # What the base still answers from this document.
                chunk_count=document.chunk_count,
                empty_text=empty_text,
                kept_previous=True,
            )

        if document is None:
            document = KnowledgeDocument(path=relative, title=relative, checksum="")
            self.repo.add(document)
        self._apply_provenance(document, relative, provenance)
        document.checksum = digest
        document.byte_size = size
        if page_count is not None:
            document.page_count = page_count
        self.repo.replace_chunks(document.id, [])
        document.chunk_count = 0
        document.status = IngestStatus.FALHOU
        document.error = reason[:500]
        document.indexed_at = datetime.now(UTC)
        return DocumentOutcome(path=relative, action="falhou", detail=reason, empty_text=empty_text)

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
                document.title = storable_text(Path(relative).stem)
            return

        # The manifest is JSON, and JSON can spell U+0000 (``\u0000``).
        def text(value: str | None) -> str | None:
            return storable_text(value) if value is not None else None

        document.title = storable_text(provenance.title or Path(relative).stem)
        document.kind = provenance.kind
        document.authority = provenance.authority
        document.author = text(provenance.author)
        document.reference = text(provenance.reference)
        document.source_url = text(provenance.source_url)
        document.licence_note = text(provenance.licence_note)
        document.is_versioned = provenance.is_versioned
