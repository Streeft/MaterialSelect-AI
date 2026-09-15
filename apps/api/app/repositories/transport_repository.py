"""Reads over the transport catalogue (P3, Eco Audit).

Small on purpose: the catalogue is a closed, seeded vocabulary of four rows (see
``app.models.transport_mode`` for why it is neither a material nor a process),
and there is no user-entry path in v1. The repository exists all the same,
because a service that queried the session directly would be the first one in
this codebase to do it.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.transport_mode import TransportMode


class TransportRepository:
    """Every read the eco audit makes over transport modes."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def list_active(self) -> list[TransportMode]:
        """Active modes in reading order — which is not a ranking of any kind."""
        return list(
            self.db.execute(
                select(TransportMode)
                .where(TransportMode.is_active.is_(True))
                .order_by(TransportMode.display_order, TransportMode.name)
            )
            .scalars()
            .all()
        )

    def get_active_by_slug(self, slug: str) -> TransportMode | None:
        return (
            self.db.execute(
                select(TransportMode).where(
                    TransportMode.slug == slug, TransportMode.is_active.is_(True)
                )
            )
            .scalars()
            .one_or_none()
        )
