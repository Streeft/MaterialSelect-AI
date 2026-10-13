"""Reads and writes of declared equivalence groups (D-115, TM1).

Reading goes through the material's visibility (D-62): a group lists the
designations of other materials, and a record somebody else owns is not shown
to this viewer, the same rule as its sheet.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.equivalence import EquivalenceGroup, EquivalenceMember
from app.models.material import Material
from app.models.material_designation import MaterialDesignation
from app.models.source import Source
from app.repositories.visibility import visible_materials


class EquivalenceRepository:
    def __init__(self, db: Session, viewer_id: int | None = None) -> None:
        self.db = db
        self.viewer_id = viewer_id

    def get_visible_material(self, material_id: int) -> Material | None:
        return (
            self.db.execute(
                select(Material)
                .where(Material.id == material_id)
                .where(visible_materials(self.viewer_id))
            )
            .scalars()
            .one_or_none()
        )

    def _group_query(self):
        return select(EquivalenceGroup).options(
            joinedload(EquivalenceGroup.source),
            selectinload(EquivalenceGroup.members)
            .joinedload(EquivalenceMember.designation)
            .joinedload(MaterialDesignation.material),
        )

    def list_for_material(self, material_id: int) -> list[EquivalenceGroup]:
        """Every group having a designation of this material, oldest first."""
        mine = (
            select(EquivalenceMember.group_id)
            .join(MaterialDesignation, MaterialDesignation.id == EquivalenceMember.designation_id)
            .where(MaterialDesignation.material_id == material_id)
        )
        stmt = (
            self._group_query().where(EquivalenceGroup.id.in_(mine)).order_by(EquivalenceGroup.id)
        )
        return list(self.db.execute(stmt).scalars().unique())

    def get_group(self, group_id: int) -> EquivalenceGroup | None:
        return (
            self.db.execute(self._group_query().where(EquivalenceGroup.id == group_id))
            .scalars()
            .unique()
            .one_or_none()
        )

    def visible_material_ids(self, ids: set[int]) -> set[int]:
        if not ids:
            return set()
        rows = self.db.execute(
            select(Material.id).where(Material.id.in_(ids)).where(visible_materials(self.viewer_id))
        ).scalars()
        return set(rows)

    def get_designations(self, ids: list[int]) -> list[MaterialDesignation]:
        if not ids:
            return []
        return list(
            self.db.execute(
                select(MaterialDesignation)
                .where(MaterialDesignation.id.in_(ids))
                .options(joinedload(MaterialDesignation.material))
            )
            .scalars()
            .unique()
        )

    def get_source(self, source_id: int) -> Source | None:
        return self.db.get(Source, source_id)

    def add(self, group: EquivalenceGroup) -> None:
        self.db.add(group)

    def delete(self, group: EquivalenceGroup) -> None:
        self.db.delete(group)

    def flush(self) -> None:
        self.db.flush()

    def commit(self) -> None:
        self.db.commit()
