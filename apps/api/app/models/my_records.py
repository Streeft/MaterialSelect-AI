"""My Records (P1-4): the user's own space over a shared catalogue.

Two bookmarks live here — ``Favorite`` and ``RecentRecord`` — and both answer a
question about *this reader*, never about the record. Neither carries a number:
a value about a material belongs to ``MaterialPropertyValue``, with the whole
provenance trail behind it, and inventing one here would violate principle 1 in
the one place nobody would look for it (the same reasoning that keeps
``material_process`` free of numbers, D-57).

**One row reaches exactly one universe.** ``material_id`` and ``process_id`` are
both nullable and exactly one is set, enforced by a ``CheckConstraint`` — the
same shape the Chart Stage uses for an axis that is *either* a property slug
*or* an expression (D-60). The alternative, a polymorphic ``universe`` +
``record_id`` pair, would have been one column shorter and would have had no
foreign key at all: deleting a process would leave a bookmark pointing at
nothing, and no constraint in the database could say so. Referential integrity
is not a style preference, so the two columns win.

The record a bookmark points at is *not* owned by the bookmark: ``ondelete``
cascades from the record and from the user, never the other way. Un-starring a
material must not remove the material.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

#: Exactly one universe per row. Written once and shared by both tables so the
#: two bookmarks cannot drift into disagreeing about what a bookmark is.
_ONE_UNIVERSE = "(material_id IS NULL) <> (process_id IS NULL)"


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Favorite(Base):
    """A record this user marked to come back to.

    The uniqueness pair is per universe, and that is not redundancy: SQL treats
    NULLs as distinct, so ``uq_favorite_user_material`` simply does not
    constrain the rows whose ``material_id`` is NULL — which are exactly the
    process favourites the other constraint covers.
    """

    __tablename__ = "favorite"
    __table_args__ = (
        CheckConstraint(_ONE_UNIVERSE, name="ck_favorite_one_universe"),
        UniqueConstraint("user_id", "material_id", name="uq_favorite_user_material"),
        UniqueConstraint("user_id", "process_id", name="uq_favorite_user_process"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    material_id: Mapped[int | None] = mapped_column(
        ForeignKey("material.id", ondelete="CASCADE"), nullable=True
    )
    process_id: Mapped[int | None] = mapped_column(
        ForeignKey("process.id", ondelete="CASCADE"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class RecentRecord(Base):
    """The last records this user opened — a **set with an order**, not a log.

    Re-opening a record updates ``viewed_at`` on the row that already exists
    instead of adding a second one, and the repository keeps only the newest
    few. That is deliberate: "where was I" is answered by a short list of
    distinct places, and a log of every visit would answer "what did I do",
    which ``AuditEvent`` already answers with far better fidelity (M2).
    """

    __tablename__ = "recent_record"
    __table_args__ = (
        CheckConstraint(_ONE_UNIVERSE, name="ck_recent_record_one_universe"),
        UniqueConstraint("user_id", "material_id", name="uq_recent_user_material"),
        UniqueConstraint("user_id", "process_id", name="uq_recent_user_process"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    material_id: Mapped[int | None] = mapped_column(
        ForeignKey("material.id", ondelete="CASCADE"), nullable=True
    )
    process_id: Mapped[int | None] = mapped_column(
        ForeignKey("process.id", ondelete="CASCADE"), nullable=True
    )
    viewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
