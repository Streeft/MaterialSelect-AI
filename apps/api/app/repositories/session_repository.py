"""Data access for UserSession: the source of truth for "who is logged in".

The row's primary key is the SHA-256 of the cookie token (D-223), never the
token itself. Methods take the **cookie token** and hash it here, so no caller
can look a row up by its digest — a digest read from the table must not work as
a login. Rows written before D-223 still hold the raw token; ``get_legacy`` and
``rehash`` exist only to move those to the digest on their first use.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.domain.session_token import hash_session_token, looks_hashed
from app.models.user import UserSession


class SessionRepository:
    """Queries and writes for UserSession."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def create(
        self, *, token: str, user_id: int, created_at: datetime, expires_at: datetime
    ) -> UserSession:
        session = UserSession(
            id=hash_session_token(token),
            user_id=user_id,
            created_at=created_at,
            expires_at=expires_at,
        )
        self.db.add(session)
        return session

    def get_valid(self, token: str) -> UserSession | None:
        """The live session for this cookie token, looked up by its digest."""
        return self._live(hash_session_token(token))

    def get_legacy(self, token: str) -> UserSession | None:
        """A live pre-D-223 row keyed by the raw token, if there is one.

        A value shaped like a digest is never tried here: a stored id is either
        a token or a digest, and accepting a digest as a token would let the
        table's contents log someone in.
        """
        if looks_hashed(token):
            return None
        return self._live(token)

    def rehash(self, legacy: UserSession, token: str) -> UserSession:
        """Replace a raw-token row with the same session keyed by the digest.

        The primary key cannot be updated in place portably, so the row is
        rewritten: same user, same creation and expiry.
        """
        replacement = UserSession(
            id=hash_session_token(token),
            user_id=legacy.user_id,
            created_at=legacy.created_at,
            expires_at=legacy.expires_at,
        )
        self.db.delete(legacy)
        self.db.flush()
        self.db.add(replacement)
        self.db.flush()
        return replacement

    def delete(self, token: str) -> None:
        """Remove the session for this cookie token, digest or legacy row."""
        for key in (hash_session_token(token), token):
            session = self.db.get(UserSession, key)
            if session is not None:
                self.db.delete(session)

    def _live(self, stored_id: str) -> UserSession | None:
        stmt = (
            select(UserSession)
            .options(joinedload(UserSession.user))
            .where(UserSession.id == stored_id, UserSession.expires_at > datetime.now(UTC))
        )
        return self.db.execute(stmt).scalars().one_or_none()
