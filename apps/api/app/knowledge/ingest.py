"""CLI entry point for the knowledge base ingestion.

Run with::

    python -m app.knowledge.ingest
    python -m app.knowledge.ingest --file Links.md
    python -m app.knowledge.ingest --file Links.md --force

Idempotent by checksum (``KnowledgeService.ingest``) — safe to run again after
adding or editing files under ``KNOWLEDGE_DIR``. Never runs during a client
request; this is the operator's own tooling.
"""

from __future__ import annotations

import argparse
import sys

from app.db.base import SessionLocal
from app.domain.errors import ValidationError
from app.knowledge.service import KnowledgeService


def main(argv: list[str] | None = None) -> None:
    """Ingest the configured knowledge root and print a summary."""
    parser = argparse.ArgumentParser(
        prog="python -m app.knowledge.ingest",
        description="Ingestão da base de conhecimento do Cérebro.",
    )
    parser.add_argument(
        "--file",
        "--path",
        dest="files",
        action="append",
        help="Caminho relativo a KNOWLEDGE_DIR de arquivo(s) específico(s) para indexar (ex: Links.md).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Reextrai mesmo quando o checksum for idêntico.",
    )
    args = parser.parse_args([] if argv is None else argv)

    try:
        with SessionLocal() as db:
            report = KnowledgeService(db).ingest(force=args.force, paths=args.files)
            db.commit()
    except ValidationError as exc:
        print(f"[ingest] ERRO: {exc}")
        sys.exit(1)

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
    main(sys.argv[1:])
