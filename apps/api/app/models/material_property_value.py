"""MaterialPropertyValue model: one property value for one material.

This is the heart of the data-quality methodology. A value can be:
  * scalar (``value_scalar``), or
  * interval (``value_min`` / ``value_max`` / ``value_typical``), or
  * explicitly missing (``is_missing`` = True, every numeric field NULL).

Missing values are NEVER coerced to zero. The unit trail is preserved end to
end: the original value and unit are kept alongside the normalised (canonical)
value and the conversion method used to produce it.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import DataQuality


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class MaterialPropertyValue(Base):
    """A single property measurement/estimate attached to a material."""

    __tablename__ = "material_property_value"

    id: Mapped[int] = mapped_column(primary_key=True)
    material_id: Mapped[int] = mapped_column(
        ForeignKey("material.id", ondelete="CASCADE"), nullable=False
    )
    property_id: Mapped[int] = mapped_column(
        ForeignKey("property_definition.id"), nullable=False
    )

    # Scalar OR interval representation. All nullable so "missing" is representable
    # without inventing a zero.
    value_scalar: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    value_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    value_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    value_typical: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Unit provenance / conversion trail.
    original_unit: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    normalized_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    canonical_unit: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    conversion_method: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)

    uncertainty: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    measurement_condition: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    source_id: Mapped[Optional[int]] = mapped_column(ForeignKey("source.id"), nullable=True)
    data_quality: Mapped[DataQuality] = mapped_column(
        Enum(DataQuality, native_enum=False, length=12),
        default=DataQuality.IMPORTADO,
        nullable=False,
    )
    is_missing: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    material: Mapped["Material"] = relationship(  # noqa: F821
        back_populates="property_values"
    )
    property_definition: Mapped["PropertyDefinition"] = relationship(  # noqa: F821
        back_populates="values"
    )
    source: Mapped[Optional["Source"]] = relationship(back_populates="values")  # noqa: F821
