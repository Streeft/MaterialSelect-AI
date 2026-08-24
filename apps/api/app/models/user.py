"""User and UserSession: who is logged in, and for how long.

There is no password anywhere in this file — login is Google-only (A5), so a
``User`` is only ever created from a verified Google identity. ``UserSession``
is a plain server-side session (the row *is* the source of truth for "logged
in"), not a signed/stateless token: logout has to actually revoke access, and
a row that can be deleted is what makes that true.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class User(Base):
    """A person who has signed in with Google at least once."""

    __tablename__ = "user"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Google's stable per-account identifier (the ID token's `sub` claim) —
    # not the email, which a Google account can change.
    google_sub: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class UserSession(Base):
    """A live login. Named ``UserSession``, not ``Session`` — that name is
    already ``sqlalchemy.orm.Session``, imported throughout the codebase.
    """

    __tablename__ = "user_session"

    # The primary key is the opaque token itself (see AuthService), not a
    # separate surrogate id: the cookie value has to look a row up directly.
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    user: Mapped[User] = relationship()
