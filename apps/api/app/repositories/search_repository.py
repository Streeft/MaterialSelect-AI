"""Narrow reads for the palette's quick search (D-207).

Every method selects only the columns the palette shows (id, name, class,
slug) — never a property value, never a relationship to load — so a search
costs one small query per kind instead of the whole catalogue the browser used
to download. Accent folding happens in ``app.domain.quick_search``: neither
SQLite nor a Postgres without ``unaccent`` can compare "aco" with "aço" in SQL,
and the columns read here are short enough to fold in Python.

Ownership follows the rest of the app: materials through
``visible_materials`` (shared catalogue plus the reader's own records),
notebooks through their owner, studies through the reader's project.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.notebook import Notebook
from app.models.process import Process, ProcessClass
from app.models.selection import SelectionStudy
from app.repositories.visibility import visible_materials


class SearchRepository:
    def __init__(self, db: Session, viewer_id: int, project_id: int | None) -> None:
        self.db = db
        self.viewer_id = viewer_id
        self.project_id = project_id

    def materials(self) -> list[tuple[int, str, str]]:
        stmt = (
            select(Material.id, Material.name, MaterialClass.name)
            .join(MaterialClass, Material.class_id == MaterialClass.id)
            .where(Material.is_active.is_(True))
            .where(visible_materials(self.viewer_id))
        )
        return [(row[0], row[1], row[2]) for row in self.db.execute(stmt).all()]

    def processes(self) -> list[tuple[int, str, str, str]]:
        stmt = (
            select(Process.id, Process.name, ProcessClass.name, Process.slug)
            .join(ProcessClass, Process.class_id == ProcessClass.id)
            .where(Process.is_active.is_(True))
        )
        return [(row[0], row[1], row[2], row[3]) for row in self.db.execute(stmt).all()]

    def notebooks(self) -> list[tuple[int, str]]:
        stmt = select(Notebook.id, Notebook.title).where(Notebook.owner_id == self.viewer_id)
        return [(row[0], row[1]) for row in self.db.execute(stmt).all()]

    def studies(self) -> list[tuple[int, str]]:
        if self.project_id is None:
            return []
        stmt = select(SelectionStudy.id, SelectionStudy.name).where(
            SelectionStudy.project_id == self.project_id
        )
        return [(row[0], row[1]) for row in self.db.execute(stmt).all()]
