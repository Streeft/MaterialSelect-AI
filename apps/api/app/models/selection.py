"""Saved selection studies: SelectionStudy, SelectionConstraint, RankingCriterion.

A study captures a reproducible deterministic selection (function, constraints,
performance index, ranking criteria) so it can be reopened and re-run without
any AI. Operators, directions and normalization are stored as strings mirroring
the domain enums' ``.value`` (portable between SQLite and PostgreSQL).
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class SelectionStudy(Base):
    """A saved Function → Constraints → Objective → Ranking analysis."""

    __tablename__ = "selection_study"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    function_text: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    objective_text: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    free_variables: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

    combinator: Mapped[str] = mapped_column(String(3), default="AND", nullable=False)

    # Optional performance index applied to the candidates.
    index_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    index_expression: Mapped[str | None] = mapped_column(String(500), nullable=True)
    index_goal: Mapped[str | None] = mapped_column(String(10), nullable=True)

    normalization: Mapped[str] = mapped_column(String(10), default="minmax", nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    constraints: Mapped[list[SelectionConstraint]] = relationship(
        back_populates="study",
        cascade="all, delete-orphan",
        order_by="SelectionConstraint.position",
    )
    criteria: Mapped[list[RankingCriterion]] = relationship(
        back_populates="study",
        cascade="all, delete-orphan",
        order_by="RankingCriterion.position",
    )


class SelectionConstraint(Base):
    """One persisted constraint of a study (thresholds in their original unit)."""

    __tablename__ = "selection_constraint"

    id: Mapped[int] = mapped_column(primary_key=True)
    study_id: Mapped[int] = mapped_column(
        ForeignKey("selection_study.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    operator: Mapped[str] = mapped_column(String(20), nullable=False)
    property_slug: Mapped[str | None] = mapped_column(String(160), nullable=True)
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    value_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    value_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(60), nullable=True)
    class_slugs: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    text: Mapped[str | None] = mapped_column(String(200), nullable=True)
    label: Mapped[str | None] = mapped_column(String(200), nullable=True)

    study: Mapped[SelectionStudy] = relationship(back_populates="constraints")


class RankingCriterion(Base):
    """One persisted ranking criterion of a study."""

    __tablename__ = "ranking_criterion"

    id: Mapped[int] = mapped_column(primary_key=True)
    study_id: Mapped[int] = mapped_column(
        ForeignKey("selection_study.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    key: Mapped[str] = mapped_column(String(160), nullable=False)  # slug or "__index__"

    # Both nullable on purpose: NULL means "the user did not say", and the run
    # derives the answer from the property or the index. Filling them in at save
    # time would freeze a guess that then outranks the real source — a label
    # defaulted to the key printed "__index__" in reports, and a direction
    # defaulted to "max" silently reversed the ranking of a lower-is-better
    # property. Absent is absent here too.
    label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    direction: Mapped[str | None] = mapped_column(String(3), nullable=True)
    weight: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)

    study: Mapped[SelectionStudy] = relationship(back_populates="criteria")
