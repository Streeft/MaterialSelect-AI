"""Data access for ordinal material properties (D-126). Parameterised queries only."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.material import Material
from app.models.ordinal_property import (
    MaterialOrdinalValue,
    OrdinalPropertyDefinition,
    OrdinalScaleLevel,
)
from app.models.selection import SelectionConstraint
from app.repositories.visibility import visible_materials


class OrdinalRepository:
    def __init__(self, db: Session, viewer_id: int | None = None) -> None:
        self.db = db
        self.viewer_id = viewer_id

    def list_definitions(self) -> list[OrdinalPropertyDefinition]:
        """Every definition with its scale, worst level first."""
        stmt = (
            select(OrdinalPropertyDefinition)
            .options(selectinload(OrdinalPropertyDefinition.levels))
            .order_by(OrdinalPropertyDefinition.name)
        )
        return list(self.db.execute(stmt).scalars().all())

    def ranks_by_material(self) -> dict[int, dict[str, int]]:
        """material id → {ordinal slug → rank} for every **visible**, active material.

        Only rows that hold a level: a value recorded as missing contributes
        nothing, and a material with no row is absent — both read by the engine
        as "no level", never as the worst one. Rows of materials the viewer
        cannot see are never selected (D-62).
        """
        visible = (
            select(Material.id)
            .where(Material.is_active.is_(True))
            .where(visible_materials(self.viewer_id))
        )
        rows = self.db.execute(
            select(
                MaterialOrdinalValue.material_id,
                OrdinalPropertyDefinition.slug,
                OrdinalScaleLevel.rank,
            )
            .join(
                OrdinalPropertyDefinition,
                OrdinalPropertyDefinition.id == MaterialOrdinalValue.definition_id,
            )
            .join(OrdinalScaleLevel, OrdinalScaleLevel.id == MaterialOrdinalValue.level_id)
            .where(MaterialOrdinalValue.is_missing.is_(False))
            .where(OrdinalScaleLevel.definition_id == MaterialOrdinalValue.definition_id)
            .where(MaterialOrdinalValue.material_id.in_(visible))
        ).all()
        ranks: dict[int, dict[str, int]] = {}
        for material_id, slug, rank in rows:
            ranks.setdefault(material_id, {})[slug] = rank
        return ranks

    def values_for_material(self, material_id: int) -> list[MaterialOrdinalValue]:
        stmt = (
            select(MaterialOrdinalValue)
            .options(
                selectinload(MaterialOrdinalValue.level),
                selectinload(MaterialOrdinalValue.source),
            )
            .where(MaterialOrdinalValue.material_id == material_id)
        )
        return list(self.db.execute(stmt).scalars().all())

    # --- hand-editing a scale (D-251) -----------------------------------------

    def get_definition(self, slug: str) -> OrdinalPropertyDefinition | None:
        stmt = (
            select(OrdinalPropertyDefinition)
            .options(selectinload(OrdinalPropertyDefinition.levels))
            .where(OrdinalPropertyDefinition.slug == slug)
        )
        return self.db.execute(stmt).scalars().first()

    def name_taken(self, name: str, *, exclude_id: int) -> bool:
        stmt = select(OrdinalPropertyDefinition.id).where(
            func.lower(OrdinalPropertyDefinition.name) == name.lower(),
            OrdinalPropertyDefinition.id != exclude_id,
        )
        return self.db.execute(stmt).first() is not None

    def held_counts(self, definition_id: int) -> dict[int, int]:
        """level id → how many materials hold it (a recorded absence holds no level)."""
        rows = self.db.execute(
            select(MaterialOrdinalValue.level_id, func.count())
            .where(MaterialOrdinalValue.definition_id == definition_id)
            .where(MaterialOrdinalValue.level_id.is_not(None))
            .group_by(MaterialOrdinalValue.level_id)
        ).all()
        return {level_id: count for level_id, count in rows}

    def study_label_counts(self, slug: str) -> dict[str, int]:
        """label → saved "level at least" limits on this property that name it.

        The label lives in a JSON list, so it is counted here and not in SQL; the
        rows read are only this property's limits, a handful.
        """
        rows = self.db.execute(
            select(SelectionConstraint.labels)
            .where(SelectionConstraint.operator == "level_at_least")
            .where(SelectionConstraint.property_slug == slug)
        ).all()
        counts: dict[str, int] = {}
        for (labels,) in rows:
            for label in labels or []:
                counts[label] = counts.get(label, 0) + 1
        return counts

    def add_level(self, level: OrdinalScaleLevel) -> None:
        self.db.add(level)

    def delete_level(self, level: OrdinalScaleLevel) -> None:
        self.db.delete(level)

    def flush(self) -> None:
        self.db.flush()

    def commit(self) -> None:
        self.db.commit()

    def refresh(self, definition: OrdinalPropertyDefinition) -> None:
        self.db.refresh(definition)
        self.db.expire(definition, ["levels"])
