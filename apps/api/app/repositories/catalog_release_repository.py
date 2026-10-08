"""Reads the releases of the official catalogue and what each one stored (D-108).

Read-only by construction: nothing here adds, updates or deletes a row, so a
diff can never touch the releases it compares (D-102, release imutável).

**Only the shared catalogue.** Every material read goes through
``visible_materials(None)`` — the fail-closed form of the D-62 predicate, which
is "shared rows only". An identity row of a release can only point at a shared
material through the importer; if one ever pointed at somebody's own record,
the record would still not enter the diff, for its owner or anyone else.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain.release_diff import RecordSnapshot, ValueSnapshot
from app.models.catalog import CatalogDataset, CatalogImportRun, CatalogRecordRef
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition
from app.models.source import Source
from app.repositories.visibility import visible_materials


@dataclass(frozen=True)
class ReleaseRow:
    """A release with what the listing needs beside its own columns."""

    dataset: CatalogDataset
    material_count: int
    imported_at: datetime | None
    bundle_sha256: str | None
    manifest_sha256: str | None


class CatalogReleaseRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _rows(self, datasets: list[CatalogDataset]) -> list[ReleaseRow]:
        if not datasets:
            return []
        ids = [dataset.id for dataset in datasets]
        counts = dict(
            self.db.execute(
                select(CatalogRecordRef.dataset_id, func.count(CatalogRecordRef.id))
                .join(Material, Material.id == CatalogRecordRef.material_id)
                .where(CatalogRecordRef.dataset_id.in_(ids), visible_materials(None))
                .group_by(CatalogRecordRef.dataset_id)
            ).all()
        )
        # The last committed run of each release: when it was imported, and the
        # bytes it was imported from (provenance for the exported file).
        runs: dict[int, CatalogImportRun] = {}
        for run in self.db.execute(
            select(CatalogImportRun)
            .where(CatalogImportRun.dataset_id.in_(ids), CatalogImportRun.status == "COMMITTED")
            .order_by(CatalogImportRun.id)
        ).scalars():
            runs[run.dataset_id] = run
        return [
            ReleaseRow(
                dataset=dataset,
                material_count=counts.get(dataset.id, 0),
                imported_at=runs[dataset.id].completed_at if dataset.id in runs else None,
                bundle_sha256=runs[dataset.id].bundle_sha256 if dataset.id in runs else None,
                manifest_sha256=runs[dataset.id].manifest_sha256 if dataset.id in runs else None,
            )
            for dataset in datasets
        ]

    def list_releases(self) -> list[ReleaseRow]:
        """Every release, grouped by lineage and in import order inside it.

        A release without lineage sorts last; the order inside a lineage is the
        order the releases were written (``created_at``, then id), which is the
        only order the database knows — the free-text ``release`` label is not
        sortable.
        """
        datasets = list(
            self.db.execute(
                select(CatalogDataset).order_by(
                    CatalogDataset.lineage.is_(None),
                    CatalogDataset.lineage,
                    CatalogDataset.created_at,
                    CatalogDataset.id,
                )
            ).scalars()
        )
        return self._rows(datasets)

    def class_exists(self, slug: str) -> bool:
        return (
            self.db.execute(
                select(MaterialClass.id).where(MaterialClass.slug == slug)
            ).scalar_one_or_none()
            is not None
        )

    def material_snapshots(self, dataset_id: int) -> list[RecordSnapshot]:
        """Every shared material record of one release with all its stored values.

        Two statements, not one per record: the records, then every value of
        those records joined through the same identity rows.
        """
        records = self.db.execute(
            select(
                CatalogRecordRef.external_table,
                CatalogRecordRef.external_record_id,
                CatalogRecordRef.external_gruid,
                CatalogRecordRef.raw_record_sha256,
                Material.id,
                Material.name,
                Material.subclass,
                Material.description,
                Material.is_active,
                MaterialClass.slug,
                MaterialClass.name,
            )
            .join(Material, Material.id == CatalogRecordRef.material_id)
            .join(MaterialClass, MaterialClass.id == Material.class_id)
            .where(CatalogRecordRef.dataset_id == dataset_id, visible_materials(None))
        ).all()

        values: dict[int, dict[str, ValueSnapshot]] = {row[4]: {} for row in records}
        for row in self.db.execute(
            select(
                MaterialPropertyValue.material_id,
                PropertyDefinition.slug,
                MaterialPropertyValue.is_missing,
                MaterialPropertyValue.value_scalar,
                MaterialPropertyValue.value_min,
                MaterialPropertyValue.value_max,
                MaterialPropertyValue.value_typical,
                MaterialPropertyValue.original_unit,
                MaterialPropertyValue.normalized_value,
                MaterialPropertyValue.canonical_unit,
                MaterialPropertyValue.conversion_method,
                MaterialPropertyValue.uncertainty,
                MaterialPropertyValue.measurement_condition,
            )
            .join(PropertyDefinition, PropertyDefinition.id == MaterialPropertyValue.property_id)
            .join(
                CatalogRecordRef,
                CatalogRecordRef.material_id == MaterialPropertyValue.material_id,
            )
            .where(CatalogRecordRef.dataset_id == dataset_id)
        ):
            if row[0] not in values:
                continue  # a value of a record the visibility rule left out
            values[row[0]][row[1]] = ValueSnapshot(
                is_missing=bool(row[2]),
                value_scalar=row[3],
                value_min=row[4],
                value_max=row[5],
                value_typical=row[6],
                original_unit=row[7],
                normalized_value=row[8],
                canonical_unit=row[9],
                conversion_method=row[10],
                uncertainty=row[11],
                measurement_condition=row[12],
            )

        return [
            RecordSnapshot(
                external_table=row[0],
                external_record_id=row[1],
                external_gruid=row[2],
                raw_record_sha256=row[3],
                material_id=row[4],
                name=row[5],
                subclass=row[6],
                description=row[7],
                is_active=bool(row[8]),
                class_slug=row[9],
                class_name=row[10],
                values=values[row[4]],
            )
            for row in records
        ]

    def property_definitions(self, slugs: set[str]) -> list[PropertyDefinition]:
        if not slugs:
            return []
        return list(
            self.db.execute(
                select(PropertyDefinition).where(PropertyDefinition.slug.in_(sorted(slugs)))
            ).scalars()
        )

    def value_sources(self, dataset_id: int) -> list[tuple[str, bool]]:
        """The sources the values of one release cite: ``(label, is_demo)``, by label."""
        rows = self.db.execute(
            select(Source.label, Source.is_demo)
            .join(MaterialPropertyValue, MaterialPropertyValue.source_id == Source.id)
            .join(
                CatalogRecordRef,
                CatalogRecordRef.material_id == MaterialPropertyValue.material_id,
            )
            .join(Material, Material.id == CatalogRecordRef.material_id)
            .where(CatalogRecordRef.dataset_id == dataset_id, visible_materials(None))
            .distinct()
            .order_by(Source.label)
        ).all()
        return [(label, bool(is_demo)) for label, is_demo in rows]
