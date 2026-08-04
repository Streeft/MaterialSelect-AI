"""Data access for property maps and material comparison.

Charts need more of a property value than the selection snapshot keeps: the
original value and unit, the interval bounds, the uncertainty, the data quality
and the source. This repository therefore loads the full rows, eager-loading
class, definition and source so a map of N materials stays a constant number of
queries.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition


class ChartRepository:
    """Queries backing the visualisation endpoints."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def list_materials(
        self,
        material_ids: list[int] | None = None,
        class_slugs: list[str] | None = None,
    ) -> list[Material]:
        """Return active materials with values, definitions, class and source.

        ``material_ids`` and ``class_slugs`` are optional narrowing filters;
        an empty ``class_slugs`` list means "every class" (not "no class"), so
        an unset filter never silently empties the chart.
        """
        stmt = (
            select(Material)
            .join(MaterialClass, Material.class_id == MaterialClass.id)
            .options(
                joinedload(Material.material_class),
                joinedload(Material.property_values).joinedload(
                    MaterialPropertyValue.property_definition
                ),
                joinedload(Material.property_values).joinedload(MaterialPropertyValue.source),
            )
            .where(Material.is_active.is_(True))
            .order_by(Material.name)
        )
        if material_ids is not None:
            stmt = stmt.where(Material.id.in_(material_ids))
        if class_slugs:
            stmt = stmt.where(MaterialClass.slug.in_(class_slugs))
        return list(self.db.execute(stmt).scalars().unique().all())

    def get_property(self, slug: str) -> PropertyDefinition | None:
        stmt = select(PropertyDefinition).where(PropertyDefinition.slug == slug)
        return self.db.execute(stmt).scalars().one_or_none()

    def list_properties(self) -> list[PropertyDefinition]:
        stmt = select(PropertyDefinition).order_by(PropertyDefinition.slug)
        return list(self.db.execute(stmt).scalars().all())

    def existing_class_slugs(self, slugs: list[str]) -> set[str]:
        if not slugs:
            return set()
        stmt = select(MaterialClass.slug).where(MaterialClass.slug.in_(slugs))
        return {row[0] for row in self.db.execute(stmt).all()}
