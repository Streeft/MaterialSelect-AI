"""Which Cérebro files to download from Git LFS before an ingestion (D-101).

Run with::

    python -m app.knowledge.lfs_plan --output baixar.nul --ids baixar.ids
    python -m app.knowledge.lfs_plan --output baixar.nul --ids baixar.ids --file Links.md

Why it exists: the workflow checks the repository out without Git LFS, so every
PDF is a pointer, and a pointer's ``oid sha256:`` **is** the SHA-256 of the
file — the digest ``knowledge_document.checksum`` stores. A file the database
already holds with those bytes needs no download: the ingestion reports it
``inalterado`` from the pointer alone. Downloading only the rest is what keeps
a repeated ``ingerir`` from spending the account's LFS bandwidth (1 GB a month
on GitHub's free plan; the whole Cérebro is about 630 MB) on files it would
skip anyway.

The decision is not a second copy of the ingestion's rules: it is
:meth:`KnowledgeService.lfs_plan`, which reads the same pre-pass the ingestion
runs (removal list, copies, "already indexed"), with the same ``--file`` and
``--force``. Download exactly what ``--output`` lists and the ingestion finds no
pointer it would have to read.

Read-only: it reads the database and the pointers on disk, and writes only the
two output files:

* ``--output``: the paths to download, relative to ``KNOWLEDGE_DIR``, each
  ending in a NUL byte — a path may hold a comma, a space or an accent, and
  NUL is the one byte no path can;
* ``--ids`` (optional): the distinct oids, one per line, sorted — the key of the
  workflow's cache.

**The log is public**: it prints counts and megabytes, never a path. A bad
``--file`` is named by its position, as in the ingestion.

Exit 1 when the run could not be planned (``KNOWLEDGE_DIR``, the manifest, a bad
``--file``, a database that cannot be read); never because something has to be
downloaded.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlalchemy.exc import SQLAlchemyError

from app.db.base import SessionLocal
from app.domain.errors import ValidationError
from app.knowledge.prune import knowledge_tables_present
from app.knowledge.service import KnowledgeService, LfsPlan, TargetError

PREFIX = "[lfs]"


def _megabytes(size: int) -> str:
    """``size`` in MB with one decimal, pt-BR (D-30)."""
    return f"{size / 1048576:.1f}".replace(".", ",")


def format_plan(plan: LfsPlan) -> list[str]:
    """The lines the CLI prints: counts only, no path."""
    lines = [
        f"{PREFIX} {plan.pointers} ponteiro(s) LFS entre os arquivos desta execução: "
        f"{plan.unchanged} já indexado(s) com os mesmos bytes, {plan.copies} cópia(s) de "
        f"outro caminho, {plan.removed} na lista de remoção — nenhum desses é baixado."
    ]
    if plan.malformed:
        lines.append(
            f"::warning::{PREFIX} {plan.malformed} ponteiro(s) sem `oid sha256:` legível: "
            "não há o que baixar, e a ingestão vai recusá-los."
        )
    if not plan.fetch:
        lines.append(f"{PREFIX} nada a baixar do Git LFS.")
        return lines
    known = sum(1 for item in plan.fetch if item.in_base)
    lines.append(
        f"{PREFIX} baixar {len(plan.fetch)} arquivo(s), {_megabytes(plan.fetch_bytes)} MB: "
        f"{len(plan.fetch) - known} novo(s) na base, {known} com versão nova ou que "
        "falhou antes (tentado de novo)."
    )
    return lines


def write_plan(plan: LfsPlan, output: Path, ids: Path | None) -> None:
    """Write the NUL-separated paths and, if asked, the sorted distinct oids."""
    output.write_bytes(b"".join(item.relative.encode("utf-8") + b"\0" for item in plan.fetch))
    if ids is not None:
        oids = sorted({item.oid for item in plan.fetch})
        ids.write_text("".join(f"{oid}\n" for oid in oids), encoding="ascii")


def _parse(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m app.knowledge.lfs_plan",
        description=(
            "Lista os arquivos do Cérebro que a ingestão vai ler e que ainda são "
            "ponteiros do Git LFS — só o que o banco ainda não tem."
        ),
    )
    parser.add_argument(
        "--output",
        required=True,
        type=Path,
        help="arquivo onde gravar os caminhos a baixar (relativos a KNOWLEDGE_DIR, separados por NUL)",
    )
    parser.add_argument(
        "--ids",
        type=Path,
        default=None,
        help="arquivo onde gravar os oids distintos a baixar, um por linha (chave do cache)",
    )
    parser.add_argument(
        "--file",
        "--path",
        dest="files",
        action="append",
        metavar="CAMINHO",
        help="o mesmo --file da ingestão: planeja só estes arquivos",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="o mesmo --force da ingestão: todo arquivo mantido precisa ser lido",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    """Plan the download, write the lists and print the counts."""
    args = _parse(argv if argv is not None else [])
    try:
        with SessionLocal() as db:
            if not knowledge_tables_present(db):
                print(
                    f"::error::{PREFIX} as tabelas da base de conhecimento não existem neste "
                    "banco. Rode as migrações (ação `migrar` do workflow Administração do "
                    "banco) e repita."
                )
                sys.exit(1)
            # Nothing is written: closing the session rolls the read back.
            plan = KnowledgeService(db).lfs_plan(force=args.force, paths=args.files)
    except TargetError as exc:
        print(f"{PREFIX} ERRO: --file nº {exc.position}: {exc.reason}.")
        sys.exit(1)
    except ValidationError as exc:
        print(f"{PREFIX} ERRO: {exc}")
        sys.exit(1)
    except SQLAlchemyError as exc:
        # The class name only: a driver message can carry the database host.
        print(
            f"::error::{PREFIX} não consegui ler o banco ({type(exc).__name__}). Confira o "
            "secret DATABASE_URL e se o banco está no ar."
        )
        sys.exit(1)

    write_plan(plan, args.output, args.ids)
    for line in format_plan(plan):
        print(line)


if __name__ == "__main__":
    main(sys.argv[1:])
