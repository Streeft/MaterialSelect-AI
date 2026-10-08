"""clear_demo: apaga todo material fictício, e só o fictício.

`conftest.py` já roda `seed()` como base de todo teste — os 5 materiais de
demonstração estão sempre lá. Este arquivo confirma o que `clear_demo`
promete: os 5 (e qualquer outro `is_demo=True`) somem, um material real
sobrevive intacto, e a cascata do schema (valores, palavras-chave) não deixa
órfão.
"""

from __future__ import annotations

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.clear_demo import clear_demo_data, clear_demo_materials
from app.models.battery_chemistry import BatteryChemistry
from app.models.catalog import CatalogDataset
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_composition import MaterialCompositionEntry
from app.models.material_curve import MaterialCurve, MaterialCurvePoint, MaterialCurveSeries
from app.models.material_designation import MaterialDesignation
from app.models.material_keyword import MaterialKeyword
from app.models.material_property_value import MaterialPropertyValue
from app.models.performance_index import PerformanceIndex
from app.models.process import Process
from app.models.source import Source
from app.models.transport_mode import TransportMode
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


def test_clear_demo_data_covers_all_demo_universes(db_session: Session) -> None:
    demo_materials = db_session.scalar(
        select(func.count(Material.id)).where(Material.is_demo.is_(True))
    )
    demo_processes = db_session.scalar(
        select(func.count(Process.id)).where(Process.is_demo.is_(True))
    )
    demo_transports = db_session.scalar(
        select(func.count(TransportMode.id)).where(TransportMode.is_demo.is_(True))
    )
    demo_batteries = db_session.scalar(
        select(func.count(BatteryChemistry.id)).where(BatteryChemistry.is_demo.is_(True))
    )
    demo_indices = db_session.scalar(
        select(func.count(PerformanceIndex.id)).where(PerformanceIndex.is_demo.is_(True))
    )
    demo_sources = db_session.scalar(select(func.count(Source.id)).where(Source.is_demo.is_(True)))
    # D-105: o seed principal também liga designações e composição fictícias.
    demo_designations = db_session.scalar(select(func.count(MaterialDesignation.id)))
    demo_entries = db_session.scalar(select(func.count(MaterialCompositionEntry.id)))
    assert demo_designations and demo_entries
    # D-106: e as curvas fictícias, com séries e pontos.
    demo_curves = db_session.scalar(select(func.count(MaterialCurve.id)))
    assert demo_curves
    # D-107: releases fictícias do catálogo (o seed demo pode trazê-las).
    demo_releases = db_session.scalar(
        select(func.count(CatalogDataset.id)).where(CatalogDataset.is_demo.is_(True))
    )
    assert demo_materials and demo_materials > 0
    assert demo_processes and demo_processes > 0
    assert demo_transports and demo_transports > 0
    assert demo_batteries == 0
    assert demo_indices == 0
    assert demo_sources and demo_sources > 0

    removed = clear_demo_data(db_session)
    db_session.flush()

    assert removed == {
        "materials": demo_materials,
        "processes": demo_processes,
        "transport_modes": demo_transports,
        "battery_chemistries": demo_batteries,
        "performance_indices": demo_indices,
        "sources": demo_sources,
        "designations": demo_designations,
        "composition_entries": demo_entries,
        "curves": demo_curves,
        "catalog_releases": demo_releases,
    }
    # The cascade is written in Python: no series or point outlives its curve.
    assert db_session.scalar(select(func.count(MaterialCurve.id))) == 0
    assert db_session.scalar(select(func.count(MaterialCurveSeries.id))) == 0
    assert db_session.scalar(select(func.count(MaterialCurvePoint.id))) == 0
    assert db_session.scalar(select(func.count(Material.id)).where(Material.is_demo.is_(True))) == 0
    assert db_session.scalar(select(func.count(Process.id)).where(Process.is_demo.is_(True))) == 0
    assert (
        db_session.scalar(
            select(func.count(TransportMode.id)).where(TransportMode.is_demo.is_(True))
        )
        == 0
    )
    assert (
        db_session.scalar(
            select(func.count(BatteryChemistry.id)).where(BatteryChemistry.is_demo.is_(True))
        )
        == 0
    )
    assert (
        db_session.scalar(
            select(func.count(PerformanceIndex.id)).where(PerformanceIndex.is_demo.is_(True))
        )
        == 0
    )
    assert db_session.scalar(select(func.count(Source.id)).where(Source.is_demo.is_(True))) == 0


def test_demo_source_cleanup_fails_closed_if_real_record_still_cites_it(
    db_session: Session,
) -> None:
    demo_source = db_session.execute(select(Source).where(Source.is_demo.is_(True))).scalars().one()
    db_session.add(
        TransportMode(
            slug="real-mode-citing-demo-source",
            name="Modal real com fonte inconsistente",
            energy_intensity=1.0,
            carbon_intensity=0.1,
            display_order=999,
            is_active=True,
            is_demo=False,
            source_id=demo_source.id,
        )
    )
    db_session.flush()

    with pytest.raises(RuntimeError, match="preservar proveniência"):
        clear_demo_data(db_session)
