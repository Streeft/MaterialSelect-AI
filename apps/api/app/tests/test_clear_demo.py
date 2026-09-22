"""clear_demo: apaga todo material fictício, e só o fictício.

`conftest.py` já roda `seed()` como base de todo teste — os 5 materiais de
demonstração estão sempre lá. Este arquivo confirma o que `clear_demo`
promete: os 5 (e qualquer outro `is_demo=True`) somem, um material real
sobrevive intacto, e a cascata do schema (valores, palavras-chave) não deixa
órfão.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.clear_demo import clear_demo_materials
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_keyword import MaterialKeyword
from app.models.material_property_value import MaterialPropertyValue
from app.repositories.material_repository import MaterialRepository


def _make_real_material(db: Session) -> Material:
    """A material with `is_demo=False`, exactly like an imported/official row."""
    material_class = db.execute(select(MaterialClass)).scalars().first()
    assert material_class is not None
    material = Material(
        name="Aço Oficial 4140 (não fictício)",
        class_id=material_class.id,
        is_demo=False,
        keywords=["oficial"],
    )
    db.add(material)
    db.flush()
    MaterialRepository(db).sync_keywords(material.id, ["oficial"])
    db.flush()
    return material


def test_removes_every_demo_material_and_nothing_else(db_session: Session) -> None:
    real = _make_real_material(db_session)
    demo_ids_before = [
        m.id
        for m in db_session.execute(select(Material).where(Material.is_demo.is_(True))).scalars()
    ]
    assert len(demo_ids_before) == 5  # o baseline do seed principal (D-71)

    removed = clear_demo_materials(db_session)

    assert removed == 5
    remaining = db_session.execute(select(Material)).scalars().all()
    assert [m.id for m in remaining] == [real.id]
    assert remaining[0].is_demo is False


def test_cascade_leaves_no_orphaned_values_or_keywords(db_session: Session) -> None:
    demo = db_session.execute(select(Material).where(Material.is_demo.is_(True))).scalars().first()
    assert demo is not None
    demo_id = demo.id
    values_before = (
        db_session.execute(
            select(MaterialPropertyValue).where(MaterialPropertyValue.material_id == demo_id)
        )
        .scalars()
        .all()
    )
    assert len(values_before) > 0  # o seed principal preenche propriedades

    clear_demo_materials(db_session)
    db_session.flush()

    orphan_values = (
        db_session.execute(
            select(MaterialPropertyValue).where(MaterialPropertyValue.material_id == demo_id)
        )
        .scalars()
        .all()
    )
    orphan_keywords = (
        db_session.execute(select(MaterialKeyword).where(MaterialKeyword.material_id == demo_id))
        .scalars()
        .all()
    )
    assert orphan_values == []
    assert orphan_keywords == []


def test_idempotent_when_nothing_left_to_remove(db_session: Session) -> None:
    clear_demo_materials(db_session)

    second_run = clear_demo_materials(db_session)

    assert second_run == 0


def test_real_material_untouched_when_no_demo_data_exists(db_session: Session) -> None:
    clear_demo_materials(db_session)
    real = _make_real_material(db_session)

    removed = clear_demo_materials(db_session)

    assert removed == 0
    still_there = (
        db_session.execute(select(Material).where(Material.id == real.id)).scalars().one_or_none()
    )
    assert still_there is not None
