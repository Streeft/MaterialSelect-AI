"""Saved selection studies: SelectionStudy, SelectionConstraint, RankingCriterion.

A study captures a reproducible deterministic selection (function, constraints,
performance index, ranking criteria) so it can be reopened and re-run without
any AI. Operators, directions and normalization are stored as strings mirroring
the domain enums' ``.value`` (portable between SQLite and PostgreSQL).
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
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

    # P0-3: which universe the study *returns*. "material" (the default, and
    # every study saved before P0-3) or "process" — the manual's exercise 11,
    # where the result table is the process universe and a stage reaches into
    # the material one. It is a column and not an inference from the stages
    # because an empty pipeline would otherwise have no universe at all.
    universe: Mapped[str] = mapped_column(String(10), default="material", nullable=False)

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
    # P0-1: the ordered pipeline. Same cascade reasoning as the three above —
    # SQLite here runs without `PRAGMA foreign_keys=ON`, so `ondelete` alone
    # would orphan the rows.
    stages: Mapped[list[SelectionStage]] = relationship(
        back_populates="study",
        cascade="all, delete-orphan",
        order_by="SelectionStage.position",
    )


class SelectionStage(Base):
    """One stage of a study's ordered selection pipeline (P0-1).

    Until here a study carried *one* constraint tree, so everything the
    methodology does by combining stages — a limit stage narrowing what a tree
    stage admitted, disabling stage 2 to see its effect, deleting stage 3 and
    keeping the rest — had nowhere to live. A study now owns an ordered list of
    stages; the result is the intersection of the **enabled** ones, in
    ``position`` order.

    ``kind`` says what the stage filters by:

    * ``"limit"`` — a constraint tree. The stage owns exactly one root
      ``ConstraintGroup`` (``parent_group_id`` NULL, ``stage_id`` this stage),
      which is where M6's nesting continues to live.
    * ``"tree"`` — a folder selection over the taxonomy, in ``class_slugs``.
      With ``include_descendants`` (the default) picking a branch picks
      everything under it — the thing ``in_class`` cannot express, because it
      compares the material's own class and every material sits in a leaf.
    * ``"process"`` — the cross-universe join, in a **material** study (P0-2):
      keep the materials that *some* selected process applies to, named in
      ``process_slugs`` (leaves) and ``process_class_slugs`` (folders, expanded
      by the same ``include_descendants``). Any-of rather than all-of, because
      "weldable **and** injection-mouldable" is two stages, and the pipeline
      already intersects them — which is exactly the composition P0-1 exists
      for.
    * ``"material"`` — the same join from the other side, in a **process**
      study (P0-3): keep the processes that serve *some* material in the
      selected folders, named in ``material_class_slugs``. Folders only: a
      ``Material`` has no slug to name a leaf by, and the manual's own exercise
      selects a folder ("Polymers > Thermoplastic").

    Which kinds a stage may be is decided by the study's ``universe``: a
    material study takes ``limit``/``tree``/``process``, a process study takes
    ``limit``/``tree``/``material``. ``tree`` always means folders of the
    study's **own** universe, so `class_slugs` holds material classes in one and
    process classes in the other — the cross stage is the one that names the
    other universe, and it names it in its own columns.

    ``enabled`` is a column and not a deletion on purpose: turning a stage off
    and back on is how the effect of a criterion is *seen*, and a stage the
    user deleted to try that would have to be retyped.

    Every study has at least one stage: the migration's backfill gives each
    pre-existing study a single enabled ``limit`` stage owning the root group
    M6 already created for it, so reading a pre-P0-1 study still evaluates
    exactly as before.
    """

    __tablename__ = "selection_stage"

    id: Mapped[int] = mapped_column(primary_key=True)
    study_id: Mapped[int] = mapped_column(
        ForeignKey("selection_study.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # limit | tree | process | material
    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    # The user's own name for the stage. NULL means they did not name it, and
    # the interface says what the stage does instead — never a stored default
    # that would then outrank the stage's real content.
    label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Tree-stage payload; empty for a limit stage.
    class_slugs: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    # Process-stage payload (P0-2); empty for the other two kinds. Two columns
    # and not one: a process slug and a process-class slug are different
    # namespaces, and a single list would need the reader to guess which table
    # each entry names — the same reason `class_slugs` is not reused here.
    process_slugs: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    process_class_slugs: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    # Material-stage payload (P0-3): folders of the material taxonomy, for a
    # process study. Folders only — see the class docstring.
    material_class_slugs: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    # Shared by the tree and process stages: in both, picking a folder means
    # picking what is under it.
    include_descendants: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    study: Mapped[SelectionStudy] = relationship(back_populates="stages")


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
    # P0-1: the limit stage this group belongs to. Every group carries it —
    # a root group and every group nested under it — so the whole tree is
    # reachable from the stage without walking parents.
    stage_id: Mapped[int] = mapped_column(
        ForeignKey("selection_stage.id", ondelete="CASCADE"), nullable=False, index=True
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
    # P0-4: the labels of a discrete criterion (has_any_label / has_no_label) over
    # a process attribute. A column of its own rather than reusing `class_slugs`:
    # a class slug and an attribute label are different namespaces, and one list
    # would leave the reader guessing which the entries name — the same reason
    # the stage keeps its process and material slug lists apart.
    labels: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

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
