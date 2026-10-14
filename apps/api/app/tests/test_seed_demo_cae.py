"""The fictitious CAE values of the demo catalogue (D-124, TM5-a).

The seed defines ``coef_poisson``, ``coef_expansao_termica`` and
``calor_especifico`` as reference data and fills them **only** on demo
materials, so the CAE decks can be demonstrated without a single real value
being written — and without the three definitions sitting at ~0 % (D-69).
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.calculations.units import to_canonical
from app.db.clear_demo import clear_demo_data
from app.db.seed import DEMO_MATERIALS, DEMO_SOURCE_LABEL, PROPERTIES, seed_reference
from app.db.seed_demo_cae import (
    _BANDS,
    CAE_DEMO_SLUGS,
    DEMO_NOTE,
    demo_cae_values,
    seed_demo_cae_values,
)
from app.db.seed_extended import EXTENDED_DEMO_MATERIALS, seed_extended_materials
from app.exporters.cae.quantities import CTE, POISSON, SPECIFIC_HEAT
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition
from app.models.source import Source


def _demo_source(db: Session) -> Source:
    return db.execute(select(Source).where(Source.label == DEMO_SOURCE_LABEL)).scalars().one()


def _cae_rows(db: Session) -> list[MaterialPropertyValue]:
    return list(
        db.execute(
            select(MaterialPropertyValue)
            .join(PropertyDefinition)
            .where(PropertyDefinition.slug.in_(CAE_DEMO_SLUGS))
        ).scalars()
    )


def test_the_definitions_are_reference_data_with_the_exporter_slugs() -> None:
    by_slug = {spec["slug"]: spec for spec in PROPERTIES}
    for quantity in (POISSON, CTE, SPECIFIC_HEAT):
        assert quantity.slug in by_slug
    assert by_slug["coef_poisson"]["canonical_unit"] == "dimensionless"
    assert by_slug["coef_expansao_termica"]["canonical_unit"] == "1/K"
    assert by_slug["calor_especifico"]["canonical_unit"] == "J/(kg*K)"


def test_seed_reference_defines_them_without_any_value(db_session: Session) -> None:
    before = len(_cae_rows(db_session))
    seed_reference(db_session)
    slugs = set(db_session.execute(select(PropertyDefinition.slug)).scalars())
    assert set(CAE_DEMO_SLUGS) <= slugs
    assert len(_cae_rows(db_session)) == before  # reference never writes a value


def test_every_accepted_unit_converts_to_the_canonical_one() -> None:
    for spec in PROPERTIES:
        if spec["slug"] in CAE_DEMO_SLUGS:
            for unit in spec["accepted_units"]:
                to_canonical(1.0, unit, spec["canonical_unit"])


def test_the_baseline_demo_materials_carry_all_three(db_session: Session) -> None:
    rows = _cae_rows(db_session)
    assert len(rows) == 3 * len(DEMO_MATERIALS)
    for row in rows:
        assert row.is_missing is False and row.normalized_value is not None
        assert row.source.is_demo is True
        assert row.material.is_demo is True
        assert row.notes == DEMO_NOTE


def test_the_extended_seed_fills_the_seventy_and_is_idempotent(db_session: Session) -> None:
    source = _demo_source(db_session)
    seed_extended_materials(db_session, source)
    created = seed_demo_cae_values(db_session, source, EXTENDED_DEMO_MATERIALS)
    assert created == 3 * len(EXTENDED_DEMO_MATERIALS)
    assert seed_demo_cae_values(db_session, source, EXTENDED_DEMO_MATERIALS) == 0
    assert seed_demo_cae_values(db_session, source, DEMO_MATERIALS) == 0
    assert len(_cae_rows(db_session)) == 3 * (len(DEMO_MATERIALS) + len(EXTENDED_DEMO_MATERIALS))


def test_values_are_deterministic_and_inside_the_family_band() -> None:
    for spec in [*DEMO_MATERIALS, *EXTENDED_DEMO_MATERIALS]:
        first = demo_cae_values(spec["name"], spec["class_slug"])
        assert first == demo_cae_values(spec["name"], spec["class_slug"])
        for value in first:
            low, high, _unit = _BANDS[spec["class_slug"]][value["slug"]]
            assert low <= value["value"] <= high * (1 + 1e-9)
            assert value["value"] != 0


def test_a_real_material_with_a_demo_name_is_never_written(db_session: Session) -> None:
    name = DEMO_MATERIALS[0]["name"]
    demo = db_session.execute(select(Material).where(Material.name == name)).scalars().one()
    demo.name = "Renomeado para o teste"
    metals = db_session.execute(
        select(MaterialClass).where(MaterialClass.slug == "metais")
    ).scalar_one()
    real = Material(name=name, class_id=metals.id, is_demo=False)
    db_session.add(real)
    db_session.flush()
    assert seed_demo_cae_values(db_session, _demo_source(db_session), DEMO_MATERIALS) == 0
    assert not [row for row in _cae_rows(db_session) if row.material_id == real.id]


def test_clear_demo_removes_the_values_and_keeps_the_definitions(db_session: Session) -> None:
    assert _cae_rows(db_session)
    clear_demo_data(db_session)
    assert _cae_rows(db_session) == []
    slugs = set(db_session.execute(select(PropertyDefinition.slug)).scalars())
    assert set(CAE_DEMO_SLUGS) <= slugs


def test_the_thermal_decks_accept_a_complete_extended_demo_material(
    client: TestClient, db_session: Session
) -> None:
    source = _demo_source(db_session)
    seed_extended_materials(db_session, source)
    seed_demo_cae_values(db_session, source, EXTENDED_DEMO_MATERIALS)
    db_session.commit()
    material = (
        db_session.execute(
            select(Material).where(Material.name == EXTENDED_DEMO_MATERIALS[0]["name"])
        )
        .scalars()
        .one()
    )
    for fmt in ("mapdl", "abaqus", "nastran", "lsdyna", "nastran-thermal", "lsdyna-thermal"):
        response = client.get(
            f"/api/exports/materiais/{material.id}/cae?formato={fmt}&unidades=mm-t-s"
        )
        assert response.status_code == 200, (fmt, response.text)
        assert "MATERIAL FICTICIO" in response.text, fmt
