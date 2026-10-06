"""Remove documents from the knowledge base by the removal list (D-100).

Run with::

    python -m app.knowledge.prune --list ../../Cérebro/removidos.txt           # simulação
    python -m app.knowledge.prune --list ../../Cérebro/removidos.txt --apply   # apaga
    python -m app.knowledge.prune --list ../../Cérebro/removidos.txt --redact  # log público

⚠️  With ``--apply`` this is irreversible, against whatever database
``DATABASE_URL`` points at — production, when it runs from the admin workflow.

Why it exists: the ingestion only ever adds. Deleting a file from ``Cérebro/``
leaves its ``knowledge_document`` row, its passages and its vectors exactly
where they were, and retrieval keeps citing them. Taking a document out of the
repository without running this takes it out of nowhere that matters to the RAG.

**Dry run is the default.** Without ``--apply`` the command lists every
matching document with its passage and vector counts and why it matched, the
totals, and the list entries that matched nothing, then rolls back. The same
output with ``--apply`` is the proof in the workflow log of what was deleted —
the lesson of D-71: a green job only proves the script did not raise, the
counts prove it did the right thing.

**A document matches by path or by content.** ``knowledge_document.path`` is
where the file sat on the disk that ingested it, which is not the git tree: a
course PDF ingested from a local triage folder has a path no list entry names.
Its checksum is the SHA-256 of its bytes, and the list carries the digest of
every removed file (``sha256:`` lines), so that copy matches all the same.

**And every run prints what stays.** Each remaining path, plus how many start
with each top-level folder — the base is a few hundred rows. A list written
against another layout otherwise looks complete: the matches it did find are
printed, and the ones it missed are silent. Reading what stays is how an
operator catches the second kind.

**The cascade is explicit, not left to ``ondelete``.** Both foreign keys are
``ondelete="CASCADE"`` and PostgreSQL would honour them, but the SQLite the
tests run on only does with ``PRAGMA foreign_keys=ON``, which the suite does not
turn on — trusting the schema would leave this correct in production and
unverifiable in a test (the reasoning of D-72's ``clear_demo.py``). So vectors,
then passages, then documents, in one transaction.

**``--redact`` is for a log other people can read.** The repository is
public, and so are its Actions logs; a stored path can carry exactly what the
removal exists to erase — a group assignment is named after its students. With
``--redact`` each document, matched or remaining, prints as its top-level folder
plus the first hex digits of its checksum (``02-Material-de-Curso-ENG02016/…
sha256:1a2b3c4d``), and root-level files are counted under ``(raiz)`` in the
histogram. Everything else stays — counts per document, why it matched, the
per-folder histogram and the totals —, because that is what proves the run did
the right thing (D-71). List entries (unmatched lines, a folder written without
its ``/``) are printed as written either way: they are lines of
``removidos.txt``, which is already public. Both admin-workflow actions pass
the flag; a local run without it prints the full paths.

It needs neither ``pypdf`` nor the corpus: it reads the list and talks to the
database, nothing else. The admin workflow installs neither.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import delete, func, inspect, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.base import SessionLocal
from app.domain.errors import ValidationError
from app.knowledge.removal import RemovalList, load_removal_list
from app.models.knowledge import KnowledgeChunk, KnowledgeDocument, KnowledgeEmbedding


@dataclass(frozen=True)
class MatchedDocument:
    """One document the list matched, with what deleting it takes along."""

    id: int
    path: str
    chunks: int
    embeddings: int
    #: ``"caminho"`` or ``"conteúdo (sha256)"`` — a content-only match is the
    #: copy the path entries would have missed, and the log should say so.
    reason: str = "caminho"
    #: SHA-256 of the file's bytes, as stored; only a redacted log prints it.
    checksum: str = ""


@dataclass
class PruneReport:
    """What a run found and — with ``applied`` — deleted."""

    applied: bool
    documents_in_base: int
    matched: list[MatchedDocument] = field(default_factory=list)
    #: Path entries that matched no document: a typo, or never ingested.
    unmatched_entries: list[str] = field(default_factory=list)
    #: Exact entries that are folders in the base, written without the ``/``.
    folder_like_entries: dict[str, int] = field(default_factory=dict)
    #: How many content (``sha256:``) entries the list has, and how many of
    #: them matched a stored document.
    checksum_entries: int = 0
    checksums_matched: int = 0
    #: Every path that is not matched — what stays in the base.
    remaining: list[str] = field(default_factory=list)
    #: How many *remaining* paths start with each top-level segment. Always
    #: printed: a list written against another layout than the one the base
    #: was ingested from shows up here as a folder nobody expected.
    top_level: dict[str, int] = field(default_factory=dict)
    #: Stored checksum of every remaining path, for the redacted log.
    remaining_checksums: dict[str, str] = field(default_factory=dict)

    @property
    def documents(self) -> int:
        return len(self.matched)

    @property
    def chunks(self) -> int:
        return sum(m.chunks for m in self.matched)

    @property
    def embeddings(self) -> int:
        return sum(m.embeddings for m in self.matched)


def find_matches(db: Session, removal: RemovalList) -> PruneReport:
    """Every document whose path the list matches, with its counts.

    Matching runs in Python and not in SQL on purpose: the Unicode
    normalisation that lets an NFD path match an NFC entry has no portable SQL
    spelling. The base is a few hundred documents; reading their paths is
    nothing.
    """
    rows = db.execute(
        select(KnowledgeDocument.id, KnowledgeDocument.path, KnowledgeDocument.checksum)
    ).all()
    hits: list[tuple[int, str, str, str]] = []
    remaining: dict[str, str] = {}
    for doc_id, path, checksum in rows:
        reason = removal.match_reason(path, checksum)
        if reason is None:
            remaining[path] = checksum or ""
        else:
            hits.append((doc_id, path, reason, checksum or ""))

    report = PruneReport(
        applied=False,
        documents_in_base=len(rows),
        remaining=sorted(remaining),
        top_level=dict(Counter(path.split("/")[0] for path in remaining)),
        remaining_checksums=remaining,
        checksum_entries=len(removal.checksums),
        checksums_matched=len(
            {c.strip().lower() for _, _, c in rows if removal.matches_checksum(c)}
        ),
        folder_like_entries=removal.folder_like_exact_entries(path for _, path, _ in rows),
    )
    report.unmatched_entries = [
        entry
        for entry in removal.entries
        if not any(removal.entry_matches(entry, path) for _, path, _ in rows)
    ]
    if not hits:
        return report

    ids = [doc_id for doc_id, _, _, _ in hits]
    chunk_counts = dict(
        db.execute(
            select(KnowledgeChunk.document_id, func.count(KnowledgeChunk.id))
            .where(KnowledgeChunk.document_id.in_(ids))
            .group_by(KnowledgeChunk.document_id)
        ).all()
    )
    embedding_counts = dict(
        db.execute(
            select(KnowledgeChunk.document_id, func.count(KnowledgeEmbedding.id))
            .join(KnowledgeEmbedding, KnowledgeEmbedding.chunk_id == KnowledgeChunk.id)
            .where(KnowledgeChunk.document_id.in_(ids))
            .group_by(KnowledgeChunk.document_id)
        ).all()
    )
    report.matched = sorted(
        (
            MatchedDocument(
                id=doc_id,
                path=path,
                chunks=chunk_counts.get(doc_id, 0),
                embeddings=embedding_counts.get(doc_id, 0),
                reason=reason,
                checksum=checksum,
            )
            for doc_id, path, reason, checksum in hits
        ),
        key=lambda m: m.path,
    )
    return report


def prune(db: Session, removal: RemovalList, *, apply: bool) -> PruneReport:
    """Find the matching documents and, when ``apply``, delete them.

    Deletes in the session's transaction and never commits: the caller decides,
    so a dry run and a test can both roll back.
    """
    report = find_matches(db, removal)
    if not apply or not report.matched:
        report.applied = apply
        return report

    ids = [m.id for m in report.matched]
    chunk_ids = select(KnowledgeChunk.id).where(KnowledgeChunk.document_id.in_(ids))
    db.execute(delete(KnowledgeEmbedding).where(KnowledgeEmbedding.chunk_id.in_(chunk_ids)))
    db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.document_id.in_(ids)))
    db.execute(delete(KnowledgeDocument).where(KnowledgeDocument.id.in_(ids)))
    report.applied = True
    return report


#: Folder shown for a document stored at the root, where the top-level
#: segment *is* the file name.
ROOT_FOLDER = "(raiz)"
#: How many hex digits of a checksum a redacted line keeps: enough to tell a
#: few hundred documents apart, and to find a row again in the database.
REDACTED_DIGITS = 8


def _folder(path: str) -> str:
    head, sep, _ = path.partition("/")
    return head if sep else ROOT_FOLDER


def redact(path: str, checksum: str | None) -> str:
    """``path`` without its file name: top-level folder plus a short checksum.

    A row without a checksum (a file that failed to read) prints as such rather
    than as a digest nobody could look up.
    """
    digest = (checksum or "").strip().lower()[:REDACTED_DIGITS]
    tag = f"sha256:{digest}" if digest else "sem checksum"
    return f"{_folder(path)}/… {tag}"


def format_report(report: PruneReport, *, redact_paths: bool = False) -> list[str]:
    """The lines the CLI prints — the workflow log is the audit trail.

    With ``redact_paths`` no document's file name is printed (see the module
    docstring); the counts and the histogram are the same.
    """
    lines: list[str] = []
    verb = "removido" if report.applied else "seria removido"
    for m in report.matched:
        shown = redact(m.path, m.checksum) if redact_paths else m.path
        lines.append(
            f"[prune] {verb}: {shown} ({m.chunks} trechos, {m.embeddings} embeddings; "
            f"casou por {m.reason})"
        )
    for entry in report.unmatched_entries:
        lines.append(f"[prune] sem correspondência na base: {entry}")
    for entry, below in report.folder_like_entries.items():
        lines.append(
            f'[prune] ATENÇÃO: "{entry}" é uma pasta na base ({below} documentos dentro), '
            f'mas a linha não termina em "/" e por isso não casa nada. Se é a pasta '
            f'inteira que sai, escreva "{entry}/".'
        )
    if report.checksum_entries:
        lines.append(
            f"[prune] conteúdo: {report.checksums_matched} de {report.checksum_entries} "
            f"entradas sha256 casaram algum documento."
        )

    if report.applied:
        lines.append(
            f"[prune] REMOVIDOS: {report.documents} documentos, {report.chunks} trechos, "
            f"{report.embeddings} embeddings."
        )
    else:
        lines.append(
            f"[prune] SIMULAÇÃO: {report.documents} documentos, {report.chunks} trechos, "
            f"{report.embeddings} embeddings seriam removidos. Nada foi apagado; "
            f"rode de novo com --apply para apagar."
        )
    lines.append(
        f"[prune] a base tinha {report.documents_in_base} documentos; "
        f"ficam {report.documents_in_base - (report.documents if report.applied else 0)}."
    )
    stays = "fica" if report.applied else "ficaria"
    for path in report.remaining:
        shown = redact(path, report.remaining_checksums.get(path)) if redact_paths else path
        lines.append(f"[prune] {stays}: {shown}")
    top_level = (
        dict(Counter(_folder(path) for path in report.remaining))
        if redact_paths
        else report.top_level
    )
    if top_level:
        lines.append(
            f"[prune] o que {stays} na base, por pasta de primeiro nível: "
            + ", ".join(f"{name} ({n})" for name, n in sorted(top_level.items()))
            + ". Confira que nenhuma pasta aqui guarda material que devia sair."
        )
    return lines


def knowledge_tables_present(db: Session) -> bool:
    """Whether the knowledge tables exist in the database ``db`` talks to."""
    inspector = inspect(db.connection())
    return all(
        inspector.has_table(model.__tablename__)
        for model in (KnowledgeDocument, KnowledgeChunk, KnowledgeEmbedding)
    )


def main(argv: list[str] | None = None) -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        prog="python -m app.knowledge.prune",
        description=(
            "Remove da base de conhecimento os documentos da lista de remoção "
            "(Cérebro/removidos.txt). Sem --apply, só simula."
        ),
    )
    parser.add_argument("--list", required=True, type=Path, help="arquivo da lista de remoção")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="apaga de verdade (documentos, trechos e embeddings, numa transação)",
    )
    parser.add_argument(
        "--redact",
        action="store_true",
        help=(
            "no lugar do nome de cada arquivo, imprime a pasta de primeiro nível e o "
            "início do sha256 — para um log público, como o do GitHub Actions"
        ),
    )
    args = parser.parse_args(argv)

    try:
        removal = load_removal_list(args.list)
    except OSError as exc:
        parser.error(f"não consegui ler a lista {args.list}: {exc}")
    except ValidationError as exc:
        parser.error(str(exc))

    if removal.is_empty:
        print(f"[prune] a lista {args.list} não tem nenhuma entrada; nada a fazer.")
        return

    print(
        f"[prune] lista: {args.list} ({len(removal.entries)} caminhos, "
        f"{len(removal.checksums)} sha256)"
    )
    try:
        with SessionLocal() as db:
            if not knowledge_tables_present(db):
                # A database never migrated past the knowledge revision would
                # fail with a bare ProgrammingError; the fix is one workflow action.
                print(
                    "[prune] ERRO: as tabelas da base de conhecimento não existem neste banco. "
                    "Rode as migrações primeiro (ação `migrar` do workflow Administração do "
                    "banco, ou `python -m alembic upgrade head`) e depois repita."
                )
                sys.exit(1)
            report = prune(db, removal, apply=args.apply)
            if report.applied:
                db.commit()
            else:
                db.rollback()
    except SQLAlchemyError as exc:
        # The class name only: the statement's bound parameters are the paths
        # the list exists to keep out of a log, and ``--redact`` cannot reach
        # a driver's message. The removal is one transaction: nothing applied.
        print(
            f"::error::[prune] o banco de dados recusou ou perdeu a conexão "
            f"({type(exc).__name__}); nada foi removido. Confira o secret DATABASE_URL e "
            f"se o banco está no ar."
        )
        sys.exit(1)

    for line in format_report(report, redact_paths=args.redact):
        print(line)


if __name__ == "__main__":
    main(sys.argv[1:])
