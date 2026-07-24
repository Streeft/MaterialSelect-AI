"""PerformanceIndex model: a named, reusable material performance index.

An index is a safe expression over property slugs (e.g. ``modulo_young /
densidade``) plus an optimization goal and the engineering assumptions behind
it (function, geometry, objective, constraint). The classic Ashby indices are
seeded; users may add their own. Expressions are always evaluated through the
safe parser in ``app.calculations.expressions`` — never ``eval``.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class PerformanceIndex(Base):
    """A catalogued performance index (merit index)."""

    __tablename__ = "performance_index"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    expression: Mapped[str] = mapped_column(String(500), nullable=False)
    # "maximize" | "minimize"
    goal: Mapped[str] = mapped_column(String(10), default="maximize", nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Engineering hypotheses: function, geometry, objective, constraint, reference.
    assumptions: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
