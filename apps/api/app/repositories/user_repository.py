"""Data access for User: looked up by Google's stable per-account id."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User


class UserRepository:
    """Queries and writes for User."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_google_sub(self, google_sub: str) -> User | None:
        stmt = select(User).where(User.google_sub == google_sub)
        return self.db.execute(stmt).scalars().one_or_none()

    def list_by_email(self, email: str) -> list[User]:
        """Every account carrying this address, newest last.

        Plural on purpose: `email` is not unique here. Identity is `google_sub`
        (a Google account can change its address), so two rows may legitimately
        share one address — the operator tooling that calls this refuses to act
        on an ambiguous match rather than picking a row.
        """
        stmt = select(User).where(User.email == email).order_by(User.id)
        return list(self.db.execute(stmt).scalars().all())

    def create(self, *, google_sub: str, email: str, name: str, avatar_url: str | None) -> User:
        user = User(google_sub=google_sub, email=email, name=name, avatar_url=avatar_url)
        self.db.add(user)
        return user
