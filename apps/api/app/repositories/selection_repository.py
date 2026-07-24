"""Data access for the selection pipeline: materials snapshot, indices, studies."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.performance_index import PerformanceIndex
from app.models.property_definition import PropertyDefinition
from app.models.selection import SelectionStudy


class SelectionRepository:
    """Queries backing filtering, indices, ranking and saved studies."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # --- snapshot / lookups ----------------------------------------------

    def list_active_materials_with_values(self) -> list[Material]:
        """Active materials with class, values and property definitions eager-loaded."""
        stmt = (
            select(Material)
            .options(
                joinedload(Material.material_class),
                joinedload(Material.property_values).joinedload(
                    MaterialPropertyValue.property_definition
                ),
            )
            .where(Material.is_active.is_(True))
            .order_by(Material.name)
        )
        return list(self.db.execute(stmt).scalars().unique().all())

    def list_properties(self) -> list[PropertyDefinition]:
        stmt = select(PropertyDefinition).order_by(PropertyDefinition.slug)
        return list(self.db.execute(stmt).scalars().all())

    def existing_class_slugs(self, slugs: list[str]) -> set[str]:
        if not slugs:
            return set()
        stmt = select(MaterialClass.slug).where(MaterialClass.slug.in_(slugs))
        return {row[0] for row in self.db.execute(stmt).all()}

    # --- performance indices ---------------------------------------------

    def list_indices(self) -> list[PerformanceIndex]:
        stmt = select(PerformanceIndex).order_by(PerformanceIndex.name)
        return list(self.db.execute(stmt).scalars().all())

    def index_slug_exists(self, slug: str) -> bool:
        stmt = select(PerformanceIndex.id).where(PerformanceIndex.slug == slug)
        return self.db.execute(stmt).first() is not None

    # --- saved studies ----------------------------------------------------

    def list_studies(self) -> list[SelectionStudy]:
        stmt = (
            select(SelectionStudy)
            .options(
                joinedload(SelectionStudy.constraints),
                joinedload(SelectionStudy.criteria),
            )
            .order_by(SelectionStudy.created_at.desc(), SelectionStudy.id.desc())
        )
        return list(self.db.execute(stmt).scalars().unique().all())

    def get_study(self, study_id: int) -> SelectionStudy | None:
        stmt = (
            select(SelectionStudy)
            .options(
                joinedload(SelectionStudy.constraints),
                joinedload(SelectionStudy.criteria),
            )
            .where(SelectionStudy.id == study_id)
        )
        return self.db.execute(stmt).scalars().unique().one_or_none()

    def study_name_exists(self, name: str, exclude_id: int | None = None) -> bool:
        stmt = select(SelectionStudy.id).where(
            func.lower(SelectionStudy.name) == name.strip().lower()
        )
        if exclude_id is not None:
            stmt = stmt.where(SelectionStudy.id != exclude_id)
        return self.db.execute(stmt).first() is not None

    def add(self, obj: object) -> None:
        self.db.add(obj)

    def delete(self, obj: object) -> None:
        self.db.delete(obj)

    def flush(self) -> None:
        self.db.flush()

    def commit(self) -> None:
        self.db.commit()
