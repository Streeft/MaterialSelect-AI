"""Data access for ordinal material properties (D-126). Parameterised queries only."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.material import Material
from app.models.ordinal_property import (
    MaterialOrdinalValue,
    OrdinalPropertyDefinition,
    OrdinalScaleLevel,
)
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
