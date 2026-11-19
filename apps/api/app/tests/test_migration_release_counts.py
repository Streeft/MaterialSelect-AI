"""The D-250 migration: ``catalog_release_count`` up with the backfill, down, up.

Releases imported before the table existed are counted by the migration from
the rows they left (``origin = 'backfill'``), each from **its own** materials —
the correlated subqueries are the part a typo would break silently, so the
numbers are checked against a hand count, and against what the importer's own
``ReleaseCountRepository.measure`` gives for the same rows.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config
from sqlalchemy.orm import Session

from alembic import command
from app.config import settings
from app.models.catalog import CatalogDataset, CatalogRecordRef
from app.models.enums import PropertyCategory
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition
from app.repositories.release_count_repository import ReleaseCountRepository

PRE_REVISION = "13dda33de502"
REVISION = "e62aba5c6884"


def _config(url: str) -> Config:
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[2] / "alembic"))
    config.set_main_option("sqlalchemy.url", url)
    return config


def _seed_two_releases(engine: sa.Engine) -> None:
    """R1: three materials of two classes, 4 numbers + 1 declared absence over
    two properties. R2: one of those materials, 2 numbers. R3: nothing."""
    with Session(engine) as db:
        metais = MaterialClass(name="Metais", slug="metais")
        polimeros = MaterialClass(name="Polímeros", slug="polimeros")
        rho = PropertyDefinition(
            name="Densidade",
            slug="densidade",
            category=PropertyCategory.FISICA,
            canonical_unit="kg/m**3",
        )
        e = PropertyDefinition(
            name="Módulo",
            slug="modulo_young",
            category=PropertyCategory.MECANICA,
            canonical_unit="Pa",
        )
        db.add_all([metais, polimeros, rho, e])
        db.flush()
        a = Material(name="A", class_id=metais.id, keywords=[])
        b = Material(name="B", class_id=metais.id, keywords=[])
        c = Material(name="C", class_id=polimeros.id, keywords=[])
        db.add_all([a, b, c])
        db.flush()

        def value(material: Material, prop: PropertyDefinition, v: float | None) -> None:
            db.add(
                MaterialPropertyValue(
                    material_id=material.id,
                    property_id=prop.id,
                    value_scalar=v,
                    normalized_value=v,
                    canonical_unit=prop.canonical_unit,
                    is_missing=v is None,
                )
            )

        value(a, rho, 2700.0)
        value(a, e, 69e9)
        value(b, rho, 7850.0)
        value(c, rho, 1050.0)
        value(c, e, None)  # declared absent: never a number, never 0

        created = datetime(2026, 1, 1, tzinfo=UTC)
        releases = [
            CatalogDataset(
                slug=f"r{i}",
                name="Catálogo",
                release=f"R{i}",
                lineage="cat",
                source_sha256="0" * 64,
                license_label="teste",
                created_at=created,
            )
            for i in (1, 2, 3)
        ]
        db.add_all(releases)
        db.flush()
        for i, material in enumerate((a, b, c)):
            db.add(
                CatalogRecordRef(
                    dataset_id=releases[0].id,
                    external_table="materials",
                    external_record_id=str(i),
                    raw_record_sha256="0" * 64,
                    material_id=material.id,
                )
            )
        db.add(
            CatalogRecordRef(
                dataset_id=releases[1].id,
                external_table="materials",
                external_record_id="0",
                raw_record_sha256="0" * 64,
                material_id=a.id,
            )
        )
        db.commit()


def test_the_backfill_counts_each_release_from_its_own_rows(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    url = f"sqlite:///{tmp_path / 'releases.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = _config(url)
    command.upgrade(config, PRE_REVISION)
    engine = sa.create_engine(url)
    try:
        _seed_two_releases(engine)
        command.upgrade(config, REVISION)
        with engine.connect() as conn:
            rows = conn.execute(
                sa.text(
                    "SELECT d.slug, c.materials, c.classes, c.properties, c.values_filled, "
                    "c.values_declared_missing, c.processes, c.origin "
                    "FROM catalog_release_count c JOIN catalog_dataset d ON d.id = c.dataset_id "
                    "ORDER BY d.slug"
                )
            ).all()
        assert [tuple(r) for r in rows] == [
            ("r1", 3, 2, 2, 4, 1, 0, "backfill"),
            ("r2", 1, 1, 2, 2, 0, 0, "backfill"),
            ("r3", 0, 0, 0, 0, 0, 0, "backfill"),
        ]
        # The importer's own counting reads the same rows the same way.
        with Session(engine) as db:
            repo = ReleaseCountRepository(db)
            for slug, materials, classes, properties, filled, missing, processes, _ in rows:
                dataset_id = db.scalar(
                    sa.select(CatalogDataset.id).where(CatalogDataset.slug == slug)
                )
                tally = repo.measure(dataset_id)
                assert (
                    tally.materials,
                    tally.classes,
                    tally.properties,
                    tally.values_filled,
                    tally.values_declared_missing,
                    tally.processes,
                ) == (materials, classes, properties, filled, missing, processes)

        command.downgrade(config, PRE_REVISION)
        assert "catalog_release_count" not in sa.inspect(engine).get_table_names()
        assert "catalog_dataset" in sa.inspect(engine).get_table_names()
        command.upgrade(config, REVISION)
        assert "catalog_release_count" in sa.inspect(engine).get_table_names()
    finally:
        engine.dispose()
