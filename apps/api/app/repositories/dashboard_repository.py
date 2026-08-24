"""Aggregate queries backing the catalogue panel.

Everything here counts in the database rather than in Python. That is not only
about speed: loading every value row to count it would make the panel's cost
grow with the catalogue, and the one screen whose job is to describe a large
catalogue is the worst place for a query that only works while the catalogue is
small.

Every query is filtered to **active** materials. Without it a soft-deleted
material would keep inflating the coverage of the class it used to belong to,
and the panel would quietly report data the rest of the application refuses to
show.
"""

from __future__ import annotations

from sqlalchemy import Select, and_, case, func, select
from sqlalchemy.orm import Session

from app.models.enums import DataQuality
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition

# 1 for a row carrying a number, 0 for a row declaring absence — and the mirror
# of it. Summing these is what lets one GROUP BY return both counts, instead of
# two queries that could observe different states of the same transaction.
FILLED = case((MaterialPropertyValue.is_missing.is_(False), 1), else_=0)
DECLARED_MISSING = case((MaterialPropertyValue.is_missing.is_(True), 1), else_=0)


class DashboardRepository:
    """Counts and distributions over the catalogue."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # --- Totals -----------------------------------------------------------

    def count_materials(self) -> tuple[int, int]:
        """``(active materials, how many of those are demonstration data)``."""
        stmt = select(
            func.count(Material.id),
            func.coalesce(func.sum(case((Material.is_demo.is_(True), 1), else_=0)), 0),
        ).where(Material.is_active.is_(True))
        total, demo = self.db.execute(stmt).one()
        return int(total or 0), int(demo or 0)

    def count_classes(self) -> int:
        return int(self.db.execute(select(func.count(MaterialClass.id))).scalar_one() or 0)

    def count_properties(self) -> int:
        return int(self.db.execute(select(func.count(PropertyDefinition.id))).scalar_one() or 0)

    # --- Per class --------------------------------------------------------

    def class_material_counts(self) -> list[tuple[str, str, int]]:
        """``(slug, name, active material count)`` for every class.

        An outer join, so a class nobody has used yet still appears — with zero
        materials, which is a fact about the taxonomy and not an empty result.
        """
        stmt = (
            select(MaterialClass.slug, MaterialClass.name, func.count(Material.id))
            .select_from(MaterialClass)
            .outerjoin(
                Material,
                and_(Material.class_id == MaterialClass.id, Material.is_active.is_(True)),
            )
            .group_by(MaterialClass.id, MaterialClass.slug, MaterialClass.name)
            .order_by(MaterialClass.name)
        )
        return [(slug, name, int(count or 0)) for slug, name, count in self.db.execute(stmt).all()]

    def value_counts_by_class(self) -> dict[str, tuple[int, int]]:
        """``slug -> (filled, declared missing)`` over active materials."""
        stmt = (
            select(
                MaterialClass.slug,
                func.coalesce(func.sum(FILLED), 0),
                func.coalesce(func.sum(DECLARED_MISSING), 0),
            )
            .select_from(MaterialPropertyValue)
            .join(Material, MaterialPropertyValue.material_id == Material.id)
            .join(MaterialClass, Material.class_id == MaterialClass.id)
            .where(Material.is_active.is_(True))
            .group_by(MaterialClass.slug)
        )
        return {
            slug: (int(filled or 0), int(missing or 0))
            for slug, filled, missing in self.db.execute(stmt).all()
        }

    # --- Per property -----------------------------------------------------

    def list_properties(self) -> list[PropertyDefinition]:
        stmt = select(PropertyDefinition).order_by(PropertyDefinition.name)
        return list(self.db.execute(stmt).scalars().all())

    def get_property(self, slug: str) -> PropertyDefinition | None:
        stmt = select(PropertyDefinition).where(PropertyDefinition.slug == slug)
        return self.db.execute(stmt).scalars().one_or_none()

    def value_counts_by_property(self) -> dict[str, tuple[int, int]]:
        """``slug -> (filled, declared missing)`` over active materials."""
        stmt = (
            select(
                PropertyDefinition.slug,
                func.coalesce(func.sum(FILLED), 0),
                func.coalesce(func.sum(DECLARED_MISSING), 0),
            )
            .select_from(MaterialPropertyValue)
            .join(Material, MaterialPropertyValue.material_id == Material.id)
            .join(
                PropertyDefinition,
                MaterialPropertyValue.property_id == PropertyDefinition.id,
            )
            .where(Material.is_active.is_(True))
            .group_by(PropertyDefinition.slug)
        )
        return {
            slug: (int(filled or 0), int(missing or 0))
            for slug, filled, missing in self.db.execute(stmt).all()
        }

    # --- Provenance -------------------------------------------------------

    def quality_counts(self) -> dict[DataQuality, int]:
        """How many *filled* values carry each provenance level.

        Rows marked ``is_missing`` are excluded: they still carry whatever
        ``data_quality`` they were created with, and counting them would credit
        "medido" for a measurement that was never taken.
        """
        stmt = (
            select(MaterialPropertyValue.data_quality, func.count(MaterialPropertyValue.id))
            .select_from(MaterialPropertyValue)
            .join(Material, MaterialPropertyValue.material_id == Material.id)
            .where(Material.is_active.is_(True), MaterialPropertyValue.is_missing.is_(False))
            .group_by(MaterialPropertyValue.data_quality)
        )
        return {quality: int(count or 0) for quality, count in self.db.execute(stmt).all()}

    # --- Distribution of one property -------------------------------------

    def values_for_property(self, slug: str) -> list[tuple[str, str, float]]:
        """``(class slug, class name, normalised value)`` for one property.

        Only rows that actually carry a number: a row flagged as present but
        holding no normalised value is a data defect, and letting it through as
        a zero would drag its whole class to the bottom of the axis.
        """
        stmt: Select = (
            select(
                MaterialClass.slug,
                MaterialClass.name,
                MaterialPropertyValue.normalized_value,
            )
            .select_from(MaterialPropertyValue)
            .join(Material, MaterialPropertyValue.material_id == Material.id)
            .join(MaterialClass, Material.class_id == MaterialClass.id)
            .join(
                PropertyDefinition,
                MaterialPropertyValue.property_id == PropertyDefinition.id,
            )
            .where(
                Material.is_active.is_(True),
                MaterialPropertyValue.is_missing.is_(False),
                MaterialPropertyValue.normalized_value.is_not(None),
                PropertyDefinition.slug == slug,
            )
        )
        return [
            (class_slug, class_name, float(value))
            for class_slug, class_name, value in self.db.execute(stmt).all()
        ]
