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

from app.domain.release_diff import (
    COMPOSITION_UNIT,
    TRANSPORT_CLASS_NAME,
    TRANSPORT_CLASS_SLUG,
    CompositionSnapshot,
    CurvePointSnapshot,
    CurveSeriesSnapshot,
    CurveSnapshot,
    RecordSnapshot,
    Universe,
    ValueSnapshot,
)
from app.models.catalog import CatalogDataset, CatalogImportRun, CatalogRecordRef
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_composition import MaterialCompositionEntry
from app.models.material_curve import MaterialCurve, MaterialCurvePoint, MaterialCurveSeries
from app.models.material_property_value import MaterialPropertyValue
from app.models.process import Process, ProcessClass
from app.models.process_attribute import ProcessAttributeDefinition, ProcessAttributeValue
from app.models.property_definition import PropertyDefinition
from app.models.source import Source
from app.models.transport_mode import TransportMode
from app.repositories.visibility import visible_materials

#: Keys of the values of a process / transport mode in ``RecordSnapshot.values``.
ATTRIBUTE_PREFIX = "atributo:"
TRANSPORT_ENERGY_KEY = "modal:intensidade_energetica"
TRANSPORT_CARBON_KEY = "modal:intensidade_carbono"
TRANSPORT_ENERGY_UNIT = "MJ/(t*km)"
TRANSPORT_CARBON_UNIT = "kg CO2/(t*km)"


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
            or self.db.execute(
                select(ProcessClass.id).where(ProcessClass.slug == slug)
            ).scalar_one_or_none()
            is not None
            or slug == TRANSPORT_CLASS_SLUG
        )

    def snapshots(self, dataset_id: int) -> list[RecordSnapshot]:
        """Every shared record of one release, in the three universes."""
        return [
            *self.material_snapshots(dataset_id),
            *self.process_snapshots(dataset_id),
            *self.transport_snapshots(dataset_id),
        ]

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

        composition = self._compositions(dataset_id, set(values))
        curves = self._curves(dataset_id, set(values))
        return [
            RecordSnapshot(
                external_table=row[0],
                external_record_id=row[1],
                external_gruid=row[2],
                raw_record_sha256=row[3],
                record_id=row[4],
                name=row[5],
                subclass=row[6],
                description=row[7],
                is_active=bool(row[8]),
                class_slug=row[9],
                class_name=row[10],
                values=values[row[4]],
                composition=composition.get(row[4], {}),
                curves=curves.get(row[4], {}),
            )
            for row in records
        ]

    def _compositions(
        self, dataset_id: int, material_ids: set[int]
    ) -> dict[int, dict[str, CompositionSnapshot]]:
        """Composition rows per material, as mass percent (the canonical unit).

        The numbers are the **normalized** ones: the source's unit (``wt%``) is
        not a Pint unit and the comparison is in mass percent anyway. A balance
        row has no number and stays a balance; it is never filled in.
        """
        out: dict[int, dict[str, CompositionSnapshot]] = {}
        rows = self.db.execute(
            select(MaterialCompositionEntry)
            .join(
                CatalogRecordRef,
                CatalogRecordRef.material_id == MaterialCompositionEntry.material_id,
            )
            .where(CatalogRecordRef.dataset_id == dataset_id)
        ).scalars()
        for entry in rows:
            if entry.material_id not in material_ids:
                continue
            nominal, low, high = (
                entry.normalized_nominal,
                entry.normalized_min,
                entry.normalized_max,
            )
            bounded = low is not None or high is not None
            out.setdefault(entry.material_id, {})[entry.element] = CompositionSnapshot(
                is_balance=bool(entry.is_balance),
                value=ValueSnapshot(
                    is_missing=bool(entry.is_missing) or bool(entry.is_balance),
                    value_scalar=None if bounded else nominal,
                    value_min=low,
                    value_max=high,
                    value_typical=nominal if bounded else None,
                    original_unit=COMPOSITION_UNIT,
                    normalized_value=nominal,
                    canonical_unit=COMPOSITION_UNIT,
                ),
            )
        return out

    def _curves(
        self, dataset_id: int, material_ids: set[int]
    ) -> dict[int, dict[str, CurveSnapshot]]:
        """The curves a release wrote (identity: dataset + external id), per material."""
        out: dict[int, dict[str, CurveSnapshot]] = {}
        curves = list(
            self.db.execute(
                select(MaterialCurve)
                .where(MaterialCurve.dataset_id == dataset_id)
                .order_by(MaterialCurve.id)
            ).scalars()
        )
        if not curves:
            return out
        series_by_curve: dict[int, list[MaterialCurveSeries]] = {}
        for series in self.db.execute(
            select(MaterialCurveSeries)
            .join(MaterialCurve, MaterialCurve.id == MaterialCurveSeries.curve_id)
            .where(MaterialCurve.dataset_id == dataset_id)
            .order_by(MaterialCurveSeries.curve_id, MaterialCurveSeries.position)
        ).scalars():
            series_by_curve.setdefault(series.curve_id, []).append(series)
        points_by_series: dict[int, list[CurvePointSnapshot]] = {}
        for point in self.db.execute(
            select(MaterialCurvePoint)
            .join(MaterialCurveSeries, MaterialCurveSeries.id == MaterialCurvePoint.series_id)
            .join(MaterialCurve, MaterialCurve.id == MaterialCurveSeries.curve_id)
            .where(MaterialCurve.dataset_id == dataset_id)
            .order_by(MaterialCurvePoint.series_id, MaterialCurvePoint.position)
        ).scalars():
            points_by_series.setdefault(point.series_id, []).append(
                CurvePointSnapshot(
                    x_value=point.x_value,
                    y_value=point.y_value,
                    y_min_value=point.y_min_value,
                    y_max_value=point.y_max_value,
                    x_normalized=point.x_normalized,
                    y_normalized=point.y_normalized,
                    y_min_normalized=point.y_min_normalized,
                    y_max_normalized=point.y_max_normalized,
                )
            )
        for curve in curves:
            if curve.material_id not in material_ids or curve.external_id is None:
                continue
            out.setdefault(curve.material_id, {})[curve.external_id] = CurveSnapshot(
                external_id=curve.external_id,
                title=curve.title,
                kind=str(getattr(curve.kind, "value", curve.kind)),
                description=curve.description,
                x_label=curve.x_label,
                y_label=curve.y_label,
                x_quantity=curve.x_quantity,
                y_quantity=curve.y_quantity,
                x_original_unit=curve.x_original_unit,
                y_original_unit=curve.y_original_unit,
                x_canonical_unit=curve.x_canonical_unit,
                y_canonical_unit=curve.y_canonical_unit,
                series=tuple(
                    CurveSeriesSnapshot(
                        position=series.position,
                        label=series.label,
                        conditions=series.conditions,
                        parameter_value=series.parameter_value,
                        parameter_original_unit=series.parameter_original_unit,
                        parameter_normalized=series.parameter_normalized,
                        points=tuple(points_by_series.get(series.id, [])),
                    )
                    for series in series_by_curve.get(curve.id, [])
                ),
            )
        return out

    def process_snapshots(self, dataset_id: int) -> list[RecordSnapshot]:
        """Every process of one release with its attribute values (keys ``atributo:<slug>``)."""
        records = self.db.execute(
            select(
                CatalogRecordRef.external_table,
                CatalogRecordRef.external_record_id,
                CatalogRecordRef.external_gruid,
                CatalogRecordRef.raw_record_sha256,
                Process.id,
                Process.name,
                Process.description,
                Process.is_active,
                ProcessClass.slug,
                ProcessClass.name,
            )
            .join(Process, Process.id == CatalogRecordRef.process_id)
            .join(ProcessClass, ProcessClass.id == Process.class_id)
            .where(CatalogRecordRef.dataset_id == dataset_id)
        ).all()
        values: dict[int, dict[str, ValueSnapshot]] = {row[4]: {} for row in records}
        for value, slug in self.db.execute(
            select(ProcessAttributeValue, ProcessAttributeDefinition.slug)
            .join(
                ProcessAttributeDefinition,
                ProcessAttributeDefinition.id == ProcessAttributeValue.attribute_id,
            )
            .join(
                CatalogRecordRef,
                CatalogRecordRef.process_id == ProcessAttributeValue.process_id,
            )
            .where(CatalogRecordRef.dataset_id == dataset_id)
        ):
            if value.process_id not in values:
                continue
            values[value.process_id][f"{ATTRIBUTE_PREFIX}{slug}"] = ValueSnapshot(
                is_missing=bool(value.is_missing),
                value_scalar=value.value_scalar,
                value_min=value.value_min,
                value_max=value.value_max,
                value_typical=value.value_typical,
                original_unit=value.original_unit,
                normalized_value=value.normalized_value,
                canonical_unit=value.canonical_unit,
                conversion_method=value.conversion_method,
                uncertainty=value.uncertainty,
                measurement_condition=value.measurement_condition,
                labels=tuple(value.labels or ()),
            )
        return [
            RecordSnapshot(
                external_table=row[0],
                external_record_id=row[1],
                external_gruid=row[2],
                raw_record_sha256=row[3],
                record_id=row[4],
                name=row[5],
                description=row[6],
                is_active=bool(row[7]),
                class_slug=row[8],
                class_name=row[9],
                universe=Universe.PROCESS,
                values=values[row[4]],
            )
            for row in records
        ]

    def transport_snapshots(self, dataset_id: int) -> list[RecordSnapshot]:
        """Every transport mode a release references.

        A mode is reused by slug across releases (the importer adds a new
        identity row, not a new mode), so only its presence differs between
        releases today; the values are still read so the day a mode is written
        per release the diff already compares them.
        """
        out = []
        for ref, mode in self.db.execute(
            select(CatalogRecordRef, TransportMode)
            .join(TransportMode, TransportMode.id == CatalogRecordRef.transport_mode_id)
            .where(CatalogRecordRef.dataset_id == dataset_id)
        ):
            values: dict[str, ValueSnapshot] = {}
            for key, number, unit in (
                (TRANSPORT_ENERGY_KEY, mode.energy_intensity, TRANSPORT_ENERGY_UNIT),
                (TRANSPORT_CARBON_KEY, mode.carbon_intensity, TRANSPORT_CARBON_UNIT),
            ):
                if number is not None:
                    values[key] = ValueSnapshot(
                        is_missing=False,
                        value_scalar=number,
                        original_unit=unit,
                        normalized_value=number,
                        canonical_unit=unit,
                    )
            out.append(
                RecordSnapshot(
                    external_table=ref.external_table,
                    external_record_id=ref.external_record_id,
                    external_gruid=ref.external_gruid,
                    raw_record_sha256=ref.raw_record_sha256,
                    record_id=mode.id,
                    name=mode.name,
                    description=mode.description,
                    is_active=bool(mode.is_active),
                    class_slug=TRANSPORT_CLASS_SLUG,
                    class_name=TRANSPORT_CLASS_NAME,
                    universe=Universe.TRANSPORT,
                    values=values,
                )
            )
        return out

    def process_attribute_definitions(self, keys: set[str]) -> list[ProcessAttributeDefinition]:
        slugs = sorted(
            k.removeprefix(ATTRIBUTE_PREFIX) for k in keys if k.startswith(ATTRIBUTE_PREFIX)
        )
        if not slugs:
            return []
        return list(
            self.db.execute(
                select(ProcessAttributeDefinition).where(ProcessAttributeDefinition.slug.in_(slugs))
            ).scalars()
        )

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
