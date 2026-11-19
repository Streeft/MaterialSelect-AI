"""Counts what a catalogue release brought, and reads the kept counts (D-250).

``measure`` counts in the database, from the release's identity rows
(``CatalogRecordRef``): the materials and processes they point at, the classes
of those materials and the materials' value rows. Inactive materials count —
a release that a newer one replaced (D-114) still brought them.
"""

from __future__ import annotations

from sqlalchemy import Select, case, func, select
from sqlalchemy.orm import Session

from app.domain.release_history import ReleaseTally
from app.models.catalog import CatalogDataset, CatalogRecordRef, CatalogReleaseCount
from app.models.material import Material
from app.models.material_property_value import MaterialPropertyValue
from app.repositories.dashboard_repository import DECLARED_MISSING, FILLED


class ReleaseCountRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _material_ids(self, dataset_id: int) -> Select:
        return select(CatalogRecordRef.material_id).where(
            CatalogRecordRef.dataset_id == dataset_id,
            CatalogRecordRef.material_id.is_not(None),
        )

    def measure(self, dataset_id: int) -> ReleaseTally:
        """Six counts of one release, in five aggregate queries."""
        ids = self._material_ids(dataset_id)
        materials = self.db.scalar(
            select(func.count(func.distinct(CatalogRecordRef.material_id))).where(
                CatalogRecordRef.dataset_id == dataset_id,
                CatalogRecordRef.material_id.is_not(None),
            )
        )
        classes = self.db.scalar(
            select(func.count(func.distinct(Material.class_id))).where(Material.id.in_(ids))
        )
        filled, missing, properties = self.db.execute(
            select(
                func.coalesce(func.sum(FILLED), 0),
                func.coalesce(func.sum(DECLARED_MISSING), 0),
                func.count(
                    func.distinct(
                        case(
                            (
                                MaterialPropertyValue.is_missing.is_(False),
                                MaterialPropertyValue.property_id,
                            ),
                        )
                    )
                ),
            ).where(MaterialPropertyValue.material_id.in_(ids))
        ).one()
        processes = self.db.scalar(
            select(func.count(func.distinct(CatalogRecordRef.process_id))).where(
                CatalogRecordRef.dataset_id == dataset_id,
                CatalogRecordRef.process_id.is_not(None),
            )
        )
        return ReleaseTally(
            materials=int(materials or 0),
            classes=int(classes or 0),
            properties=int(properties or 0),
            values_filled=int(filled or 0),
            values_declared_missing=int(missing or 0),
            processes=int(processes or 0),
        )

    def get(self, dataset_id: int) -> CatalogReleaseCount | None:
        return self.db.scalar(
            select(CatalogReleaseCount).where(CatalogReleaseCount.dataset_id == dataset_id)
        )

    def add(self, row: CatalogReleaseCount) -> None:
        self.db.add(row)

    def history(self, demo: bool | None = None) -> list[tuple[CatalogDataset, CatalogReleaseCount]]:
        """Every release with kept counts, oldest import first.

        ``demo`` narrows to the fictitious releases (``True``) or to the real
        ones (``False``); ``None`` reads both. A release without counts is left
        out — there is nothing measured to draw for it.
        """
        stmt = (
            select(CatalogDataset, CatalogReleaseCount)
            .join(CatalogReleaseCount, CatalogReleaseCount.dataset_id == CatalogDataset.id)
            .order_by(CatalogDataset.created_at, CatalogDataset.id)
        )
        if demo is not None:
            stmt = stmt.where(CatalogDataset.is_demo.is_(demo))
        return [(d, c) for d, c in self.db.execute(stmt).all()]
