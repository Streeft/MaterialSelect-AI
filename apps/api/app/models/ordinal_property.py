"""Ordinal material properties: a closed, *ordered* scale of labels (D-126).

The manual's exercise 8, step 2, filters materials by durability against an
agent ("água doce: aceitável ou melhor"). That datum is neither a number nor a
plain label: it is a **level on an ordered scale** — *Muito pobre < Pobre <
Aceitável < Bom < Excelente* — and the question asked of it is "at least this
level". Until now the only discrete datum in the model was a process
attribute's label set (D-59), which has no order at all.

Three tables, for the reason D-57/D-59 gave a process its own:

* ``PropertyDefinition`` is read by the property picker, the chart axes, the
  dashboard, nearness and the index evaluator, and every one of them reads
  ``canonical_unit`` as a magnitude. A level has no magnitude; putting it there
  would make each of those surfaces responsible for filtering it out, and one
  miss would plot "Bom" on an axis. The shape is shared by copying the
  provenance trail, not the row.
* The scale is **rows**, not a JSON list, so that a value can point at a level
  through a composite foreign key that also proves the level belongs to the
  value's own definition — a vocabulary the database closes, not the service
  alone.

Absence is the fourth state (D-24) and never the worst level: ``is_missing``
with ``level_id`` NULL, enforced by a portable check. "Sem dado" and "Muito
pobre" are different statements, and only one of them was made by a source.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import DataQuality


def _utcnow() -> datetime:
    return datetime.now(UTC)


class OrdinalPropertyDefinition(Base):
    """One ordinal material property and the scale its levels come from."""

    __tablename__ = "ordinal_property_definition"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    #: A fictitious definition (docs/15): the demo seed declares its own scale
    #: so the exercise has something to filter; ``clear_demo`` removes it.
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    levels: Mapped[list[OrdinalScaleLevel]] = relationship(
        back_populates="definition",
        cascade="all, delete-orphan",
        order_by="OrdinalScaleLevel.rank",
    )


class OrdinalScaleLevel(Base):
    """One level of a definition's scale. ``rank`` 0 is the worst level.

    Order is the whole datum: "Bom" means something only next to "Aceitável"
    and "Excelente". Unique by rank and by label within a definition, so the
    scale is a strict order with no two spellings of one level.
    """

    __tablename__ = "ordinal_scale_level"
    __table_args__ = (
        UniqueConstraint("definition_id", "rank", name="uq_ordinal_scale_level_rank"),
        UniqueConstraint("definition_id", "label", name="uq_ordinal_scale_level_label"),
        # Target of the value's composite foreign key below.
        UniqueConstraint("definition_id", "id", name="uq_ordinal_scale_level_definition_id"),
        CheckConstraint("rank >= 0", name="ck_ordinal_scale_level_rank_non_negative"),
        CheckConstraint("label <> ''", name="ck_ordinal_scale_level_label_not_blank"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    definition_id: Mapped[int] = mapped_column(
        ForeignKey("ordinal_property_definition.id", ondelete="CASCADE"), nullable=False
    )
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String(80), nullable=False)

    definition: Mapped[OrdinalPropertyDefinition] = relationship(back_populates="levels")


class MaterialOrdinalValue(Base):
    """The level one material holds on one ordinal property, with provenance.

    Exactly one of: a level (``level_id`` set, ``is_missing`` false) or an
    explicit absence (``is_missing`` true, ``level_id`` NULL). The composite
    foreign key ``(definition_id, level_id)`` makes a level of another
    definition unstorable.
    """

    __tablename__ = "material_ordinal_value"
    __table_args__ = (
        # One level per material per property, for the determinism reason
        # ``uq_material_property_value_pair`` spells out.
        UniqueConstraint("material_id", "definition_id", name="uq_material_ordinal_value_pair"),
        ForeignKeyConstraint(
            ["definition_id", "level_id"],
            ["ordinal_scale_level.definition_id", "ordinal_scale_level.id"],
            name="fk_material_ordinal_value_level_of_definition",
        ),
        CheckConstraint(
            "(is_missing AND level_id IS NULL) OR (NOT is_missing AND level_id IS NOT NULL)",
            name="ck_material_ordinal_value_level_or_missing",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    material_id: Mapped[int] = mapped_column(
        ForeignKey("material.id", ondelete="CASCADE"), nullable=False
    )
    definition_id: Mapped[int] = mapped_column(
        ForeignKey("ordinal_property_definition.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    level_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    measurement_condition: Mapped[str | None] = mapped_column(String(200), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_id: Mapped[int | None] = mapped_column(
        ForeignKey("source.id"), nullable=True, index=True
    )
    data_quality: Mapped[DataQuality] = mapped_column(
        Enum(DataQuality, native_enum=False, length=12),
        default=DataQuality.IMPORTADO,
        nullable=False,
    )
    is_missing: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    #: Declared on the row, like a designation (D-105), so a fictitious level on
    #: a real material is still found and removed by ``clear_demo``.
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    definition: Mapped[OrdinalPropertyDefinition] = relationship()
    level: Mapped[OrdinalScaleLevel | None] = relationship(
        primaryjoin="MaterialOrdinalValue.level_id == OrdinalScaleLevel.id",
        foreign_keys="MaterialOrdinalValue.level_id",
        viewonly=True,
    )
    source: Mapped[Source | None] = relationship()  # noqa: F821
