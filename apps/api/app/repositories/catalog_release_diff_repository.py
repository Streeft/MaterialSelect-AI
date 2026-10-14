"""The stored diff between two releases and the fingerprint that guards it (D-123).

Separate from ``CatalogReleaseRepository`` on purpose: that one is read-only by
construction, and this one writes — only to ``catalog_release_diff``, a cache
of a computation, never to a row of a release.

**The fingerprint is the second lock, not the first.** The first is the
invalidation on write (``app.db.release_diff_invalidation``): any write to a
row the diff reads deletes every stored diff in the same transaction. The
fingerprint catches what does not go through the ORM session — a row inserted
or deleted by hand, a cascade — by aggregating, in the database, the identity
of every row each release stored: counts and id sums per table, the active
flags, and the whole content of the small definition tables whose names and
units the diff writes. It cannot see a number edited in place by hand; that
is why the invalidation exists and why D-116 keeps official records read-only.
"""

from __future__ import annotations

import hashlib
import json

from sqlalchemy import case, delete, func, select
from sqlalchemy.orm import Session

from app.models.catalog import CatalogRecordRef, CatalogReleaseDiff
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_composition import MaterialCompositionEntry
from app.models.material_curve import MaterialCurve, MaterialCurvePoint, MaterialCurveSeries
from app.models.material_property_value import MaterialPropertyValue
from app.models.process import Process, ProcessClass
from app.models.process_attribute import ProcessAttributeDefinition, ProcessAttributeValue
from app.models.property_definition import PropertyDefinition
from app.models.transport_mode import TransportMode


def _flag_sum(column):  # noqa: ANN001, ANN202 - SQL expression helper
    return func.coalesce(func.sum(case((column.is_(True), 1), else_=0)), 0)


class CatalogReleaseDiffRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # -- the fingerprint ------------------------------------------------------

    def _dataset_aggregates(self, dataset_id: int) -> list[object]:
        ref = CatalogRecordRef
        by_ref = ref.dataset_id == dataset_id
        out: list[object] = []
        out.append(
            self.db.execute(
                select(
                    func.count(ref.id),
                    func.coalesce(func.sum(ref.id), 0),
                    func.coalesce(func.sum(ref.material_id), 0),
                    func.coalesce(func.sum(ref.process_id), 0),
                    func.coalesce(func.sum(ref.transport_mode_id), 0),
                ).where(by_ref)
            ).one()
        )
        out.append(
            self.db.execute(
                select(func.count(Material.id), _flag_sum(Material.is_active))
                .join(ref, ref.material_id == Material.id)
                .where(by_ref)
            ).one()
        )
        out.append(
            self.db.execute(
                select(func.count(Process.id), _flag_sum(Process.is_active))
                .join(ref, ref.process_id == Process.id)
                .where(by_ref)
            ).one()
        )
        for model, column in (
            (MaterialPropertyValue, MaterialPropertyValue.material_id),
            (MaterialCompositionEntry, MaterialCompositionEntry.material_id),
            (ProcessAttributeValue, ProcessAttributeValue.process_id),
        ):
            target = ref.material_id if model is not ProcessAttributeValue else ref.process_id
            out.append(
                self.db.execute(
                    select(func.count(model.id), func.coalesce(func.sum(model.id), 0))
                    .join(ref, target == column)
                    .where(by_ref)
                ).one()
            )
        by_curve = MaterialCurve.dataset_id == dataset_id
        out.append(
            self.db.execute(
                select(
                    func.count(MaterialCurve.id), func.coalesce(func.sum(MaterialCurve.id), 0)
                ).where(by_curve)
            ).one()
        )
        out.append(
            self.db.execute(
                select(
                    func.count(MaterialCurveSeries.id),
                    func.coalesce(func.sum(MaterialCurveSeries.id), 0),
                )
                .join(MaterialCurve, MaterialCurve.id == MaterialCurveSeries.curve_id)
                .where(by_curve)
            ).one()
        )
        out.append(
            self.db.execute(
                select(
                    func.count(MaterialCurvePoint.id),
                    func.coalesce(func.sum(MaterialCurvePoint.id), 0),
                )
                .join(MaterialCurveSeries, MaterialCurveSeries.id == MaterialCurvePoint.series_id)
                .join(MaterialCurve, MaterialCurve.id == MaterialCurveSeries.curve_id)
                .where(by_curve)
            ).one()
        )
        return [list(row) for row in out]

    def _definitions(self) -> list[object]:
        """The small tables whose words and units the diff writes, whole."""
        tables = (
            select(
                PropertyDefinition.slug, PropertyDefinition.name, PropertyDefinition.canonical_unit
            ).order_by(PropertyDefinition.slug),
            select(MaterialClass.slug, MaterialClass.name).order_by(MaterialClass.slug),
            select(ProcessClass.slug, ProcessClass.name).order_by(ProcessClass.slug),
            select(
                ProcessAttributeDefinition.slug,
                ProcessAttributeDefinition.name,
                ProcessAttributeDefinition.canonical_unit,
            ).order_by(ProcessAttributeDefinition.slug),
            select(TransportMode).order_by(TransportMode.id),
        )
        out: list[object] = []
        for stmt in tables[:-1]:
            out.append([list(row) for row in self.db.execute(stmt).all()])
        out.append(
            [
                [
                    getattr(mode, column.key)
                    for column in TransportMode.__table__.columns
                    if column.key not in ("created_at", "updated_at")
                ]
                for mode in self.db.execute(tables[-1]).scalars()
            ]
        )
        return out

    def fingerprint(self, base_dataset_id: int, target_dataset_id: int, version: int) -> str:
        """A hash of what both releases stored, computed in the database."""
        state = {
            "version": version,
            "base": [base_dataset_id, self._dataset_aggregates(base_dataset_id)],
            "target": [target_dataset_id, self._dataset_aggregates(target_dataset_id)],
            "definitions": self._definitions(),
        }
        text = json.dumps(state, default=str, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    # -- the stored diff ------------------------------------------------------

    def get(self, base_dataset_id: int, target_dataset_id: int) -> CatalogReleaseDiff | None:
        return self.db.execute(
            select(CatalogReleaseDiff).where(
                CatalogReleaseDiff.base_dataset_id == base_dataset_id,
                CatalogReleaseDiff.target_dataset_id == target_dataset_id,
            )
        ).scalar_one_or_none()

    def put(
        self,
        *,
        base_dataset_id: int,
        target_dataset_id: int,
        version: int,
        fingerprint: str,
        payload: list,
    ) -> CatalogReleaseDiff:
        """Replace the stored diff of this pair. The caller commits."""
        self.db.execute(
            delete(CatalogReleaseDiff).where(
                CatalogReleaseDiff.base_dataset_id == base_dataset_id,
                CatalogReleaseDiff.target_dataset_id == target_dataset_id,
            )
        )
        row = CatalogReleaseDiff(
            base_dataset_id=base_dataset_id,
            target_dataset_id=target_dataset_id,
            format_version=version,
            fingerprint=fingerprint,
            record_count=len(payload),
            payload=payload,
        )
        self.db.add(row)
        self.db.flush()
        return row
