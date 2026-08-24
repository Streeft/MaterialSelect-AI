"""Data-access layer for property definitions."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition


class PropertyDefinitionRepository:
    """Encapsulates property-definition queries and persistence."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def list_with_counts(self) -> list[tuple[PropertyDefinition, int]]:
        """Return all property definitions with how many values reference each."""
        stmt = (
            select(PropertyDefinition, func.count(MaterialPropertyValue.id))
            .outerjoin(
                MaterialPropertyValue,
                MaterialPropertyValue.property_id == PropertyDefinition.id,
            )
            .group_by(PropertyDefinition.id)
            .order_by(PropertyDefinition.name)
        )
        return [(row[0], row[1]) for row in self.db.execute(stmt).all()]

    def get(self, property_id: int) -> PropertyDefinition | None:
        return self.db.get(PropertyDefinition, property_id)

    def get_by_slug(self, slug: str) -> PropertyDefinition | None:
        return (
            self.db.execute(select(PropertyDefinition).where(PropertyDefinition.slug == slug))
            .scalars()
            .one_or_none()
        )

    def slug_exists(self, slug: str, exclude_id: int | None = None) -> bool:
        stmt = select(PropertyDefinition.id).where(PropertyDefinition.slug == slug)
        if exclude_id is not None:
            stmt = stmt.where(PropertyDefinition.id != exclude_id)
        return self.db.execute(stmt).first() is not None

    def value_count(self, property_id: int) -> int:
        return self.db.execute(
            select(func.count(MaterialPropertyValue.id)).where(
                MaterialPropertyValue.property_id == property_id
            )
        ).scalar_one()

    def add(self, obj: PropertyDefinition) -> None:
        self.db.add(obj)

    def delete(self, obj: PropertyDefinition) -> None:
        self.db.delete(obj)

    def flush(self) -> None:
        self.db.flush()

    def commit(self) -> None:
        self.db.commit()
