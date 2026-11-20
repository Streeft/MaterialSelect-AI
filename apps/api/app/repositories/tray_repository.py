"""Data access for the tray (D-258). Every query is scoped to one user."""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, joinedload

from app.models.material import Material
from app.models.process import Process
from app.models.tray import TrayItem
from app.repositories.visibility import visible_materials


class TrayRepository:
    def __init__(self, db: Session, user_id: int) -> None:
        self.db = db
        self.user_id = user_id

    def list_items(self) -> list[TrayItem]:
        stmt = (
            select(TrayItem)
            .options(
                joinedload(TrayItem.material).joinedload(Material.material_class),
                joinedload(TrayItem.process).joinedload(Process.process_class),
            )
            .where(TrayItem.user_id == self.user_id)
            .order_by(TrayItem.compartment, TrayItem.position, TrayItem.id)
        )
        return list(self.db.execute(stmt).scalars().unique().all())

    def get(self, item_id: int) -> TrayItem | None:
        stmt = select(TrayItem).where(TrayItem.id == item_id, TrayItem.user_id == self.user_id)
        return self.db.execute(stmt).scalars().one_or_none()

    def visible_material_ids(self, material_ids: list[int]) -> set[int]:
        """Which of these materials this user may read and are still catalogued."""
        if not material_ids:
            return set()
        stmt = (
            select(Material.id)
            .where(Material.id.in_(material_ids))
            .where(Material.is_active.is_(True))
            .where(visible_materials(self.user_id))
        )
        return set(self.db.execute(stmt).scalars().all())

    def active_process_ids(self, process_ids: list[int]) -> set[int]:
        if not process_ids:
            return set()
        stmt = select(Process.id).where(Process.id.in_(process_ids), Process.is_active.is_(True))
        return set(self.db.execute(stmt).scalars().all())

    def add(self, item: TrayItem) -> None:
        self.db.add(item)

    def delete(self, item: TrayItem) -> None:
        self.db.delete(item)

    def clear(self) -> None:
        self.db.execute(delete(TrayItem).where(TrayItem.user_id == self.user_id))

    def commit(self) -> None:
        self.db.commit()

    def expire_all(self) -> None:
        self.db.expire_all()
