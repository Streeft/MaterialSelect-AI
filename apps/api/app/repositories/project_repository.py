"""Data access for Project.

``get_default_for_user`` assumes the invariant AuthService maintains: every
User has exactly one Project, created on first login.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.project import Project


class ProjectRepository:
    """Queries and writes for Project."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_default_for_user(self, user_id: int) -> Project | None:
        stmt = select(Project).where(Project.owner_id == user_id).order_by(Project.id).limit(1)
        return self.db.execute(stmt).scalars().first()

    def create(self, *, name: str, owner_id: int) -> Project:
        project = Project(name=name, owner_id=owner_id)
        self.db.add(project)
        return project
