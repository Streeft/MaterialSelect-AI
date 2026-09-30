"""CLI entry point for the knowledge base ingestion.

Run with::

    python -m app.knowledge.ingest              # extrai e, se configurado, embeda
    python -m app.knowledge.ingest --no-embed   # só extrai; vetores ficam para
                                                # python -m app.knowledge.embed

Idempotent by checksum (``KnowledgeService.ingest``) — safe to run again after
adding or editing files under ``KNOWLEDGE_DIR``. Never runs during a client
request; this is the operator's own tooling.

Each document is committed as soon as it is dealt with, so a run that dies at
the hundredth book keeps the ninety-nine before it.

The output is written for a **public** Actions log. A path is printed whole
only when ``Cérebro/manifesto.json`` declares it; any other document is named
by its top-level folder and a short checksum (``app.knowledge.prune.redact``),
files kept out by the removal list always are, and byte-identical copies are
counted per top-level folder instead of listed.

Exit code: 1 when a document failed for a reason the operator must fix (a
broken file, an LFS pointer checked out in place of the file); a document
without extractable text — a scanned book — is a warning (``SEM TEXTO``) and
does not fail the run on its own.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path, PurePosixPath

from app.db.base import SessionLocal
from app.knowledge.prune import ROOT_FOLDER, redact
from app.knowledge.service import DocumentOutcome, IngestReport, KnowledgeService


def _shown(outcome: DocumentOutcome) -> str:
    """A path as a public log may print it: whole only when declared."""
    return outcome.path if outcome.declared else redact(outcome.path, outcome.checksum)


def _shown_detail(outcome: DocumentOutcome, root: str) -> str:
    """A failure's detail as a public log may print it.

    An OS error names the file it could not open — absolute, as in
    ``[Errno 2] No such file or directory: '/home/runner/…/Cérebro/x.pdf'`` —
    so an undeclared path would leak through the detail even though the path
    column is redacted. Every form of the path (absolute, relative, bare file
    name) is replaced by the redacted name.
    """
    detail = outcome.detail or ""
    if outcome.declared:
        return detail
    shown = _shown(outcome)
    forms = {str(Path(root) / outcome.path), outcome.path, PurePosixPath(outcome.path).name}
    for form in sorted((f for f in forms if f), key=len, reverse=True):
        detail = detail.replace(form, shown)
    return detail


def _folder(path: str) -> str:
    head, sep, _ = path.partition("/")
    return f"{head}/" if sep else ROOT_FOLDER


def format_report(report: IngestReport, *, embed: bool = True) -> list[str]:
    """The lines the CLI prints — the workflow log is the audit trail."""
    removal_skips = [o for o in report.outcomes if o.action == "ignorado" and not o.duplicate_of]
    copies = [o for o in report.outcomes if o.duplicate_of is not None]
    failures = [o for o in report.outcomes if o.action == "falhou"]
    scanned = [o for o in failures if o.empty_text]

    lines = [
        f"[ingest] raiz: {report.root}",
        f"[ingest] {report.created} criados, {report.updated} atualizados, "
        f"{report.unchanged} inalterados, {report.failed} falharam "
        f"({len(scanned)} sem texto), "
        f"{len(removal_skips)} ignorados pela lista de remoção, "
        f"{report.duplicates} cópias idênticas ignoradas, "
        f"{report.total_chunks} trechos, {report.embedded_chunks} embedados.",
    ]
    if not embed:
        lines.append(
            "[ingest] vetores não gerados nesta execução (--no-embed): "
            "rode `python -m app.knowledge.embed`."
        )
    # What the removal list kept out is named, with the reason: a count alone
    # would not tell the operator *which* copy of the course material was on
    # disk, nor that an old row of it still needs the prune (D-100). Always
    # redacted: the list exists because those names are not to be published.
    for outcome in removal_skips:
        lines.append(
            f"[ingest] IGNORADO {redact(outcome.path, outcome.checksum)}: {outcome.detail}"
        )
    # Copies are counted by folder: the corpus carries whole folders twice, and
    # a hundred lines saying the same thing would bury the ones that matter.
    by_folder = Counter(_folder(o.path) for o in copies)
    orphans = Counter(_folder(o.path) for o in copies if o.still_in_base)
    for folder, count in sorted(by_folder.items()):
        line = (
            f"[ingest] CÓPIAS em {folder}: {count} idênticas a arquivos indexados em outro caminho"
        )
        if orphans[folder]:
            line += f"; {orphans[folder]} ainda na base (`status` lista esses órfãos)"
        lines.append(line + ".")
    for warning in report.removal_list_warnings:
        lines.append(f"[ingest] ATENÇÃO na lista de remoção: {warning}")
    if report.embeddings_skipped_reason:
        lines.append(
            f"[ingest] busca semântica indisponível nesta execução: "
            f"{report.embeddings_skipped_reason}"
        )
    for outcome in scanned:
        line = f"[ingest] SEM TEXTO {_shown(outcome)} (provavelmente digitalizado)"
        if outcome.kept_previous:
            line += " — os trechos da versão anterior continuam na base"
        lines.append(line)
    for outcome in failures:
        if not outcome.empty_text:
            lines.append(
                f"[ingest] FALHOU {_shown(outcome)}: {_shown_detail(outcome, report.root)}"
            )
    return lines


def _parse(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m app.knowledge.ingest",
        description="Cataloga e extrai o texto dos documentos de KNOWLEDGE_DIR.",
    )
    parser.add_argument(
        "--no-embed",
        action="store_true",
        help=(
            "não gera vetores nesta execução, mesmo com KNOWLEDGE_EMBEDDING_* configurado "
            "(ficam para python -m app.knowledge.embed)"
        ),
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    """Ingest the configured knowledge root and print a summary."""
    args = _parse(argv if argv is not None else [])
    embed = not args.no_embed
    with SessionLocal() as db:
        report = KnowledgeService(db).ingest(embed=embed, on_document=db.commit)
        db.commit()

    for line in format_report(report, embed=embed):
        print(line)

    # A scanned book is a fact about the corpus, not something a rerun fixes;
    # every other failure is.
    if any(o.action == "falhou" and not o.empty_text for o in report.outcomes):
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1:])
