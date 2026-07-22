"""Data-access layer for materials."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import String, delete, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition
from app.models.source import Source


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
            # Escape LIKE metacharacters so user input is matched literally —
            # otherwise "%" and "_" act as wildcards and silently distort results.
            escaped = (
                search.strip()
                .lower()
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_")
            )
            term = f"%{escaped}%"
            # keywords is a JSON list; matching against its text form is a
            # pragmatic, portable keyword filter for the MVP (SQLite and Postgres
            # both render the JSON array to text under CAST).
            keywords_as_text = func.lower(func.cast(Material.keywords, String))
            stmt = stmt.where(
                or_(
                    func.lower(Material.name).like(term, escape="\\"),
                    func.lower(MaterialClass.name).like(term, escape="\\"),
                    keywords_as_text.like(term, escape="\\"),
                )
            )

        return list(self.db.execute(stmt).scalars().unique().all())

    def get_material(self, material_id: int) -> Optional[Material]:
        """Return one material with its class, property values and definitions.

        ``populate_existing`` forces the ORM to overwrite any already-loaded
        (possibly stale) state for this material in the identity map. Without it,
        re-reading after a bulk delete/insert of property values (as done by
        ``replace_property_values``) would return the OLD collection, because a
        loaded, non-expired collection is not refreshed by a plain re-query.
        """
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
            .execution_options(populate_existing=True)
        )
        return self.db.execute(stmt).scalars().unique().one_or_none()

    def get_property_by_slug(self, slug: str) -> Optional[PropertyDefinition]:
        """Return a property definition by slug, or None."""
        stmt = select(PropertyDefinition).where(PropertyDefinition.slug == slug)
        return self.db.execute(stmt).scalars().one_or_none()

    def values_for_property(self, slug: str) -> list[MaterialPropertyValue]:
        """Return non-missing values for a property, for ACTIVE materials only.

        The ``is_active`` filter keeps soft-deleted materials out of charts and
        any other aggregate consumers — deactivation must remove a material from
        every selection surface, not just the catalogue list.
        """
        stmt = (
            select(MaterialPropertyValue)
            .join(PropertyDefinition, MaterialPropertyValue.property_id == PropertyDefinition.id)
            .join(Material, MaterialPropertyValue.material_id == Material.id)
            .options(
                joinedload(MaterialPropertyValue.material).joinedload(
                    Material.material_class
                )
            )
            .where(PropertyDefinition.slug == slug)
            .where(MaterialPropertyValue.is_missing.is_(False))
            .where(Material.is_active.is_(True))
        )
        return list(self.db.execute(stmt).scalars().unique().all())

    # --- write helpers ----------------------------------------------------

    def get_class(self, class_id: int) -> Optional[MaterialClass]:
        """Return a material class by id, or None."""
        return self.db.get(MaterialClass, class_id)

    def name_exists(self, name: str, exclude_id: Optional[int] = None) -> bool:
        """Return True if another material already uses ``name`` (case-insensitive)."""
        stmt = select(Material.id).where(func.lower(Material.name) == name.strip().lower())
        if exclude_id is not None:
            stmt = stmt.where(Material.id != exclude_id)
        return self.db.execute(stmt).first() is not None

    def get_or_create_source(self, label: str, is_demo: bool = False) -> Source:
        """Return the source with ``label``, creating it if necessary."""
        existing = self.db.execute(
            select(Source).where(Source.label == label)
        ).scalars().one_or_none()
        if existing:
            return existing
        source = Source(label=label, is_demo=is_demo)
        self.db.add(source)
        self.db.flush()
        return source

    def delete_values_for_material(self, material_id: int) -> None:
        """Remove all property values of a material (used when replacing them)."""
        self.db.execute(
            delete(MaterialPropertyValue).where(
                MaterialPropertyValue.material_id == material_id
            )
        )

    def add(self, obj: object) -> None:
        """Stage a new ORM object for insertion."""
        self.db.add(obj)

    def flush(self) -> None:
        """Flush pending changes (assigns primary keys without committing)."""
        self.db.flush()

    def commit(self) -> None:
        """Commit the current transaction."""
        self.db.commit()
