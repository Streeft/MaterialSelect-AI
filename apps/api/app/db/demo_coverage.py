"""Coverage report: which materials have designations, composition and curves (D-107).

Run with::

    python -m app.db.demo_coverage              # every active material
    python -m app.db.demo_coverage --demo       # only is_demo materials
    python -m app.db.demo_coverage --gaps       # only materials missing something

For each material it says which of the three things exist — designation,
composition, curve — and, for each that does not, the reason. It is a report of
*counts and names* and writes nothing.

It does **not** depend on ``is_demo``: it works over any material, so the same
command, after the official catalogue is loaded, tells the author which real
materials still have "sem composição cadastrada" — the list to take to the
source. For a demo material the reason is the specific one the seed decided
(``DEMO_KNOWN_GAPS``) when there is one; for anything else it is the plain
absence statement of D-24 (absence is written, never zero).
"""

from __future__ import annotations

import argparse
from collections.abc import Sequence
from dataclasses import dataclass, field, replace

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.base import SessionLocal
from app.db.seed_extended_identity import DEMO_KNOWN_GAPS
from app.models.material import Material
from app.models.material_composition import MaterialCompositionEntry
from app.models.material_curve import MaterialCurve
from app.models.material_designation import MaterialDesignation

THINGS = ("designation", "composition", "curve")

_GENERIC_REASON = {
    "designation": "sem designação cadastrada",
    "composition": "sem composição cadastrada",
    "curve": "sem curva cadastrada",
}
_THING_LABEL = {"designation": "designação", "composition": "composição", "curve": "curva"}


@dataclass(frozen=True)
class MaterialCoverage:
    material_id: int
    name: str
    class_slug: str
    is_demo: bool
    designations: int
    #: Composition rows that carry information (a range, a limit, a nominal or a
    #: declared balance). A row declared absent is a statement, not data.
    composition_entries: int
    composition_declared_absent: int
    curves: int
    curve_kinds: tuple[str, ...] = ()
    gaps: dict[str, str] = field(default_factory=dict)

    def has(self, thing: str) -> bool:
        return {
            "designation": self.designations,
            "composition": self.composition_entries,
            "curve": self.curves,
        }[thing] > 0


def _counts(db: Session, model, column) -> dict[int, int]:
    return {
        material_id: count
        for material_id, count in db.execute(
            select(model.material_id, func.count(model.id))
            .where(column)
            .group_by(model.material_id)
        )
    }


def collect_coverage(db: Session, *, demo_only: bool = False) -> list[MaterialCoverage]:
    """One row per active material, in id order."""
    designations = _counts(db, MaterialDesignation, MaterialDesignation.id.is_not(None))
    informative = _counts(
        db, MaterialCompositionEntry, MaterialCompositionEntry.is_missing.is_(False)
    )
    absent = _counts(db, MaterialCompositionEntry, MaterialCompositionEntry.is_missing.is_(True))
    curves = _counts(db, MaterialCurve, MaterialCurve.id.is_not(None))
    kinds: dict[int, set[str]] = {}
    for material_id, kind in db.execute(select(MaterialCurve.material_id, MaterialCurve.kind)):
        kinds.setdefault(material_id, set()).add(kind.value)

    query = select(Material).where(Material.is_active.is_(True)).order_by(Material.id)
    if demo_only:
        query = query.where(Material.is_demo.is_(True))

    rows: list[MaterialCoverage] = []
    for material in db.execute(query).scalars():
        row = MaterialCoverage(
            material_id=material.id,
            name=material.name,
            class_slug=material.material_class.slug,
            is_demo=material.is_demo,
            designations=designations.get(material.id, 0),
            composition_entries=informative.get(material.id, 0),
            composition_declared_absent=absent.get(material.id, 0),
            curves=curves.get(material.id, 0),
            curve_kinds=tuple(sorted(kinds.get(material.id, ()))),
        )
        known = DEMO_KNOWN_GAPS.get(material.name, {}) if material.is_demo else {}
        gaps = {
            thing: (
                f"{_GENERIC_REASON[thing]} — {known[thing]}"
                if thing in known
                else _GENERIC_REASON[thing]
            )
            for thing in THINGS
            if not row.has(thing)
        }
        rows.append(replace(row, gaps=gaps))
    return rows


def summarize(rows: Sequence[MaterialCoverage]) -> dict[str, object]:
    """Counts only: totals, by class, and how many lack each thing."""
    by_class: dict[str, dict[str, int]] = {}
    for row in rows:
        bucket = by_class.setdefault(row.class_slug, {"materials": 0, **dict.fromkeys(THINGS, 0)})
        bucket["materials"] += 1
        for thing in THINGS:
            bucket[thing] += int(row.has(thing))
    return {
        "materials": len(rows),
        **{thing: sum(1 for r in rows if r.has(thing)) for thing in THINGS},
        "complete": sum(1 for r in rows if not r.gaps),
        "by_class": by_class,
    }


def format_report(rows: Sequence[MaterialCoverage], *, gaps_only: bool = False) -> str:
    """The text the command prints (and the test reads)."""
    summary = summarize(rows)
    lines = [
        f"Cobertura de {summary['materials']} materiais "
        f"(designação {summary['designation']}, composição {summary['composition']}, "
        f"curva {summary['curve']}; completos: {summary['complete']})",
        "",
    ]
    for class_slug, bucket in sorted(summary["by_class"].items()):  # type: ignore[union-attr]
        lines.append(
            f"  {class_slug}: {bucket['materials']} materiais — "
            f"designação {bucket['designation']}, composição {bucket['composition']}, "
            f"curva {bucket['curve']}"
        )
    lines.append("")
    for row in rows:
        if gaps_only and not row.gaps:
            continue
        tag = " [demo]" if row.is_demo else ""
        kinds = f" ({', '.join(row.curve_kinds)})" if row.curve_kinds else ""
        absent = (
            f", {row.composition_declared_absent} declarado(s) ausente(s)"
            if row.composition_declared_absent
            else ""
        )
        lines.append(
            f"#{row.material_id} {row.name}{tag} [{row.class_slug}] — "
            f"designações: {row.designations}; composição: {row.composition_entries} "
            f"elemento(s){absent}; curvas: {row.curves}{kinds}"
        )
        for thing in THINGS:
            if thing in row.gaps:
                lines.append(f"    AUSENTE {_THING_LABEL[thing]}: {row.gaps[thing]}")
    return "\n".join(lines)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.db.demo_coverage",
        description="Relatório de cobertura: designação, composição e curva por material.",
    )
    parser.add_argument("--demo", action="store_true", help="só materiais is_demo")
    parser.add_argument("--gaps", action="store_true", help="só materiais com alguma ausência")
    args = parser.parse_args(argv)
    with SessionLocal() as db:
        rows = collect_coverage(db, demo_only=args.demo)
    print(format_report(rows, gaps_only=args.gaps))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
