"""TrayItem: what a reader is carrying to the bench (D-258).

The tray is the reader's working set — the materials picked from the drawers,
the fixings, the processes and the calculators taken along for the job at
hand. It is not the favourites (``app.models.my_records``): a favourite is
"come back to this some day", a tray item is "I am using this now", and the
tray has compartments the favourites do not.

**It is a marker, like a favourite, and carries no number.** A value about a
material belongs to ``MaterialPropertyValue`` with its provenance; nothing here
is one.

**One row is exactly one thing**: a material, a process or a tool. The first two
are foreign keys, for the reason ``Favorite`` gives — a polymorphic id would
have no referential integrity. A tool is a slug of the closed list in
``app.domain.tray_tools``; it has no table to point at, and the service
validates it. A ``CheckConstraint`` holds "exactly one of the three".

``compartment`` is where the reader put it: a material is either a *material*
or a *fixação* (the same steel, as a nail); processes and tools are
*ferramentas*. Which targets a compartment admits is a service rule; the column
only records the choice.

It belongs to the **user**, like the favourites and the saved views: it is one
person's working set over the shared catalogue.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

#: Exactly one of the three targets is set (booleans add as 0/1 on both engines).
_ONE_TARGET = (
    "(CASE WHEN material_id IS NOT NULL THEN 1 ELSE 0 END"
    " + CASE WHEN process_id IS NOT NULL THEN 1 ELSE 0 END"
    " + CASE WHEN tool IS NOT NULL THEN 1 ELSE 0 END) = 1"
)


def _utcnow() -> datetime:
    return datetime.now(UTC)


class TrayItem(Base):
    __tablename__ = "tray_item"
    __table_args__ = (
        CheckConstraint(_ONE_TARGET, name="ck_tray_item_one_target"),
        # NULLs are distinct in SQL, so each pair only constrains its own kind of row.
        UniqueConstraint("user_id", "material_id", name="uq_tray_user_material"),
        UniqueConstraint("user_id", "process_id", name="uq_tray_user_process"),
        UniqueConstraint("user_id", "tool", name="uq_tray_user_tool"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    material_id: Mapped[int | None] = mapped_column(
        ForeignKey("material.id", ondelete="CASCADE"), nullable=True, index=True
    )
    process_id: Mapped[int | None] = mapped_column(
        ForeignKey("process.id", ondelete="CASCADE"), nullable=True, index=True
    )
    #: A slug of ``app.domain.tray_tools.TRAY_TOOLS``.
    tool: Mapped[str | None] = mapped_column(String(32), nullable=True)
    #: ``material`` | ``fixacao`` | ``ferramenta`` (``TrayCompartment``).
    compartment: Mapped[str] = mapped_column(String(16), nullable=False)
    #: Order within the compartment, 0-based.
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    material: Mapped[Material | None] = relationship()  # noqa: F821
    process: Mapped[Process | None] = relationship()  # noqa: F821
