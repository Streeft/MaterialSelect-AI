"""CLI entry point for the knowledge base ingestion.

Run with::

    python -m app.knowledge.ingest

Idempotent by checksum (``KnowledgeService.ingest``) — safe to run again after
adding or editing files under ``KNOWLEDGE_DIR``. Never runs during a client
request; this is the operator's own tooling.
"""

from __future__ import annotations

import sys

from app.db.base import SessionLocal
from app.knowledge.service import KnowledgeService


def main() -> None:
    """Ingest the configured knowledge root and print a summary."""
    with SessionLocal() as db:
        report = KnowledgeService(db).ingest()
        db.commit()

    print(f"[ingest] raiz: {report.root}")
    print(
        f"[ingest] {report.created} criados, {report.updated} atualizados, "
        f"{report.unchanged} inalterados, {report.failed} falharam, "
        f"{report.skipped} ignorados, "
        f"{report.total_chunks} trechos, {report.embedded_chunks} embedados."
    )
    # What the removal list kept out is named, with the reason: a count alone
    # would not tell the operator *which* copy of the course material was on
    # disk, nor that an old row of it still needs the prune (D-100).
    for outcome in report.outcomes:
        if outcome.action == "ignorado":
            print(f"[ingest] IGNORADO {outcome.path}: {outcome.detail}")
    for warning in report.removal_list_warnings:
        print(f"[ingest] ATENÇÃO na lista de remoção: {warning}")
    if report.embeddings_skipped_reason:
        print(
            f"[ingest] busca semântica indisponível nesta execução: {report.embeddings_skipped_reason}"
        )
    for outcome in report.outcomes:
        if outcome.action == "falhou":
            print(f"[ingest] FALHOU {outcome.path}: {outcome.detail}")

    if report.failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
