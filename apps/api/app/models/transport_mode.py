"""TransportMode model: the third universe the eco audit needs, and the smallest.

A transport mode is neither a material nor a process, and forcing it into either
would break something that already works. It is not a material because nothing
about it is a property of matter. And it is **not a process** in this system's
sense ([D-57](../../docs/DECISIONS.md)): a ``Process`` is joined to materials by
``material_process``, and that join is what makes the Tree Stage a junction
between tables — "materials shaped by this process". A ship is not compatible
with a material, and seeding one as a process would put a meaningless row inside
a selection stage that reads as if it meant something.

**Why two plain columns instead of the provenance rail.** Every property value
in this system carries original value, original unit, normalised value,
canonical unit, conversion method, quality and source (principle 4). That rail
exists to survive two things a transport mode does not have in v1: **import**
and **hand entry**. This is a closed, tiny, seeded vocabulary of four rows with
exactly two numbers each, written in canonical units by the seed and by nothing
else. The commitment that does survive is M1's: the row still names its
``Source``, so the licence of the figure is registered like any other.

If a user-entry path ever appears here, this graduates to the value-table shape
of ``ProcessAttributeValue``; the trade-off is stated so the decision to
graduate can be made deliberately rather than discovered.

Both intensities are **nullable, and stay nullable**: NULL means nobody
catalogued that figure for this mode, which is a different thing from zero, and
the eco audit reports the transport phase as absent-with-a-reason rather than
free (principle 3).
"""

from __future__ import annotations

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TransportMode(Base):
    """One way of moving a finished part, with its energy and carbon intensity."""

    __tablename__ = "transport_mode"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)

    #: MJ per tonne-kilometre. Canonical unit, written by the seed.
    energy_intensity: Mapped[float | None] = mapped_column(Float, nullable=True)
    #: kg CO₂ per tonne-kilometre. Dimensionless to Pint — a mass of one
    #: substance over a mass of another — so the unit lives in words here and in
    #: every surface that prints it, exactly as ``custo_massa`` does for money.
    carbon_intensity: Mapped[float | None] = mapped_column(Float, nullable=True)

    #: Reading order in the picker; not a ranking of any kind.
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    source_id: Mapped[int | None] = mapped_column(
        ForeignKey("source.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source: Mapped[Source | None] = relationship()  # noqa: F821
