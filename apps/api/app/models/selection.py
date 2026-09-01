"""Saved selection studies: SelectionStudy, SelectionConstraint, RankingCriterion.

A study captures a reproducible deterministic selection (function, constraints,
performance index, ranking criteria) so it can be reopened and re-run without
any AI. Operators, directions and normalization are stored as strings mirroring
the domain enums' ``.value`` (portable between SQLite and PostgreSQL).
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class SelectionStudy(Base):
    """A saved Function → Constraints → Objective → Ranking analysis."""

    __tablename__ = "selection_study"
    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_selection_study_project_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Uniqueness on `name` is enforced per project, not globally — see the
    # composite constraint on the table and SelectionRepository.study_name_exists.
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("project.id", ondelete="CASCADE"), nullable=False, index=True
    )
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
    method: Mapped[str] = mapped_column(String(20), default="weighted_sum", nullable=False)

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
    # Every ConstraintGroup carries its own study_id (root or nested, M6), so
    # this one relationship deletes the whole tree when the study goes —
    # matching the cascade already declared for `constraints`/`criteria`,
    # needed because SQLite here runs without `PRAGMA foreign_keys=ON`, so
    # `ondelete="CASCADE"` alone would leave the group (and any descendants)
    # orphaned.
    constraint_groups: Mapped[list[ConstraintGroup]] = relationship(
        back_populates="study",
        cascade="all, delete-orphan",
        order_by="ConstraintGroup.position",
    )


class ConstraintGroup(Base):
    """One node of a constraint boolean-expression tree: either the root of
    a study's constraints, or a nested AND/OR sub-group (M6).

    A study's constraints used to combine under one global operator
    (SelectionStudy.combinator); every study now has exactly one root
    ConstraintGroup (parent_group_id NULL) whose operator is that same
    value, created by this migration's backfill for existing studies —
    reading a pre-M6 study still evaluates exactly as before. Nesting one
    sub-group inside another (parent_group_id pointing at a non-root group)
    is how "(A AND B) OR (C AND D)" is expressed: two child groups of a
    root OR-group, each an AND-group over its own constraints.
    """

    __tablename__ = "selection_constraint_group"

    id: Mapped[int] = mapped_column(primary_key=True)
    study_id: Mapped[int] = mapped_column(
        ForeignKey("selection_study.id", ondelete="CASCADE"), nullable=False, index=True
    )
    parent_group_id: Mapped[int | None] = mapped_column(
        ForeignKey("selection_constraint_group.id", ondelete="CASCADE"), nullable=True, index=True
    )
    operator: Mapped[str] = mapped_column(String(3), nullable=False)  # "AND" | "OR"
    position: Mapped[int] = mapped_column(nullable=False, default=0)

    study: Mapped[SelectionStudy] = relationship(back_populates="constraint_groups")


class SelectionConstraint(Base):
    """One persisted constraint of a study (thresholds in their original unit)."""

    __tablename__ = "selection_constraint"

    id: Mapped[int] = mapped_column(primary_key=True)
    study_id: Mapped[int] = mapped_column(
        ForeignKey("selection_study.id", ondelete="CASCADE"), nullable=False, index=True
    )
    group_id: Mapped[int] = mapped_column(
        ForeignKey("selection_constraint_group.id", ondelete="CASCADE"), nullable=False, index=True
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
        ForeignKey("selection_study.id", ondelete="CASCADE"), nullable=False, index=True
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
