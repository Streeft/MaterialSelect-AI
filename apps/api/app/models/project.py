"""Project: the unit that isolates one user's selection studies.

The materials catalogue (materials/classes/properties) stays global and
shared across every logged-in user — it is reference data, not a project's
authorial work. Only ``SelectionStudy`` is scoped to a ``Project`` (see
``app.models.selection``). A ``User`` gets exactly one ``Project`` created for
them on first login (``AuthService``); nothing here assumes that stays true
forever, but nothing in the product exposes more than one yet either.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Project(Base):
    """A single-owner container for a user's selection studies."""

    __tablename__ = "project"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
