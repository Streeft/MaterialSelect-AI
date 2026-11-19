"""Rockwell hardness as three scale-specific properties, with demo values only (D-255).

Item 6 of the extended catalogue: B for softer metals, C for hard ones, M for
rigid polymers. Each demo material gets the reading on its family's scale and a
declared absence with the reason on the other two — never zero, never a real
record — and a second run writes nothing.
"""

from __future__ import annotations

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.property_catalog_extended import ROCKWELL_PROPERTIES, ROCKWELL_SLUGS
from app.db.seed import DEMO_MATERIALS, DEMO_SOURCE_LABEL
from app.db.seed_demo_extended_props import Basis
from app.db.seed_demo_rockwell import DEMO_NOTE, rockwell_for, seed_demo_rockwell
from app.db.seed_extended import seed_extended_materials
from app.domain.glossary import load_entries
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition
from app.models.source import Source

B, C, M = ROCKWELL_SLUGS


def _basis(su: float, E: float = 200.0) -> Basis:
    return Basis(rho=7850, E=E, nu=0.3, su=su, sy=None, k=50, cp=460, a=12, cm=1)


class TestDefinitions:
    def test_one_definition_per_scale_with_no_unit_and_no_log_axis(self) -> None:
        assert ROCKWELL_SLUGS == ("dureza_rockwell_b", "dureza_rockwell_c", "dureza_rockwell_m")
        for spec in ROCKWELL_PROPERTIES:
            assert spec["canonical_unit"] == "dimensionless"
            assert spec["allows_log_scale"] is False
            assert spec["symbol"].startswith("HR")

    def test_every_scale_has_a_glossary_entry(self) -> None:
        entries = load_entries()
        assert all(slug in entries for slug in ROCKWELL_SLUGS)


class TestReading:
    def test_a_hard_steel_reads_on_c_only(self) -> None:
        r = rockwell_for("Aço exemplo", {"group": "metal"}, _basis(1500))
        assert 44 <= r[C] <= 48
        assert isinstance(r[B], str) and isinstance(r[M], str)

    def test_a_medium_metal_reads_on_b_only(self) -> None:
        r = rockwell_for("Latão exemplo", {"group": "metal"}, _basis(500, E=100))
        assert 73 <= r[B] <= 77 and "escala B" in r[C]

    def test_a_very_soft_metal_is_out_of_both_scales_not_zero(self) -> None:
        r = rockwell_for("Alumínio puro", {"group": "metal"}, _basis(90, E=69))
        assert all(isinstance(v, str) for v in r.values())

    def test_a_rigid_polymer_reads_on_m_and_a_soft_one_does_not(self) -> None:
        rigid = rockwell_for("PMMA", {"group": "polymer"}, _basis(70, E=3.2))
        assert 82 <= rigid[M] <= 90
        soft = rockwell_for("PEBD", {"group": "polymer"}, _basis(10, E=0.2))
        assert "Shore D" in soft[M]

    @pytest.mark.parametrize("group", ["elastomer", "ceramic", "glass", "wood", "pmc"])
    def test_other_families_say_why(self, group: str) -> None:
        r = rockwell_for("X", {"group": group}, _basis(300))
        assert all(isinstance(v, str) and v.startswith("Não se aplica") for v in r.values())


def _rows(db: Session, material_id: int) -> list[MaterialPropertyValue]:
    return list(
        db.execute(
            select(MaterialPropertyValue)
            .join(PropertyDefinition)
            .where(
                MaterialPropertyValue.material_id == material_id,
                PropertyDefinition.slug.in_(ROCKWELL_SLUGS),
            )
        ).scalars()
    )


@pytest.fixture()
def demo(db_session: Session) -> Source:
    source = db_session.execute(
        select(Source).where(Source.label == DEMO_SOURCE_LABEL)
    ).scalar_one()
    seed_extended_materials(db_session, source)
    return source


def test_every_demo_material_gets_three_rows_and_a_second_run_writes_nothing(
    db_session: Session, demo: Source
) -> None:
    first = seed_demo_rockwell(db_session, demo)
    materials = db_session.scalar(
        select(func.count(Material.id)).where(
            Material.is_demo.is_(True),
            Material.owner_id.is_(None),
            Material.is_synthesized.is_(False),
        )
    )
    assert first["rockwell_values_created"] + first["rockwell_missing_declared"] == 3 * materials
    assert first["rockwell_values_created"] > 0
    second = seed_demo_rockwell(db_session, demo)
    assert set(second.values()) == {0}
    for material in db_session.execute(
        select(Material).where(Material.is_demo.is_(True), Material.owner_id.is_(None))
    ).scalars():
        rows = _rows(db_session, material.id)
        assert len(rows) == 3, material.name
        assert sum(not r.is_missing for r in rows) <= 1  # one scale per material at most
        for row in rows:
            assert row.source.is_demo
            if row.is_missing:
                assert row.normalized_value is None and row.notes.startswith("Não se aplica")
            else:
                assert row.normalized_value > 0 and row.notes == DEMO_NOTE


def test_a_real_material_with_a_demo_name_is_never_touched(
    db_session: Session, demo: Source
) -> None:
    metais = db_session.execute(
        select(MaterialClass).where(MaterialClass.slug == "metais")
    ).scalar_one()
    real = Material(name=DEMO_MATERIALS[0]["name"], class_id=metais.id, is_demo=False)
    db_session.add(real)
    db_session.flush()
    seed_demo_rockwell(db_session, demo)
    assert _rows(db_session, real.id) == []
