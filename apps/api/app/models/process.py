"""The process universe: ProcessClass, Process and the material↔process link.

P0-2. Until here the catalogue had one universe — materials — so a Tree stage
could only ever be "filter by folder". In the Ashby method the interesting
question is a **join between tables**: *which materials does this process
shape*, and *which processes join these materials*. That needs a second
universe and an explicit N–N association, which is what this module adds.

Two design choices worth stating, because both had a plausible alternative:

* **The process family is the root of the taxonomy, not an enum column.**
  Shaping, joining and surface treatment are the three families the method
  works with, and it is tempting to store them as a closed vocabulary on
  ``Process``. They live in ``ProcessClass`` instead, exactly as the material
  taxonomy lives in ``MaterialClass``: seeded data, not schema, so an operator
  can add a family without a migration — and so ancestry, descendants and the
  Tree stage all reuse ``app.domain.taxonomy`` unchanged. An enum would also
  have been a second truth able to disagree with the class tree.
* **The association carries no properties.** A link says only "this process
  applies to this material". Anything quantitative about the pairing — a
  thickness range, a cost per part — is a property of the pair and would need
  the same provenance apparatus ``MaterialPropertyValue`` has (original value,
  unit, normalized value, source, quality). Inventing a bare number here would
  break principle 1, so the link stays a link; the day the pairing needs
  numbers, it gets its own table with provenance, not a column.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class ProcessClass(Base):
    """A node in the process taxonomy (e.g. Conformação, União).

    Deliberately the same shape as :class:`~app.models.material_class.MaterialClass`:
    data-driven, hierarchical through the self-referential ``parent_id``, and
    read by ``app.domain.taxonomy.lineages`` so a process Tree stage can say
    "everything under Conformação" the way a material one says "everything under
    Metais".
    """

    __tablename__ = "process_class"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("process_class.id"), nullable=True)

    parent: Mapped[ProcessClass | None] = relationship(
        remote_side="ProcessClass.id", backref="children"
    )
    processes: Mapped[list[Process]] = relationship(back_populates="process_class")


class Process(Base):
    """A manufacturing process in the catalogue.

    ``is_demo`` flags synthetic demonstration data, same contract as
    :class:`~app.models.material.Material`: the interface warns that it must not
    be used in a real project. ``is_active`` hides a process from selection
    without deleting the links that reference it.
    """

    __tablename__ = "process"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    class_id: Mapped[int] = mapped_column(
        ForeignKey("process_class.id"), nullable=False, index=True
    )
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    process_class: Mapped[ProcessClass] = relationship(back_populates="processes")
    materials: Mapped[list[Material]] = relationship(  # noqa: F821
        secondary="material_process",
        back_populates="processes",
        order_by="Material.name",
    )


class MaterialProcess(Base):
    """The N–N link: this process applies to this material.

    A mapped class rather than a bare ``Table`` so a repository can query the
    links directly — the selection snapshot reads every pair in one statement
    instead of walking a relationship per material. It declares no
    relationships of its own on purpose: ``Material.processes`` and
    ``Process.materials`` map these same two foreign keys through
    ``secondary=``, and adding overlapping relationships here would be two
    writable paths to one row.

    The composite primary key is what makes the pairing unique — a material
    cannot be linked to the same process twice, without a surrogate id whose
    only job would be to allow that.
    """

    __tablename__ = "material_process"

    # No index of its own: it is the primary key's leading column, so
    # "which processes does this material have" is already served.
    material_id: Mapped[int] = mapped_column(
        ForeignKey("material.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # This one does need one — "which materials does this process apply to" is
    # the other half of the join, and the composite key cannot answer it.
    process_id: Mapped[int] = mapped_column(
        ForeignKey("process.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )
