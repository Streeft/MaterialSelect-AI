"""SavedChart: a named, reusable property-map configuration (B7).

Stores the full frontend filter state as one opaque JSON blob — the same
shape the "share by URL" feature (B1) already serializes — rather than
individual columns per filter, because the filter shape is a frontend
concern that already changes independently of this table; a JSON blob keeps
the two in sync without a migration every time a new axis option is added.
Scoped by project_id exactly like SelectionStudy (D-42): the catalogue is
shared, a saved chart is private to its owner's project.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class SavedChart(Base):
    __tablename__ = "saved_chart"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("project.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    # Opaque frontend filter state (MapUrlState, apps/web/app/mapas/url-state.ts),
    # stored verbatim — the backend never interprets its fields.
    configuration: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
