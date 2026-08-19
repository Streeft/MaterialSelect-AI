"""Data access for UserSession: the source of truth for "who is logged in".

Parameter is named ``token``, not ``id`` — the session's primary key doubles
as the opaque cookie value, and ``id`` would shadow the builtin.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.user import UserSession


class SessionRepository:
    """Queries and writes for UserSession."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def create(
        self, *, token: str, user_id: int, created_at: datetime, expires_at: datetime
    ) -> UserSession:
        session = UserSession(
            id=token, user_id=user_id, created_at=created_at, expires_at=expires_at
        )
        self.db.add(session)
        return session

    def get_valid(self, token: str) -> UserSession | None:
        stmt = (
            select(UserSession)
            .options(joinedload(UserSession.user))
            .where(UserSession.id == token, UserSession.expires_at > datetime.now(UTC))
        )
        return self.db.execute(stmt).scalars().one_or_none()

    def delete(self, token: str) -> None:
        session = self.db.get(UserSession, token)
        if session is not None:
            self.db.delete(session)
