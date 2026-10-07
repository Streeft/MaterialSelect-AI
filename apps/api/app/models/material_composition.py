"""MaterialCompositionEntry: one element of a material's chemical composition (D-105, TM2).

Mass percent, with the same trail as a property value: what the source wrote
(``value_*`` in ``original_unit``), the canonical numbers (``normalized_*`` in
``percent``), the conversion that produced them, the source, the quality.

The shapes a row can take — a range, only a maximum, only a minimum, a nominal
value, **balance** and **declared absent** — are pinned by ``CHECK``s here as
well as by ``app.domain.composition``: the seed, the official importer and a
future migration write this table without passing through the service, and the
two states that carry no number must not be able to acquire one. A balance is
never ``100 − Σ``; an absent content is never 0.

No row at all is the state "no composition registered", and it is not 0 % of
anything (D-24).
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from app.db.base import Base
from app.domain.elements import SYMBOLS, element_for
from app.models.enums import DataQuality


def _utcnow() -> datetime:
    return datetime.now(UTC)


_ELEMENT_LIST = ", ".join(f"'{symbol}'" for symbol in SYMBOLS)
_NUMBERS = (
    "value_min",
    "value_max",
    "value_nominal",
    "normalized_min",
    "normalized_max",
    "normalized_nominal",
)
_NO_NUMBER = " AND ".join(f"{column} IS NULL" for column in _NUMBERS)


class MaterialCompositionEntry(Base):
    __tablename__ = "material_composition"
    __table_args__ = (
        # One row per element: two would make a search depend on row order.
        UniqueConstraint("material_id", "element", name="uq_material_composition_element"),
        CheckConstraint(f"element IN ({_ELEMENT_LIST})", name="ck_material_composition_element"),
        CheckConstraint(
            "NOT (is_balance AND is_missing)", name="ck_material_composition_balance_or_missing"
        ),
        # Balance and absence carry no number, ever.
        CheckConstraint(
            f"(NOT is_balance AND NOT is_missing) OR ({_NO_NUMBER})",
            name="ck_material_composition_stateless_numbers",
        ),
        # A numeric row states at least one bound or a nominal value.
        CheckConstraint(
            "is_balance OR is_missing OR normalized_min IS NOT NULL "
            "OR normalized_max IS NOT NULL OR normalized_nominal IS NOT NULL",
            name="ck_material_composition_has_number",
        ),
        CheckConstraint(
            "normalized_min IS NULL OR normalized_max IS NULL OR normalized_min <= normalized_max",
            name="ck_material_composition_min_le_max",
        ),
        CheckConstraint(
            "(normalized_min IS NULL OR (normalized_min >= 0 AND normalized_min <= 100)) AND "
            "(normalized_max IS NULL OR (normalized_max >= 0 AND normalized_max <= 100)) AND "
            "(normalized_nominal IS NULL OR "
            "(normalized_nominal >= 0 AND normalized_nominal <= 100))",
            name="ck_material_composition_percent_range",
        ),
        CheckConstraint(
            "normalized_nominal IS NULL OR ("
            "(normalized_min IS NULL OR normalized_nominal >= normalized_min) AND "
            "(normalized_max IS NULL OR normalized_nominal <= normalized_max))",
            name="ck_material_composition_nominal_in_range",
        ),
        # At most one "the rest" per material.
        Index(
            "uq_material_composition_one_balance",
            "material_id",
            unique=True,
            sqlite_where=text("is_balance"),
            postgresql_where=text("is_balance"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    material_id: Mapped[int] = mapped_column(
        ForeignKey("material.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: Chemical symbol in its canonical capitalisation (``Cr``), from the fixed
    #: list in ``app.domain.elements``.
    element: Mapped[str] = mapped_column(String(3), nullable=False, index=True)
    #: The order the source lists the elements in, which is how a reader
    #: compares the sheet with the standard.
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    is_balance: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_missing: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # As the source wrote them, in ``original_unit``.
    value_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    value_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    value_nominal: Mapped[float | None] = mapped_column(Float, nullable=True)
    original_unit: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # Mass percent.
    normalized_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    normalized_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    normalized_nominal: Mapped[float | None] = mapped_column(Float, nullable=True)
    canonical_unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    conversion_method: Mapped[str | None] = mapped_column(String(120), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

    source_id: Mapped[int] = mapped_column(ForeignKey("source.id"), nullable=False, index=True)
    citation: Mapped[str | None] = mapped_column(String(500), nullable=True)
    data_quality: Mapped[DataQuality] = mapped_column(
        Enum(DataQuality, native_enum=False, length=12),
        default=DataQuality.IMPORTADO,
        nullable=False,
    )
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    material: Mapped[Material] = relationship(back_populates="composition")  # noqa: F821
    source: Mapped[Source] = relationship()  # noqa: F821

    @validates("element")
    def _canonical_symbol(self, _key: str, value: str) -> str:
        element = element_for(value)
        if element is None:
            raise ValueError(f"'{value}' não é símbolo de elemento químico.")
        return element.symbol
