"""Process attributes with provenance: ProcessAttributeDefinition and
ProcessAttributeValue (P0-4).

Step 2 of the manual's exercise 11 is a Limit Stage over *process* attributes —
shape, mass range, section thickness, process characteristics, economic batch
size. None of them existed: a process was a name, a family and a set of links,
so a process study could be narrowed by taxonomy and by the materials it serves,
and by nothing else. Ranking a process was refused for the same reason, and the
refusal said so in as many words ([D-58](../../docs/DECISIONS.md)).

This is not "one more table". Two things had to be built, and only one of them
is a copy of something that exists:

* **The provenance apparatus, unchanged.** Original value, original unit,
  normalised value, canonical unit, conversion method, uncertainty, measurement
  condition, source, quality, ``is_missing``. Identical in shape to
  :class:`~app.models.material_property_value.MaterialPropertyValue`, and
  deliberately so — the rule that a missing value is NULL and never 0 does not
  become negotiable because the record is a process.

* **Two shapes of value the model did not cover.** A *capability envelope* is
  not a material's interval property: a steel whose modulus is 200–210 GPa has
  one true modulus somewhere in there, and the midpoint is its representative
  point; a process that shapes parts of 0,1 to 10 kg can genuinely make any mass
  in the range, so a threshold is met when the range *reaches* it. And a
  *discrete* attribute has no number at all — *Primary shaping* is a label, and
  a selection over labels is a set membership question, not a comparison. See
  :class:`~app.models.enums.ProcessAttributeKind`.

Why separate tables rather than a ``universe`` column on
``PropertyDefinition``: the same reasoning that gave the process universe its
own ``ProcessClass`` instead of a flag on ``MaterialClass``
([D-57](../../docs/DECISIONS.md)). ``PropertyDefinition`` is read by the
material property picker, the chart axes, the dashboard and the index
evaluator; putting "faixa de massa" in that table would make every one of those
surfaces responsible for filtering it out, and a single miss offers a process
capability as a material property. The shape is shared by copying it, not by
sharing the row — and ``app.calculations.units`` and
``app.domain.data_quality`` are reused untouched, which is where the real
duplication risk was.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import BetterDirection, DataQuality, ProcessAttributeKind


def _utcnow() -> datetime:
    return datetime.now(UTC)


class ProcessAttributeDefinition(Base):
    """Definition (metadata) of one process attribute.

    Values live in :class:`ProcessAttributeValue`; this table holds only what a
    reader needs before any value exists: the shape of the value, the canonical
    unit it is stored in, the units accepted on input, and — for a discrete
    attribute — the closed vocabulary its labels come from.
    """

    __tablename__ = "process_attribute_definition"
    __table_args__ = (
        # A discrete attribute has no unit, and a numeric one cannot be without
        # one — the unit trail is the whole point. Enforced by the database
        # because a definition with a unit *and* labels, or with neither, makes
        # every value under it unreadable: the engine would not know which rule
        # to compare it by. The services check it too; only the constraint
        # covers a path that never goes through them.
        CheckConstraint(
            "(kind = 'DISCRETO') = (canonical_unit IS NULL)",
            name="ck_process_attribute_definition_unit_by_kind",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    symbol: Mapped[str | None] = mapped_column(String(32), nullable=True)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)

    kind: Mapped[ProcessAttributeKind] = mapped_column(
        Enum(ProcessAttributeKind, native_enum=False, length=10), nullable=False
    )

    # Pint dimensionality string, e.g. "[mass]". Empty means dimensionless —
    # an economic batch size is a count, and a count has no dimension.
    physical_dimension: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    # NULL only for a discrete attribute; see the check constraint above.
    canonical_unit: Mapped[str | None] = mapped_column(String(60), nullable=True)
    accepted_units: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

    #: The closed vocabulary of a discrete attribute, in display order. Empty
    #: for the numeric kinds. Closed rather than free text so that two spellings
    #: of one capability cannot become two capabilities — the same reason a
    #: class carries a slug. Not a check constraint: counting a JSON array is
    #: not portable between SQLite and PostgreSQL, so this one is enforced in
    #: the service and asserted in tests.
    allowed_labels: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

    #: Which way is better, for ranking. NEUTRAL for a discrete attribute, where
    #: the question does not apply — a shape is not better than another shape.
    better_direction: Mapped[BetterDirection] = mapped_column(
        Enum(BetterDirection, native_enum=False, length=10),
        default=BetterDirection.NEUTRAL,
        nullable=False,
    )

    values: Mapped[list[ProcessAttributeValue]] = relationship(
        back_populates="attribute", cascade="all, delete-orphan"
    )


class ProcessAttributeValue(Base):
    """One attribute value for one process, with its full provenance trail.

    A value is exactly one of:

    * scalar — ``value_scalar``;
    * envelope — ``value_min``/``value_max`` (plus the representative
      ``value_typical``), the criterion being the bounds;
    * discrete — ``labels``, a subset of the definition's vocabulary;
    * explicitly missing — ``is_missing`` True, every numeric field NULL and
      ``labels`` empty.

    Missing is never zero and never an empty label list read as "no capability":
    the two are different states, and a constraint over an attribute a process
    has no value for is *not satisfied* — the same rule the material side
    follows, because you cannot select on data you do not have.
    """

    __tablename__ = "process_attribute_value"
    __table_args__ = (
        # One value per process per attribute, for the determinism reason
        # uq_material_property_value_pair spells out: two rows for the same pair
        # would make the number that reaches a filter depend on the order the
        # SELECT happened to return.
        UniqueConstraint("process_id", "attribute_id", name="uq_process_attribute_value_pair"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Not indexed on its own: it leads uq_process_attribute_value_pair, which
    # already serves every lookup by process.
    process_id: Mapped[int] = mapped_column(
        ForeignKey("process.id", ondelete="CASCADE"), nullable=False
    )
    # Does need its own — as the pair index's second column it is unreachable
    # through it.
    attribute_id: Mapped[int] = mapped_column(
        ForeignKey("process_attribute_definition.id"), nullable=False, index=True
    )

    value_scalar: Mapped[float | None] = mapped_column(Float, nullable=True)
    value_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    value_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    value_typical: Mapped[float | None] = mapped_column(Float, nullable=True)

    #: The chosen labels of a discrete attribute. Empty for the numeric kinds
    #: and for a missing value.
    labels: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

    # Unit provenance / conversion trail.
    original_unit: Mapped[str | None] = mapped_column(String(60), nullable=True)
    normalized_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    #: The envelope's bounds in canonical units — what a threshold is actually
    #: compared against. ``MaterialPropertyValue`` has no equivalent because a
    #: material interval is compared through its representative point; this is
    #: the column pair that makes "intervalo como critério" storable rather
    #: than recomputed on every read.
    normalized_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    normalized_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    canonical_unit: Mapped[str | None] = mapped_column(String(60), nullable=True)
    conversion_method: Mapped[str | None] = mapped_column(String(120), nullable=True)

    uncertainty: Mapped[float | None] = mapped_column(Float, nullable=True)
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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    process: Mapped[Process] = relationship(back_populates="attribute_values")  # noqa: F821
    attribute: Mapped[ProcessAttributeDefinition] = relationship(back_populates="values")
    source: Mapped[Source | None] = relationship()  # noqa: F821
