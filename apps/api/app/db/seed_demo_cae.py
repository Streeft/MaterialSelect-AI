"""Fictitious CAE-card values for the demo catalogue (D-124, TM5-a).

⚠️  Dados exclusivamente demonstrativos. Não utilizar em projetos reais.

The CAE card (D-104) reads Poisson's ratio, thermal expansion and specific
heat from ``coef_poisson``, ``coef_expansao_termica`` and ``calor_especifico``.
The definitions are reference data (``app.db.seed.PROPERTIES``); the *values*
here exist only so the card can be demonstrated on the demo catalogue, and so
the three definitions do not sit at ~0 % on the dashboard (the D-69 objection).

Rules this module keeps:

* It writes **only** on materials marked ``is_demo=True`` whose name is in the
  spec list it is given (the 5 of ``app.db.seed`` or the 70 of
  ``app.db.seed_extended``) — never on a real or official record, even one that
  happens to share a name.
* Every row cites the demo source and is ``ESTIMADO``, with a note saying it is
  fictitious; ``clear_demo`` removes it together with its material.
* Numbers are not looked up anywhere: each one is a point inside a plausible
  per-family band, chosen by a stable hash of the material name (no RNG, so the
  70 materials of ``seed_extended`` keep their RNG sequence untouched and two
  runs write the same numbers). The bands are didactic orders of magnitude,
  not data about any real substance.
* Idempotent: a (material, property) pair that already has a row is skipped.
* Values go through ``app.domain.data_quality.build_scalar_value``, so the
  unit trail is the same as any other seeded value (principle 4).
"""

from __future__ import annotations

import zlib
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.data_quality import build_scalar_value
from app.models.enums import DataQuality
from app.models.material import Material
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition
from app.models.source import Source

#: Slugs this module fills, in the order the card lists them.
CAE_DEMO_SLUGS: tuple[str, ...] = ("coef_poisson", "coef_expansao_termica", "calor_especifico")

DEMO_NOTE = "Valor fictício de demonstração (D-124); não usar em projeto real."

#: family -> slug -> (low, high, unit). Didactic bands, fictitious.
_BANDS: dict[str, dict[str, tuple[float, float, str]]] = {
    "metais": {
        "coef_poisson": (0.27, 0.36, "dimensionless"),
        "coef_expansao_termica": (5e-6, 26e-6, "1/K"),
        "calor_especifico": (130.0, 1000.0, "J/(kg*K)"),
    },
    "polimeros": {
        "coef_poisson": (0.33, 0.42, "dimensionless"),
        "coef_expansao_termica": (50e-6, 200e-6, "1/K"),
        "calor_especifico": (1.1, 2.3, "kJ/(kg*K)"),
    },
    "ceramicas": {
        "coef_poisson": (0.17, 0.30, "dimensionless"),
        "coef_expansao_termica": (2e-6, 11e-6, "1/K"),
        "calor_especifico": (500.0, 1000.0, "J/(kg*K)"),
    },
    "compositos": {
        "coef_poisson": (0.20, 0.33, "dimensionless"),
        "coef_expansao_termica": (1e-6, 30e-6, "1/K"),
        "calor_especifico": (700.0, 1400.0, "J/(kg*K)"),
    },
    "elastomeros": {
        "coef_poisson": (0.47, 0.499, "dimensionless"),
        "coef_expansao_termica": (150e-6, 250e-6, "1/K"),
        "calor_especifico": (1.3, 2.0, "kJ/(kg*K)"),
    },
}


def _fraction(name: str, slug: str) -> float:
    """A stable point in [0, 1] for one (material, property) pair."""
    return (zlib.crc32(f"{name}|{slug}".encode()) % 1000) / 999.0


def demo_cae_values(name: str, family: str) -> list[dict]:
    """The three fictitious specs for one demo material, in seed-spec form."""
    bands = _BANDS[family]
    specs: list[dict] = []
    for slug in CAE_DEMO_SLUGS:
        low, high, unit = bands[slug]
        value = low + _fraction(name, slug) * (high - low)
        specs.append({"slug": slug, "value": float(f"{value:.4g}"), "unit": unit})
    return specs


def seed_demo_cae_values(db: Session, source: Source, material_specs: Iterable[dict]) -> int:
    """Write the three CAE values on every listed demo material. Idempotent.

    Returns the number of value rows created in this run.
    """
    if not source.is_demo:  # pragma: no cover - guarded by callers
        raise ValueError("Valores CAE fictícios só podem citar a fonte demo.")
    props = {
        p.slug: p
        for p in db.execute(
            select(PropertyDefinition).where(PropertyDefinition.slug.in_(CAE_DEMO_SLUGS))
        ).scalars()
    }
    if len(props) != len(CAE_DEMO_SLUGS):
        missing = sorted(set(CAE_DEMO_SLUGS) - set(props))
        raise ValueError(f"Definições CAE ausentes (rode o seed principal antes): {missing}")

    created = 0
    for spec in material_specs:
        material = (
            db.execute(
                select(Material).where(Material.name == spec["name"], Material.is_demo.is_(True))
            )
            .scalars()
            .first()
        )
        if material is None:
            continue
        existing = set(
            db.execute(
                select(MaterialPropertyValue.property_id).where(
                    MaterialPropertyValue.material_id == material.id
                )
            ).scalars()
        )
        for value in demo_cae_values(spec["name"], spec["class_slug"]):
            prop = props[value["slug"]]
            if prop.id in existing:
                continue
            nv = build_scalar_value(value["value"], value["unit"], prop.canonical_unit)
            db.add(
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
                    notes=DEMO_NOTE,
                    source_id=source.id,
                    data_quality=DataQuality.ESTIMADO,
                    is_missing=nv.is_missing,
                )
            )
            created += 1
    db.flush()
    return created
