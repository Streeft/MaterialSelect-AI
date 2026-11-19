"""Data access for assemblies and their parts (D-257)."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.assembly import Assembly, AssemblyPart
from app.models.selection import SelectionStudy


class AssemblyRepository:
    """Every read is scoped to one ``Project``: another reader's assembly does
    not exist as far as these queries are concerned."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def list_for(self, project_id: int) -> list[Assembly]:
        stmt = (
            select(Assembly)
            .options(selectinload(Assembly.parts))
            .where(Assembly.project_id == project_id)
            .order_by(Assembly.updated_at.desc(), Assembly.id.desc())
        )
        return list(self.db.execute(stmt).scalars().all())

    def count_for(self, project_id: int) -> int:
        stmt = select(func.count(Assembly.id)).where(Assembly.project_id == project_id)
        return int(self.db.execute(stmt).scalar_one())

    def get(self, assembly_id: int, project_id: int) -> Assembly | None:
        stmt = (
            select(Assembly)
            .options(selectinload(Assembly.parts))
            .where(Assembly.id == assembly_id, Assembly.project_id == project_id)
        )
        return self.db.execute(stmt).scalars().one_or_none()

    def name_exists(self, name: str, project_id: int, exclude_id: int | None = None) -> bool:
        stmt = select(Assembly.id).where(
            func.lower(Assembly.name) == name.strip().lower(),
            Assembly.project_id == project_id,
        )
        if exclude_id is not None:
            stmt = stmt.where(Assembly.id != exclude_id)
        return self.db.execute(stmt).first() is not None

    def study_names(self, study_ids: list[int], project_id: int) -> dict[int, tuple[str, str]]:
        """``id → (name, universe)`` of the reader's own studies among ``study_ids``."""
        if not study_ids:
            return {}
        stmt = select(SelectionStudy.id, SelectionStudy.name, SelectionStudy.universe).where(
            SelectionStudy.id.in_(study_ids), SelectionStudy.project_id == project_id
        )
        return {row.id: (row.name, row.universe) for row in self.db.execute(stmt)}

    def add(self, row: Assembly | AssemblyPart) -> None:
        self.db.add(row)

    def delete(self, row: Assembly | AssemblyPart) -> None:
        self.db.delete(row)

    def commit(self) -> None:
        self.db.commit()

    def flush(self) -> None:
        self.db.flush()

    def expire(self, assembly: Assembly) -> None:
        self.db.expire(assembly)
