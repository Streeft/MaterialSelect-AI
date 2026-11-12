"""SavedView: a reader's named way of looking at one screen (D-207, F2).

A view is a tab on a database screen — the catalogue, the processes, the
glossary — with a kind (table, gallery, list) and the filters and order the
reader chose; on the dashboard (``scope = "painel"``) the single
``kind = "layout"`` row holds the order and visibility of its blocks.

It belongs to the **user**, not the project: it is how one person reads the
shared catalogue, and it follows them between devices (the author chose the
account over the device on 12/11/2026). It never carries a number about a
material — filters name values the server already lists, and ranking,
counting and filtering stay on the server (principle 2).

``config`` is JSON validated by ``SavedViewConfig`` on the way in (bounded
size and shape), not an opaque blob: a view is read back by every screen that
shows its tab, and a malformed one would break the screen, not just itself.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class SavedView(Base):
    __tablename__ = "saved_view"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: The screen the view belongs to (``SAVED_VIEW_SCOPES``).
    scope: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    #: ``table`` | ``gallery`` | ``list`` | ``layout``.
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    #: Tab order within the scope, 0-based.
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )
