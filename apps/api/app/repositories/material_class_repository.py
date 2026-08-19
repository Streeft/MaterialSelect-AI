"""Data-access layer for the material taxonomy (classes)."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.material import Material
from app.models.material_class import MaterialClass


class MaterialClassRepository:
    """Encapsulates material-class queries and persistence."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def list_with_counts(self) -> list[tuple[MaterialClass, int]]:
        """Return all classes with how many materials reference each of them."""
        stmt = (
            select(MaterialClass, func.count(Material.id))
            .outerjoin(Material, Material.class_id == MaterialClass.id)
            .group_by(MaterialClass.id)
            .order_by(MaterialClass.name)
        )
        return [(row[0], row[1]) for row in self.db.execute(stmt).all()]

    def get(self, class_id: int) -> MaterialClass | None:
        return self.db.get(MaterialClass, class_id)

    def get_by_slug(self, slug: str) -> MaterialClass | None:
        return (
            self.db.execute(select(MaterialClass).where(MaterialClass.slug == slug))
            .scalars()
            .one_or_none()
        )

    def slug_exists(self, slug: str, exclude_id: int | None = None) -> bool:
        stmt = select(MaterialClass.id).where(MaterialClass.slug == slug)
        if exclude_id is not None:
            stmt = stmt.where(MaterialClass.id != exclude_id)
        return self.db.execute(stmt).first() is not None

    def name_exists(self, name: str, exclude_id: int | None = None) -> bool:
        """True if another class already uses ``name`` (case-insensitive).

        ``material_class.name`` has a UNIQUE constraint; checking here turns what
        would be an IntegrityError (HTTP 500) into a clean 409 conflict.
        """
        stmt = select(MaterialClass.id).where(
            func.lower(MaterialClass.name) == name.strip().lower()
        )
        if exclude_id is not None:
            stmt = stmt.where(MaterialClass.id != exclude_id)
        return self.db.execute(stmt).first() is not None

    def material_count(self, class_id: int) -> int:
        return self.db.execute(
            select(func.count(Material.id)).where(Material.class_id == class_id)
        ).scalar_one()

    def child_count(self, class_id: int) -> int:
        return self.db.execute(
            select(func.count(MaterialClass.id)).where(MaterialClass.parent_id == class_id)
        ).scalar_one()

    def add(self, obj: MaterialClass) -> None:
        self.db.add(obj)

    def delete(self, obj: MaterialClass) -> None:
        self.db.delete(obj)

    def flush(self) -> None:
        self.db.flush()

    def commit(self) -> None:
        self.db.commit()
