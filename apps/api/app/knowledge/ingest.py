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
        f"{report.total_chunks} trechos, {report.embedded_chunks} embedados."
    )
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
