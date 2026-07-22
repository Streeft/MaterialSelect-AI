"""Data-access layer for materials."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import String, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition


class MaterialRepository:
    """Encapsulates all material-related database queries."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def list_materials(self, search: Optional[str] = None) -> list[Material]:
        """Return active materials, optionally filtered by a search term.

        The search is case-insensitive and matches the material name, its class
        name, or any keyword. Uses parameterised ``ILIKE``/``LIKE`` — no string
        interpolation into SQL.
        """
        stmt = (
            select(Material)
            .join(MaterialClass, Material.class_id == MaterialClass.id)
            .options(joinedload(Material.material_class))
            .where(Material.is_active.is_(True))
            .order_by(Material.name)
        )

        if search:
            term = f"%{search.strip().lower()}%"
            # keywords is a JSON list; matching against its text form is a
            # pragmatic, portable keyword filter for the MVP (SQLite and Postgres
            # both render the JSON array to text under CAST).
            keywords_as_text = func.lower(func.cast(Material.keywords, String))
            stmt = stmt.where(
                or_(
                    func.lower(Material.name).like(term),
                    func.lower(MaterialClass.name).like(term),
                    keywords_as_text.like(term),
                )
            )

        return list(self.db.execute(stmt).scalars().unique().all())

    def get_material(self, material_id: int) -> Optional[Material]:
        """Return one material with its class, property values and definitions."""
        stmt = (
            select(Material)
            .options(
                joinedload(Material.material_class),
                joinedload(Material.property_values).joinedload(
                    MaterialPropertyValue.property_definition
                ),
                joinedload(Material.property_values).joinedload(
                    MaterialPropertyValue.source
                ),
            )
            .where(Material.id == material_id)
        )
        return self.db.execute(stmt).scalars().unique().one_or_none()

    def get_property_by_slug(self, slug: str) -> Optional[PropertyDefinition]:
        """Return a property definition by slug, or None."""
        stmt = select(PropertyDefinition).where(PropertyDefinition.slug == slug)
        return self.db.execute(stmt).scalars().one_or_none()

    def values_for_property(self, slug: str) -> list[MaterialPropertyValue]:
        """Return all non-missing values for a property, with their materials."""
        stmt = (
            select(MaterialPropertyValue)
            .join(PropertyDefinition, MaterialPropertyValue.property_id == PropertyDefinition.id)
            .options(
                joinedload(MaterialPropertyValue.material).joinedload(
                    Material.material_class
                )
            )
            .where(PropertyDefinition.slug == slug)
            .where(MaterialPropertyValue.is_missing.is_(False))
        )
        return list(self.db.execute(stmt).scalars().unique().all())
