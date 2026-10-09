"""Which rows a new release of an official catalogue retires (D-114, TM7-a, TM4-g).

Pure: no SQLAlchemy. The importer and the dry-run hand over what the previous
releases of the same lineage stored and the external identities the new
release carries; this module decides, deterministically, what is superseded,
what is retired and what keeps living.

**Identity is external, never the name** (D-102, D-108). A previous record
*reappears* when ``(external_table, external_record_id)`` is in the new
release.

**Two universes, two models of a row.** A material is written once per
release (D-108: the diff compares the rows each release stored), so a material
that reappears is *superseded* — the new release has its own row and the old
one goes inactive, still there for the diff. A process or a transport mode is
one row reused across releases (its slug is unique and favourites/links point
at it), so one that reappears *stays active*; only the ones that do not
reappear are retired. A curve hangs on a material and follows it.

Nothing here deletes anything: the result names rows to set ``is_active=False``.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

Identity = tuple[str, str]


@dataclass(frozen=True)
class PreviousRecord:
    """One row a previous release of the lineage points at."""

    external_table: str
    external_record_id: str
    internal_id: int
    release_slug: str
    is_active: bool

    @property
    def identity(self) -> Identity:
        return (self.external_table, self.external_record_id)


@dataclass(frozen=True)
class UniversePlan:
    """What one universe (materials, processes, …) does when the release vigora."""

    #: Reappear in the new release: a new row replaces them (materials, curves)
    #: or the same row lives on (processes, transport modes).
    superseded: tuple[PreviousRecord, ...]
    #: Do not reappear: their row goes inactive, never deleted.
    retired: tuple[PreviousRecord, ...]
    #: Internal ids to set ``is_active=False`` (only the ones still active).
    to_deactivate: tuple[int, ...]

    def report(self) -> dict:
        """JSON for the import run and the dry-run: identities, never names.

        Names of a licensed catalogue stay out of an Actions log that is public;
        the diff screen (D-108) shows them to a signed-in reader.
        """
        return {
            "superseded": len(self.superseded),
            "retired": [
                {
                    "external_table": r.external_table,
                    "external_record_id": r.external_record_id,
                    "release": r.release_slug,
                }
                for r in self.retired
            ],
            "deactivated": len(self.to_deactivate),
        }


def _order(record: PreviousRecord) -> tuple:
    return (record.external_table, record.external_record_id, record.release_slug)


def plan_universe(
    previous: Iterable[PreviousRecord],
    incoming: Iterable[Identity],
    *,
    reuses_rows: bool,
    kept_ids: Iterable[int] = (),
) -> UniversePlan:
    """Split the previous records into superseded and retired.

    ``reuses_rows`` says whether a reappearing record keeps its row (processes,
    transport modes) or gets a new one (materials). ``kept_ids`` are internal
    rows the new release itself points at: never deactivated, whatever
    identity an older release gave them — the defence against one row reached
    by two identities.
    """
    incoming_set = set(incoming)
    kept = set(kept_ids)
    records = sorted(previous, key=_order)
    superseded = tuple(r for r in records if r.identity in incoming_set)
    retired = tuple(r for r in records if r.identity not in incoming_set)
    candidates = retired if reuses_rows else (*superseded, *retired)
    if reuses_rows:
        kept |= {r.internal_id for r in superseded}
    to_deactivate = sorted(
        {r.internal_id for r in candidates if r.is_active and r.internal_id not in kept}
    )
    return UniversePlan(superseded=superseded, retired=retired, to_deactivate=tuple(to_deactivate))
