"""Fictitious Rockwell hardness on every demo material (D-255, catálogo ampliado item 6).

Three definitions (``app.db.property_catalog_extended.ROCKWELL_PROPERTIES``):
B for softer metals, C for hard ones, M for rigid polymers — one scale per
family, because a Rockwell number belongs to its scale and two scales are not
one property. Every catalogue demo material gets the three rows: the number on
the scale its family reads in, and a **declared absence with the reason** on
the other two (never zero, never a converted number).

The rules are those of the D-188 seed (``seed_demo_extended_props``), which this
module reuses for the material's basis:

* **Demo only**: ``is_demo``, no owner, not synthesized; a real record is
  never touched, even with a demo name.
* **Additive and idempotent (D-189)**: only a (material, property) pair with no
  row is written; a second run writes nothing.
* **Deterministic**: the reading is placed by the material's own tensile
  strength (metals) or modulus (polymers) on a coarse teaching table of the
  usual order of magnitude, plus a jitter of about one point from a stable hash
  of the name. These are example numbers, ``ESTIMADO``, citing the demo source
  with the note "Valor de exemplo (D-255)." — not a hardness conversion anyone
  should use.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.property_catalog_extended import ROCKWELL_SLUGS
from app.db.seed_demo_extended_props import (
    Basis,
    _fraction,
    _interp,
    _own_values,
    build_basis,
    demo_catalogue_materials,
    profile_for,
    trusted_names,
)
from app.domain.data_quality import build_scalar_value, missing_value
from app.models.enums import DataQuality
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition
from app.models.source import Source

DEMO_NOTE = "Valor de exemplo (D-255)."

B, C, M = ROCKWELL_SLUGS

#: Tensile strength (MPa) → reading, metals. The order of magnitude of the
#: hardness–strength tables of carbon and alloy steels, used for every metal
#: family of the demo: the number is an example, not a conversion.
_HRB_BY_STRENGTH: tuple[tuple[float, float], ...] = (
    (300, 45),
    (400, 60),
    (500, 75),
    (600, 87),
    (700, 95),
    (770, 100),
)
_HRC_BY_STRENGTH: tuple[tuple[float, float], ...] = (
    (770, 20),
    (1000, 31),
    (1250, 39),
    (1500, 46),
    (1750, 51),
    (2000, 55),
    (2300, 60),
)
#: Young's modulus (GPa) → reading, rigid polymers and thermosets.
_HRM_BY_MODULUS: tuple[tuple[float, float], ...] = (
    (1.5, 45),
    (2.5, 70),
    (3.5, 90),
    (4.5, 100),
    (6.0, 108),
)

_TOO_SOFT_METAL = "Não se aplica: metal macio demais para as escalas B e C (lê-se em E, F ou H)."
_HARD_METAL = "Não se aplica: metal duro, lido na escala C."
_SOFT_METAL = "Não se aplica: metal de dureza baixa a média, lido na escala B."
_NOT_METAL = "Não se aplica: as escalas B e C são de metais."
_NOT_POLYMER = "Não se aplica: a escala M é de plásticos rígidos."
_SOFT_POLYMER = "Não se aplica: polímero macio, lido em Shore D."
_BY_GROUP = {
    "elastomer": "Não se aplica: elastômero, lido em Shore A.",
    "ceramic": "Não se aplica: cerâmicas se medem em Vickers ou Knoop.",
    "glass": "Não se aplica: vidros se medem em Vickers ou Knoop.",
    "polymer_foam": "Não se aplica: Rockwell não mede espumas.",
    "wood": "Não se aplica: madeiras se medem pelo ensaio Janka.",
    "building": "Não se aplica: Rockwell não é o ensaio desta família.",
    "pmc": "Não se aplica: Rockwell não é o ensaio de compósitos laminados.",
}


def _reading(table: tuple[tuple[float, float], ...], x: float, name: str, key: str) -> float:
    """The table's reading at ``x``, inside the table, with a stable jitter of ±1."""
    base = _interp(table, x)
    jitter = 2.0 * _fraction(name, key) - 1.0
    low, high = table[0][1], table[-1][1]
    return float(round(min(max(base + jitter, low), high)))


def rockwell_for(name: str, profile: Mapping, basis: Basis) -> dict[str, float | str]:
    """Each Rockwell slug → its reading, or the reason it does not apply. Pure."""
    group = profile["group"]
    if group == "metal":
        su = basis.su
        if su >= _HRC_BY_STRENGTH[0][0]:
            return {B: _HARD_METAL, C: _reading(_HRC_BY_STRENGTH, su, name, "HRC"), M: _NOT_POLYMER}
        if su >= _HRB_BY_STRENGTH[0][0]:
            return {B: _reading(_HRB_BY_STRENGTH, su, name, "HRB"), C: _SOFT_METAL, M: _NOT_POLYMER}
        return {B: _TOO_SOFT_METAL, C: _TOO_SOFT_METAL, M: _NOT_POLYMER}
    if group in ("polymer", "thermoset"):
        if basis.E >= _HRM_BY_MODULUS[0][0]:
            return {
                B: _NOT_METAL,
                C: _NOT_METAL,
                M: _reading(_HRM_BY_MODULUS, basis.E, name, "HRM"),
            }
        return {B: _NOT_METAL, C: _NOT_METAL, M: _SOFT_POLYMER}
    reason = _BY_GROUP.get(group, "Não se aplica: Rockwell não é o ensaio desta família.")
    return {B: reason, C: reason, M: reason}


def seed_demo_rockwell(
    db: Session, source: Source, *, names: Iterable[str] | None = None
) -> dict[str, int]:
    """Fill every missing Rockwell pair on the demo catalogue. Additive, idempotent.

    Returns ``rockwell_values_created`` and ``rockwell_missing_declared`` for the
    ``semear_demo`` log.
    """
    if not source.is_demo:  # pragma: no cover - guarded by callers
        raise ValueError("Durezas Rockwell fictícias só podem citar a fonte demo.")
    definitions = {
        p.slug: p
        for p in db.execute(
            select(PropertyDefinition).where(PropertyDefinition.slug.in_(ROCKWELL_SLUGS))
        ).scalars()
    }
    if len(definitions) != len(ROCKWELL_SLUGS):
        missing = sorted(set(ROCKWELL_SLUGS) - set(definitions))
        raise ValueError(f"Definições Rockwell ausentes (rode o seed principal antes): {missing}")

    wanted = None if names is None else set(names)
    materials = [
        (m, cls) for m, cls in demo_catalogue_materials(db) if wanted is None or m.name in wanted
    ]
    ids = [m.id for m, _ in materials]
    present: set[tuple[int, int]] = set()
    prop_ids = [p.id for p in definitions.values()]
    for start in range(0, len(ids), 500):
        present.update(
            db.execute(
                select(MaterialPropertyValue.material_id, MaterialPropertyValue.property_id).where(
                    MaterialPropertyValue.material_id.in_(ids[start : start + 500]),
                    MaterialPropertyValue.property_id.in_(prop_ids),
                )
            ).all()
        )
    own = _own_values(db, ids)
    trusted = trusted_names()

    counts = {"rockwell_values_created": 0, "rockwell_missing_declared": 0}
    rows: list[MaterialPropertyValue] = []
    for material, class_slug in materials:
        if all((material.id, definitions[slug].id) in present for slug in ROCKWELL_SLUGS):
            continue
        profile = profile_for(class_slug, material.subclass, material.name)
        basis = build_basis(profile, own.get(material.id, {}), trusted=material.name in trusted)
        readings = rockwell_for(material.name, profile, basis)
        for slug in ROCKWELL_SLUGS:
            prop = definitions[slug]
            if (material.id, prop.id) in present:
                continue
            reading = readings[slug]
            if isinstance(reading, str):
                nv = missing_value()
                note = reading
                counts["rockwell_missing_declared"] += 1
            else:
                nv = build_scalar_value(reading, "dimensionless", prop.canonical_unit)
                note = DEMO_NOTE
                counts["rockwell_values_created"] += 1
            rows.append(
                MaterialPropertyValue(
                    material_id=material.id,
                    property_id=prop.id,
                    value_scalar=nv.value_scalar,
                    value_min=nv.value_min,
                    value_max=nv.value_max,
                    value_typical=nv.value_typical,
                    original_unit=nv.original_unit,
                    normalized_value=nv.normalized_value,
                    canonical_unit=nv.canonical_unit,
                    conversion_method=nv.conversion_method,
                    notes=note,
                    source_id=source.id,
                    data_quality=DataQuality.ESTIMADO,
                    is_missing=nv.is_missing,
                )
            )
    db.add_all(rows)
    db.flush()
    return counts
