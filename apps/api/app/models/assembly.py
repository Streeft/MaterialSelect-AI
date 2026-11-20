"""Assembly: a thing being designed, as a list of parts (D-257).

On screen this is a **"Projeto"** — a table, with its top, its legs and its
nails. In the code it is an ``Assembly``, because ``Project`` is already the
name of something else: the single container that isolates one user's work
(``app.models.project``). An assembly lives inside that container, next to the
selection studies, and is scoped by it the same way.

A part is the unit of decision. It carries what the reader **declared** — a
name, a role, how many, how heavy each one is — and two optional links: the
selection study that decides its material, and the material chosen. Both links
are nullable on purpose: "not chosen yet" is the ordinary state of a part while
the project is being worked on, and it is stored as absence, never as a
placeholder (principle 3).

Nothing computed is stored. The mass, cost, energy and CO₂ of a part are
answered on every read from the catalogue as it stands
(``app.calculations.assembly``), so a corrected value in the catalogue corrects
every project that uses the material.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Assembly(Base):
    """A reader's project: a named list of parts, inside their ``Project``."""

    __tablename__ = "assembly"
    __table_args__ = (UniqueConstraint("project_id", "name", name="uq_assembly_project_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("project.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    # SQLite runs here without ``PRAGMA foreign_keys=ON``, so ``ondelete`` alone
    # would orphan the parts: the ORM cascade is what deletes them.
    parts: Mapped[list[AssemblyPart]] = relationship(
        back_populates="assembly",
        cascade="all, delete-orphan",
        order_by="AssemblyPart.position, AssemblyPart.id",
    )


class AssemblyPart(Base):
    """One part of an assembly: what it is, how many, and what it is made of."""

    __tablename__ = "assembly_part"

    id: Mapped[int] = mapped_column(primary_key=True)
    assembly_id: Mapped[int] = mapped_column(
        ForeignKey("assembly.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: Order in the list, 0-based.
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    #: ``estrutural`` | ``fixacao`` | ``acabamento`` | ``outro`` (``PartRole``).
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="estrutural")
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    #: Mass of **one** part, in kilograms, as the reader declared it. NULL is
    #: "not informed"; it is never defaulted, because every total hangs on it.
    unit_mass: Mapped[float | None] = mapped_column(Float, nullable=True)
    #: The material chosen for the part; NULL until the reader chooses.
    material_id: Mapped[int | None] = mapped_column(
        ForeignKey("material.id", ondelete="SET NULL"), nullable=True, index=True
    )
    #: The selection study that decides this part's material, if there is one.
    study_id: Mapped[int | None] = mapped_column(
        ForeignKey("selection_study.id", ondelete="SET NULL"), nullable=True, index=True
    )
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    #: D-261: the load the part has to carry, as one of the solver's cases
    #: (``app.calculations.load_cases``) and the reader's numbers for it, one
    #: per design variable, in that variable's canonical unit. Both NULL until
    #: the reader declares one; only what was declared is stored — the minimum
    #: mass it implies is answered on every trial, never kept.
    load_case_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    load_case_inputs: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    assembly: Mapped[Assembly] = relationship(back_populates="parts")
