"""Remove documents from the knowledge base by the removal list (D-100).

Run with::

    python -m app.knowledge.prune --list ../../Cérebro/removidos.txt           # simulação
    python -m app.knowledge.prune --list ../../Cérebro/removidos.txt --apply   # apaga

⚠️  With ``--apply`` this is irreversible, against whatever database
``DATABASE_URL`` points at — production, when it runs from the admin workflow.

Why it exists: the ingestion only ever adds. Deleting a file from ``Cérebro/``
leaves its ``knowledge_document`` row, its passages and its vectors exactly
where they were, and retrieval keeps citing them. Taking a document out of the
repository without running this takes it out of nowhere that matters to the RAG.

**Dry run is the default.** Without ``--apply`` the command lists every
matching document with its passage and vector counts, the totals, and the list
entries that matched nothing, then rolls back. The same output with ``--apply``
is the proof in the workflow log of what was deleted — the lesson of D-71: a
green job only proves the script did not raise, the counts prove it did the
right thing.

**The cascade is explicit, not left to ``ondelete``.** Both foreign keys are
``ondelete="CASCADE"`` and PostgreSQL would honour them, but the SQLite the
tests run on only does with ``PRAGMA foreign_keys=ON``, which the suite does not
turn on — trusting the schema would leave this correct in production and
unverifiable in a test (the reasoning of D-72's ``clear_demo.py``). So vectors,
then passages, then documents, in one transaction.

It needs neither ``pypdf`` nor the corpus: it reads the list and talks to the
database, nothing else. The admin workflow installs neither.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import delete, func, select
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


@dataclass
class PruneReport:
    """What a run found and — with ``applied`` — deleted."""

    applied: bool
    documents_in_base: int
    matched: list[MatchedDocument] = field(default_factory=list)
    #: List entries that matched no document: a typo, or never ingested.
    unmatched_entries: list[str] = field(default_factory=list)
    #: How many stored paths start with each top-level segment. Printed when
    #: nothing matched, because the likeliest cause then is a list written
    #: against another root than the one the base was ingested from.
    top_level: dict[str, int] = field(default_factory=dict)

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
    rows = db.execute(select(KnowledgeDocument.id, KnowledgeDocument.path)).all()
    report = PruneReport(
        applied=False,
        documents_in_base=len(rows),
        top_level=dict(Counter(path.split("/")[0] for _, path in rows)),
    )
    hits = [(doc_id, path) for doc_id, path in rows if removal.matches(path)]
    report.unmatched_entries = [
        entry
        for entry in removal.entries
        if not any(removal.entry_matches(entry, path) for _, path in hits)
    ]
    if not hits:
        return report

    ids = [doc_id for doc_id, _ in hits]
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
            )
            for doc_id, path in hits
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


def format_report(report: PruneReport) -> list[str]:
    """The lines the CLI prints — the workflow log is the audit trail."""
    lines: list[str] = []
    verb = "removido" if report.applied else "seria removido"
    for m in report.matched:
        lines.append(f"[prune] {verb}: {m.path} ({m.chunks} trechos, {m.embeddings} embeddings)")
    for entry in report.unmatched_entries:
        lines.append(f"[prune] sem correspondência na base: {entry}")

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
    if not report.matched and report.top_level:
        lines.append(
            "[prune] nada casou; os caminhos na base começam por: "
            + ", ".join(f"{name} ({n})" for name, n in sorted(report.top_level.items()))
        )
    return lines


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

    print(f"[prune] lista: {args.list} ({len(removal.entries)} entradas)")
    with SessionLocal() as db:
        report = prune(db, removal, apply=args.apply)
        if report.applied:
            db.commit()
        else:
            db.rollback()

    for line in format_report(report):
        print(line)


if __name__ == "__main__":
    main(sys.argv[1:])
