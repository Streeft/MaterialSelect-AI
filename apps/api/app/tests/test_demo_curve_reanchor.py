"""The demo stress–strain curves re-anchored on the catalogued elongation (D-255).

Item 5 of the extended catalogue (D-188): the curves (D-107) were derived before
the demo materials had an elongation at break, so each broke where its shape's
premise put it. ``reanchor_demo_stress_strain`` rewrites them from the current
values — only demo curves of demo materials, only those still exactly as
seeded, keeping the curve's id — and a second run rewrites nothing.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.calculations.units import to_canonical
from app.db.seed import DEMO_SOURCE_LABEL
from app.db.seed_demo_extended_props import seed_demo_extended_properties
from app.db.seed_extended import (
    TCC_DEMO_MATERIALS,
    reanchor_demo_stress_strain_all,
    seed_demo_catalog_expansion,
    seed_extended_materials,
)
from app.db.seed_extended_identity import seed_extended_identity
from app.models.enums import CurveKind
from app.models.material import Material
from app.models.material_curve import MaterialCurve
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition
from app.models.source import Source

ANCHORED = "A ruptura coincide com o alongamento cadastrado"


def _slice() -> list[dict]:
    """A few TCC materials of each curve shape, so every branch is exercised."""
    chosen: list[dict] = []
    seen: dict[str, int] = {}
    for material in TCC_DEMO_MATERIALS:
        shape = (material.get("curve_hint") or {}).get("shape", "classe")
        if seen.get(shape, 0) < 3:
            chosen.append(material)
            seen[shape] = seen.get(shape, 0) + 1
    return chosen


@pytest.fixture()
def demo(db_session: Session) -> Source:
    source = db_session.execute(
        select(Source).where(Source.label == DEMO_SOURCE_LABEL)
    ).scalar_one()
    seed_extended_materials(db_session, source)
    seed_demo_catalog_expansion(db_session, source, specs=_slice())
    seed_extended_identity(db_session, source)
    seed_demo_extended_properties(db_session, source)
    return source


def _stress_strain(db: Session) -> list[MaterialCurve]:
    return list(
        db.execute(
            select(MaterialCurve)
            .where(MaterialCurve.kind == CurveKind.TENSAO_DEFORMACAO)
            .order_by(MaterialCurve.id)
        ).scalars()
    )


def _elongation_pct(db: Session, material_id: int) -> float | None:
    return db.execute(
        select(MaterialPropertyValue.normalized_value)
        .join(PropertyDefinition, PropertyDefinition.id == MaterialPropertyValue.property_id)
        .where(
            MaterialPropertyValue.material_id == material_id,
            PropertyDefinition.slug == "alongamento",
            MaterialPropertyValue.is_missing.is_(False),
        )
    ).scalar_one_or_none()


def test_the_first_run_reanchors_and_the_second_rewrites_nothing(
    db_session: Session, demo: Source
) -> None:
    ids_before = {c.id for c in _stress_strain(db_session)}
    first = reanchor_demo_stress_strain_all(db_session)
    assert first["stress_strain_reanchored"] > 0
    assert {c.id for c in _stress_strain(db_session)} == ids_before  # same ids, no new curve
    second = reanchor_demo_stress_strain_all(db_session)
    assert second == {"stress_strain_reanchored": 0}


def test_an_anchored_curve_breaks_at_the_catalogued_elongation(
    db_session: Session, demo: Source
) -> None:
    reanchor_demo_stress_strain_all(db_session)
    anchored = [c for c in _stress_strain(db_session) if ANCHORED in (c.description or "")]
    assert anchored
    for curve in anchored:
        elongation = _elongation_pct(db_session, curve.material_id)
        assert elongation is not None
        ambient = curve.series[0]
        last = ambient.points[-1]
        assert last.x_value == pytest.approx(elongation, rel=1e-3), curve.material.name
        assert to_canonical(last.x_value, "percent", "dimensionless")[0] > 0
        # Strictly increasing strain: the curve the builder accepted.
        xs = [p.x_value for p in ambient.points]
        assert xs == sorted(xs) and len(set(xs)) == len(xs)
        assert curve.is_demo and curve.source.is_demo


def test_every_description_fits_its_column(db_session: Session, demo: Source) -> None:
    reanchor_demo_stress_strain_all(db_session)
    assert all(len(c.description or "") <= 1000 for c in _stress_strain(db_session))


def test_an_edited_curve_is_left_as_it_is(db_session: Session, demo: Source) -> None:
    curves = [c for c in _stress_strain(db_session) if c.material.is_demo]
    target = next(c for c in curves if _elongation_pct(db_session, c.material_id) is not None)
    target.series[0].points[-1].y_value = target.series[0].points[-1].y_value + 1.0
    db_session.flush()
    edited = [(p.x_value, p.y_value) for p in target.series[0].points]
    reanchor_demo_stress_strain_all(db_session)
    db_session.expire_all()
    again = db_session.get(MaterialCurve, target.id)
    assert again is not None
    assert [(p.x_value, p.y_value) for p in again.series[0].points] == edited
    assert ANCHORED not in (again.description or "")


def test_a_real_material_is_never_touched(db_session: Session, demo: Source) -> None:
    demo_curve = next(c for c in _stress_strain(db_session) if c.material.is_demo)
    material = db_session.get(Material, demo_curve.material_id)
    assert material is not None
    material.is_demo = False  # the same rows, now a real record
    db_session.flush()
    before = [(p.x_value, p.y_value) for p in demo_curve.series[0].points]
    reanchor_demo_stress_strain_all(db_session)
    db_session.expire_all()
    again = db_session.get(MaterialCurve, demo_curve.id)
    assert again is not None
    assert [(p.x_value, p.y_value) for p in again.series[0].points] == before
