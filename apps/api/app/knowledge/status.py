"""A snapshot of the Cérebro in the database: how much is indexed, and how much is left.

Run with::

    python -m app.knowledge.status
    python -m app.knowledge.status --model gemini-embedding-001 --dimensions 768

It only reads. It is the step the workflow "Base de conhecimento (Cérebro)"
prints after every action, and the one an operator runs once a week while the
nightly backfill works through the corpus — the lesson of D-71: a green job only
proves a script did not raise; the counts prove it did the right thing.

What it prints:

* documents by ingestion status, passages and their characters;
* stored vectors grouped by (model, dimensions), and — for the identity the
  query side uses (``--model``/``--dimensions``, defaulting to
  ``KNOWLEDGE_EMBEDDING_MODEL``/``KNOWLEDGE_EMBEDDING_DIMENSIONS``) — how many
  passages have a current vector and how many are still pending. Dimension 0
  means "any size of that model", the rule of
  :func:`app.knowledge.embeddings.embedding_matches`;
* the notebooks' vectors by identity (counts only: they are private);
* the database's size on disk and the six knowledge/notebook tables' — which is
  what a free database plan limits — or "indisponível no SQLite";
* rows the manifest does not declare, rows that are byte-identical copies of
  another row (the orphans the ingestion's ``CÓPIAS`` line points here for),
  rows whose file is no longer under ``KNOWLEDGE_DIR``, failed documents,
  documents whose newer version could not be read (``VERSÃO ANTERIOR``: the
  previous passages stay), PDFs indexed with pages left out (``PÁGINAS
  IGNORADAS``, with the count — D-101) and any other note on an indexed
  document (``AVISO``, e.g. truncation).

**The log is public.** A path is printed whole only when
``Cérebro/manifesto.json`` declares it; any other row is its top-level folder
plus a short checksum (:func:`app.knowledge.prune.redact`). The stored error of
an undeclared document is not printed either: an ``OSError`` carries the path.
No passage text, no vector, no key is ever read into the output.

Exit code 1 only when the database cannot be read or has no knowledge tables;
everything else — pending vectors, failed documents — is a fact to report, not
a failure of this command.
"""

from __future__ import annotations

import argparse
import sys
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import Settings
from app.config import settings as default_settings
from app.db.base import SessionLocal
from app.domain.errors import ValidationError
from app.knowledge.manifest import load_manifest
from app.knowledge.prune import ROOT_FOLDER, knowledge_tables_present, redact
from app.knowledge.service import KEPT_PREVIOUS_PREFIX, skipped_pages_in
from app.models.enums import IngestStatus
from app.repositories.knowledge_repository import KnowledgeRepository
from app.repositories.knowledge_status_repository import (
    DatabaseSize,
    DocumentRow,
    KnowledgeStatusRepository,
    VectorGroup,
)

PREFIX = "[status]"

#: Storage of Neon's free plan (0.5 GB), the reference the size line is read
#: against. A reference, not a rule: the plan is the operator's, and the line
#: says so.
FREE_PLAN_BYTES = 512 * 1024 * 1024
#: Share of that reference past which the size line becomes a warning.
WARN_SHARE = 0.8
#: Individual lines per list before the rest is summarised as a count.
MAX_LISTED = 50
#: Stored error text is cut here — enough to read the reason.
MAX_ERROR_CHARS = 300

_STATUS_LABELS: dict[str, str] = {
    IngestStatus.EXTRAIDO.value: "extraídos",
    IngestStatus.FALHOU.value: "falharam",
    IngestStatus.PENDENTE.value: "pendentes",
    IngestStatus.IGNORADO.value: "ignorados",
}


def _nfc(path: str) -> str:
    return unicodedata.normalize("NFC", path)


@dataclass(frozen=True)
class Coverage:
    """How many passages have a vector of the configured identity."""

    model: str
    dimensions: int
    total: int
    current: int
    pending: int


@dataclass
class KnowledgeStatus:
    """Everything the snapshot prints, gathered in one pass over the database."""

    dialect: str
    documents: list[DocumentRow]
    chunks: int
    characters: int
    vector_groups: list[VectorGroup]
    #: ``None`` when the notebook tables do not exist in this database.
    notebook_groups: list[VectorGroup] | None
    #: ``None`` when no embedding model is configured.
    coverage: Coverage | None
    #: ``None`` where the database cannot say (SQLite).
    size: DatabaseSize | None
    #: Manifest-declared paths, in NFC.
    declared: frozenset[str] = frozenset()
    #: Why no path counts as declared, when that is the case.
    manifest_note: str | None = None
    #: Rows whose file is not under ``KNOWLEDGE_DIR``; ``None`` = not checked.
    missing_on_disk: list[DocumentRow] | None = None
    by_status: Counter[str] = field(default_factory=Counter)

    def is_declared(self, path: str) -> bool:
        return _nfc(path) in self.declared

    def shown(self, row: DocumentRow) -> str:
        """A row's path as a public log may print it."""
        return row.path if self.is_declared(row.path) else redact(row.path, row.checksum)


def _declared_paths(root: Path | None) -> tuple[frozenset[str], str | None]:
    """The manifest's paths, or none with the reason — never a crash.

    Without them every row is printed redacted, which is the safe direction.
    """
    if root is None:
        return frozenset(), "KNOWLEDGE_DIR não definido: todo caminho sai abreviado."
    try:
        declared = load_manifest(root)
    except ValidationError as exc:
        return frozenset(), f"manifesto ilegível ({exc}): todo caminho sai abreviado."
    if not declared:
        return frozenset(), "sem manifesto em KNOWLEDGE_DIR: todo caminho sai abreviado."
    return frozenset(_nfc(path) for path in declared), None


def _exists_under(root: Path, path: str) -> bool:
    """Whether ``path`` is under ``root`` in any Unicode spelling.

    A path stored from a macOS disk may be NFD while the checkout is NFC; the
    file is the same, and calling it missing would send someone to prune it.
    """
    return any(
        (root / spelling).exists()
        for spelling in {path, _nfc(path), unicodedata.normalize("NFD", path)}
    )


def collect(
    db: Session,
    *,
    model: str,
    dimensions: int,
    root: Path | None = None,
) -> KnowledgeStatus:
    """Read the snapshot. ``root`` is ``KNOWLEDGE_DIR``, when there is one."""
    stats = KnowledgeStatusRepository(db)
    documents = stats.documents()
    chunks, characters = stats.chunk_totals()

    coverage = None
    if model:
        total, current, pending = KnowledgeRepository(db).embedding_totals(model, dimensions)
        coverage = Coverage(model, dimensions, total, current, pending)

    declared, note = _declared_paths(root)
    missing = None
    if root is not None and root.is_dir():
        missing = [row for row in documents if not _exists_under(root, row.path)]

    return KnowledgeStatus(
        dialect=stats.dialect,
        documents=documents,
        chunks=chunks,
        characters=characters,
        vector_groups=stats.knowledge_vector_groups(),
        notebook_groups=(
            stats.notebook_vector_groups() if stats.notebook_tables_present() else None
        ),
        coverage=coverage,
        size=stats.database_size(),
        declared=declared,
        manifest_note=note,
        missing_on_disk=missing,
        by_status=Counter(row.status for row in documents),
    )


# --- formatting ---------------------------------------------------------------


def _decimal(value: float) -> str:
    return f"{value:.1f}".replace(".", ",")


def _percent(part: int, whole: int) -> str:
    return _decimal(100.0 * part / whole if whole else 0.0)


def _mb(size: int) -> str:
    return f"{_decimal(size / (1024 * 1024))} MB"


def _dims(dimensions: int) -> str:
    return "dimensão nativa do modelo" if dimensions == 0 else f"{dimensions} dimensões"


def _groups(groups: list[VectorGroup]) -> str:
    return "; ".join(f"{g.model} com {g.dimensions} dimensões: {g.count}" for g in groups)


def _folder(path: str) -> str:
    head, sep, _ = path.partition("/")
    return head if sep else ROOT_FOLDER


def _capped(lines: list[str], what: str) -> list[str]:
    if len(lines) <= MAX_LISTED:
        return lines
    rest = len(lines) - MAX_LISTED
    return [*lines[:MAX_LISTED], f"{PREFIX}   … e mais {rest} {what}."]


def copies_of(status: KnowledgeStatus) -> list[tuple[DocumentRow, DocumentRow]]:
    """``(orphan, kept)`` for every row whose content another row also holds.

    The kept row is chosen as the ingestion chooses
    (``KnowledgeService._canonical_copies``): the declared path, else the copy
    already extracted, else the first in sorted order. Rows without a checksum
    (a document that never read) share nothing.
    """
    by_digest: dict[str, list[DocumentRow]] = defaultdict(list)
    for row in status.documents:
        if row.checksum:
            by_digest[row.checksum].append(row)
    pairs: list[tuple[DocumentRow, DocumentRow]] = []
    for rows in by_digest.values():
        if len(rows) < 2:
            continue
        ordered = sorted(rows, key=lambda r: r.path)
        # min() keeps the first of equal keys, so sorted order breaks ties.
        kept = min(
            ordered,
            key=lambda r: (not status.is_declared(r.path), r.status != IngestStatus.EXTRAIDO.value),
        )
        pairs.extend((row, kept) for row in ordered if row is not kept)
    return sorted(pairs, key=lambda pair: pair[0].path)


def _size_lines(size: DatabaseSize | None, dialect: str) -> list[str]:
    if size is None:
        where = "no SQLite" if dialect == "sqlite" else f"em {dialect}"
        return [f"{PREFIX} tamanho do banco: indisponível {where}."]
    tables = ", ".join(f"{name} {_mb(n)}" for name, n in size.tables.items())
    lines = [
        f"{PREFIX} tamanho do banco: {_mb(size.total_bytes)} "
        f"(referência: 0,5 GB no plano gratuito do Neon). Por tabela, com índices: {tables}."
    ]
    if size.total_bytes > WARN_SHARE * FREE_PLAN_BYTES:
        lines.append(
            f"::warning::{PREFIX} o banco ocupa {_mb(size.total_bytes)}, "
            f"mais de {int(WARN_SHARE * 100)}% de 0,5 GB. Confira o plano do Neon "
            f"antes de gerar mais vetores."
        )
    return lines


def format_status(status: KnowledgeStatus) -> list[str]:
    """The lines the CLI prints — safe for a public log."""
    docs = status.documents
    breakdown = ", ".join(
        f"{status.by_status.get(value, 0)} {label}" for value, label in _STATUS_LABELS.items()
    )
    average = status.characters // status.chunks if status.chunks else 0
    lines = [
        f"{PREFIX} documentos: {len(docs)} ({breakdown}).",
        f"{PREFIX} trechos: {status.chunks}, com {status.characters} caracteres "
        f"(média de {average} por trecho).",
    ]

    stored = sum(g.count for g in status.vector_groups)
    if status.vector_groups:
        lines.append(f"{PREFIX} vetores gravados: {stored} — {_groups(status.vector_groups)}.")
    else:
        lines.append(f"{PREFIX} vetores gravados: 0.")

    cov = status.coverage
    if cov is None:
        lines.append(
            f"{PREFIX} cobertura: nenhum modelo de embedding configurado "
            f"(KNOWLEDGE_EMBEDDING_MODEL ou --model); pendências não calculadas."
        )
    else:
        lines.append(
            f"{PREFIX} cobertura de {cov.model} ({_dims(cov.dimensions)}): {cov.current} de "
            f"{cov.total} trechos com vetor; faltam {cov.pending} "
            f"({_percent(cov.pending, cov.total)}%)."
        )

    if status.notebook_groups is None:
        lines.append(f"{PREFIX} cadernos: tabelas ausentes neste banco.")
    elif status.notebook_groups:
        total = sum(g.count for g in status.notebook_groups)
        line = f"{PREFIX} cadernos: {total} vetores — {_groups(status.notebook_groups)}."
        # A question is embedded at the configured identity; a stored vector of
        # another one is ignored (the source is then searched lexically only).
        if cov is not None:
            stale = sum(
                g.count
                for g in status.notebook_groups
                if g.model != cov.model or (cov.dimensions and g.dimensions != cov.dimensions)
            )
            if stale:
                line += (
                    f" {stale} de outra identidade que {cov.model} ({_dims(cov.dimensions)}) "
                    f"ficam fora da busca semântica: essas fontes são buscadas só por palavras."
                )
        lines.append(line)
    else:
        lines.append(f"{PREFIX} cadernos: 0 vetores.")

    lines.extend(_size_lines(status.size, status.dialect))

    # Manifest: declared rows are the ones whose path can be printed at all.
    if status.manifest_note:
        lines.append(f"{PREFIX} manifesto: {status.manifest_note}")
    undeclared = [row for row in docs if not status.is_declared(row.path)]
    declared_count = len(docs) - len(undeclared)
    if undeclared:
        folders = Counter(_folder(row.path) for row in undeclared)
        histogram = ", ".join(f"{name} ({n})" for name, n in sorted(folders.items()))
        lines.append(
            f"{PREFIX} fora do manifesto: {len(undeclared)} documentos na base "
            f"(declarados: {declared_count}) — por pasta: {histogram}."
        )
        lines.extend(
            _capped(
                [f"{PREFIX}   fora do manifesto: {status.shown(row)}" for row in undeclared],
                "fora do manifesto",
            )
        )
    else:
        lines.append(f"{PREFIX} fora do manifesto: 0 (declarados: {declared_count}).")

    pairs = copies_of(status)
    if pairs:
        lines.append(
            f"{PREFIX} cópias na base: {len(pairs)} documentos com o mesmo conteúdo de outro; "
            f"os trechos deles aparecem em dobro na busca."
        )
        lines.extend(
            _capped(
                [
                    f"{PREFIX} ÓRFÃO {status.shown(orphan)}: mesmo conteúdo de "
                    f"{status.shown(kept)}"
                    for orphan, kept in pairs
                ],
                "cópias",
            )
        )
    else:
        lines.append(f"{PREFIX} cópias na base: 0.")

    if status.missing_on_disk is None:
        lines.append(
            f"{PREFIX} arquivos em disco: não conferidos (KNOWLEDGE_DIR ausente ou não é uma pasta)."
        )
    elif status.missing_on_disk:
        lines.append(
            f"{PREFIX} fora do repositório: {len(status.missing_on_disk)} documentos na base "
            f"sem arquivo em KNOWLEDGE_DIR. A ingestão só acrescenta; se saíram de "
            f"propósito, quem os tira é o prune (D-100)."
        )
        lines.extend(
            _capped(
                [f"{PREFIX}   sem arquivo: {status.shown(row)}" for row in status.missing_on_disk],
                "sem arquivo",
            )
        )
    else:
        lines.append(f"{PREFIX} fora do repositório: 0.")

    for row in docs:
        if row.status == IngestStatus.FALHOU.value:
            lines.append(f"{PREFIX} FALHOU {status.shown(row)}: {_error(status, row)}")
    # An indexed document with a note is one of three things, and each has its
    # own label: a new version that could not be read (the old one answers), a
    # PDF indexed with pages left out (D-101), or anything else said about an
    # indexed document (truncation). Calling the second "versão anterior" told
    # the operator a new version had failed when the only version had gaps.
    noted = [r for r in docs if r.status == IngestStatus.EXTRAIDO.value and r.error]
    partial = [(r, skipped_pages_in(r.error)) for r in noted]
    partial = [(r, counts) for r, counts in partial if counts is not None]
    lines.append(
        f"{PREFIX} páginas ignoradas: {len(partial)} documentos indexados com páginas "
        f"de fora ({sum(counts[0] for _, counts in partial)} páginas no total)."
        + (
            " Reextraia com `ingerir` + `arquivos` + `forcar` depois de corrigir a causa."
            if partial
            else ""
        )
    )
    for row in noted:
        counts = skipped_pages_in(row.error)
        if (row.error or "").startswith(KEPT_PREVIOUS_PREFIX):
            label = "VERSÃO ANTERIOR"
            kept = f"{row.chunk_count} trechos mantidos"
        elif counts is not None:
            label = "PÁGINAS IGNORADAS"
            kept = f"{counts[0]} de {counts[1]} páginas de fora, {row.chunk_count} trechos"
        else:
            label = "AVISO"
            kept = f"{row.chunk_count} trechos"
        lines.append(f"{PREFIX} {label} {status.shown(row)} ({kept}): {_error(status, row)}")
    return lines


def _error(status: KnowledgeStatus, row: DocumentRow) -> str:
    """The stored reason — only for a declared path, whose name is public."""
    if not status.is_declared(row.path):
        return "motivo omitido (documento fora do manifesto: o texto do erro pode citar o caminho)."
    reason = (row.error or "sem motivo registrado").strip()
    return reason if len(reason) <= MAX_ERROR_CHARS else reason[: MAX_ERROR_CHARS - 1] + "…"


# --- CLI ----------------------------------------------------------------------


def _non_negative_int(value: str) -> int:
    number = int(value)
    if number < 0:
        raise argparse.ArgumentTypeError("precisa ser um inteiro maior ou igual a 0")
    return number


def _parse(argv: list[str], settings: Settings) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m app.knowledge.status",
        description="Retrato da base de conhecimento no banco. Só lê.",
    )
    parser.add_argument(
        "--model",
        default=settings.knowledge_embedding_model.strip(),
        help="modelo de embedding cuja cobertura se mede (padrão: KNOWLEDGE_EMBEDDING_MODEL)",
    )
    parser.add_argument(
        "--dimensions",
        type=_non_negative_int,
        default=max(0, settings.knowledge_embedding_dimensions),
        help=(
            "dimensões desse modelo; 0 aceita qualquer tamanho "
            "(padrão: KNOWLEDGE_EMBEDDING_DIMENSIONS)"
        ),
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None, *, settings: Settings = default_settings) -> None:
    """Print the snapshot; exit 1 only when the database cannot be read."""
    args = _parse(argv if argv is not None else [], settings)
    root_setting = settings.knowledge_dir.strip()
    root = Path(root_setting).expanduser() if root_setting else None
    try:
        with SessionLocal() as db:
            if not knowledge_tables_present(db):
                print(
                    f"::error::{PREFIX} as tabelas da base de conhecimento não existem neste "
                    f"banco. Rode as migrações (ação `migrar` do workflow Administração do "
                    f"banco) e repita."
                )
                sys.exit(1)
            # Nothing is written: closing the session rolls the read back.
            status = collect(db, model=args.model.strip(), dimensions=args.dimensions, root=root)
    except SQLAlchemyError as exc:
        # The class name only: a driver message can carry the database host.
        print(
            f"::error::{PREFIX} não consegui ler o banco ({type(exc).__name__}). Confira o "
            f"secret DATABASE_URL e se o banco está no ar."
        )
        sys.exit(1)

    for line in format_status(status):
        print(line)


if __name__ == "__main__":
    main(sys.argv[1:])
