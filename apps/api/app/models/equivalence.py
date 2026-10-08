"""Declared equivalence between designations (D-115, TM1).

A **group** is one statement a source makes: "these designations correspond, and
this is how closely". Its **members** are rows of ``material_designation`` — the
designations themselves, not materials — so the statement says exactly what the
source said (``UNS S30400`` ~ ``EN 1.4301``) and each material that carries one
of those designations inherits it.

Nothing here is ever inferred. Two designations are in a group because a curator
entered them from a source that declares it, and the source is required: a
correspondence with no source is a claim nobody made. Two materials sharing a
code, or two codes that look alike, are in no group by that fact (the "looks
alike" question is Find Similar, D-63, and stays a different question).
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import EquivalenceKind


def _utcnow() -> datetime:
    return datetime.now(UTC)


class EquivalenceGroup(Base):
    __tablename__ = "equivalence_group"

    id: Mapped[int] = mapped_column(primary_key=True)
    #: What the source says about the correspondence. Required: a group with no
    #: stated degree would read as "equivalent" by default.
    kind: Mapped[EquivalenceKind] = mapped_column(
        Enum(EquivalenceKind, native_enum=False, length=16), nullable=False, index=True
    )
    # Provenance is required, for the reason it is on a designation. ``citation``
    # locates the declaration inside the source (table, page, clause).
    source_id: Mapped[int] = mapped_column(ForeignKey("source.id"), nullable=False, index=True)
    citation: Mapped[str | None] = mapped_column(String(500), nullable=True)
    #: The source's own qualification ("sem requisito de tratamento térmico").
    #: Free text, shown as written; never read by code.
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    source: Mapped[Source] = relationship()  # noqa: F821
    members: Mapped[list[EquivalenceMember]] = relationship(
        back_populates="group",
        cascade="all, delete-orphan",
        order_by="EquivalenceMember.id",
    )


class EquivalenceMember(Base):
    __tablename__ = "equivalence_member"
    __table_args__ = (UniqueConstraint("group_id", "designation_id", name="uq_equivalence_member"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("equivalence_group.id", ondelete="CASCADE"), nullable=False, index=True
    )
    designation_id: Mapped[int] = mapped_column(
        ForeignKey("material_designation.id", ondelete="CASCADE"), nullable=False, index=True
    )

    group: Mapped[EquivalenceGroup] = relationship(back_populates="members")
    designation: Mapped[MaterialDesignation] = relationship()  # noqa: F821
