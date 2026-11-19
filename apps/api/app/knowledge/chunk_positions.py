"""Write the position of the passages of notebook sources saved before D-233 (D-251).

Run with::

    python -m app.knowledge.chunk_positions               # simulação: só conta
    python -m app.knowledge.chunk_positions --apply       # grava
    python -m app.knowledge.chunk_positions --notebook 12 # um caderno só

A citation marks its passage by ``[char_start, char_end)`` in the source's stored
``content`` (D-233). A source saved before that decision has those two columns
NULL, and the reader falls back to looking the excerpt up by words. This puts the
position there without touching anything else.

**It places, it never guesses.** The stored passages are not slices of ``content``
(the chunker undoes hyphenated line breaks and collapses blanks), so a position
cannot be found by searching the passage text. What can be done honestly is to run
the *same chunker* over the stored ``content`` — the pages are stripped and joined
by a blank line, so the paragraph sequence is the one it was cut from — and take a
position only from a re-cut passage whose **text is identical** to the stored one
at the same ordinal. A passage that does not match (a chunker that has changed
since, a source cut short at the chunk limit) stays NULL and is counted, and the
reader keeps looking it up by words. Page range, heading, text, search text and
vectors are never written here: the passage the citation points at stays the
passage it was.

**Idempotent.** Only passages with a NULL position are looked at; a second run
finds nothing to do. **Dry run by default**, like :mod:`app.knowledge.prune`: it
writes nothing and prints the same counts. The output is counts only — a notebook is a
person's own material and the Actions log is public, so no title, text or id is
printed.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.knowledge.chunking import chunk_text
from app.knowledge.readers import ExtractedText
from app.models.notebook import NotebookChunk, NotebookSource


@dataclass
class PositionReport:
    """What a run found, in counts."""

    sources_seen: int = 0
    sources_updated: int = 0
    chunks_filled: int = 0
    #: Passages that stay NULL because no re-cut passage had the same text.
    chunks_unplaced: int = 0
    applied: bool = False

    def lines(self) -> list[str]:
        mode = "gravado" if self.applied else "simulação (nada foi gravado)"
        return [
            f"Modo: {mode}",
            f"Fontes com trecho sem posição: {self.sources_seen}",
            f"Fontes atualizadas: {self.sources_updated}",
            f"Trechos com a posição gravada: {self.chunks_filled}",
            f"Trechos que seguem sem posição (texto diferente do refeito): {self.chunks_unplaced}",
        ]


def place_chunks(source: NotebookSource, *, write: bool = True) -> tuple[int, int]:
    """Fill the NULL positions of one source's passages; returns ``(filled, unplaced)``.

    Pure over the loaded rows (no commit), so a test can drive it without a session.
    With ``write=False`` it only counts, and the rows are not touched.
    """
    pending = [chunk for chunk in source.chunks if chunk.char_start is None]
    if not pending or not source.content:
        return 0, len(pending)
    recut = {chunk.ordinal: chunk for chunk in chunk_text(ExtractedText(pages=[source.content]))}
    filled = 0
    for chunk in pending:
        again = recut.get(chunk.ordinal)
        if (
            again is not None
            and again.text == chunk.text
            and again.char_start is not None
            and again.char_end is not None
        ):
            if write:
                chunk.char_start, chunk.char_end = again.char_start, again.char_end
            filled += 1
    return filled, len(pending) - filled


def backfill_chunk_positions(
    db: Session, *, notebook_id: int | None = None, apply: bool = False
) -> PositionReport:
    """Place the passages of every source that has an unplaced one; commit only with ``apply``."""
    report = PositionReport(applied=apply)
    unplaced = select(NotebookChunk.source_id).where(NotebookChunk.char_start.is_(None)).distinct()
    stmt = (
        select(NotebookSource)
        .options(selectinload(NotebookSource.chunks))
        .where(NotebookSource.id.in_(unplaced))
        .order_by(NotebookSource.id)
    )
    if notebook_id is not None:
        stmt = stmt.where(NotebookSource.notebook_id == notebook_id)
    for source in db.execute(stmt).scalars():
        report.sources_seen += 1
        filled, left = place_chunks(source, write=apply)
        report.chunks_filled += filled
        report.chunks_unplaced += left
        if filled:
            report.sources_updated += 1
    if apply:
        db.commit()
    return report


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Grava a posição dos trechos de fontes de caderno anteriores ao D-233.",
    )
    parser.add_argument("--apply", action="store_true", help="grava (sem isto, só simula)")
    parser.add_argument("--notebook", type=int, default=None, help="só este caderno")
    args = parser.parse_args(argv)

    from app.db.base import SessionLocal

    with SessionLocal() as db:
        report = backfill_chunk_positions(db, notebook_id=args.notebook, apply=args.apply)
    print("\n".join(report.lines()))


if __name__ == "__main__":
    main()
