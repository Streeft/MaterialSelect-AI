"""PropertyDefinition model: configurable catalogue of material properties."""

from __future__ import annotations

from sqlalchemy import JSON, Boolean, Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import BetterDirection, PropertyCategory


class PropertyDefinition(Base):
    """Definition (metadata) of a material property.

    Property values are stored separately in :class:`MaterialPropertyValue`. This
    table holds only the *definition*: canonical unit, accepted units, physical
    dimension, whether it is interval-valued, and optimisation hints. Screens read
    these definitions instead of hard-coding property lists.
    """

    __tablename__ = "property_definition"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    symbol: Mapped[str | None] = mapped_column(String(32), nullable=True)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)

    category: Mapped[PropertyCategory] = mapped_column(
        Enum(PropertyCategory, native_enum=False, length=20), nullable=False
    )
    # Pint dimensionality string, e.g. "[mass] / [length] ** 3". Empty string means
    # dimensionless / unspecified.
    physical_dimension: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    canonical_unit: Mapped[str] = mapped_column(String(60), nullable=False)
    # List of unit strings accepted on input; stored as JSON for portability.
    accepted_units: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

    is_interval: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    better_direction: Mapped[BetterDirection] = mapped_column(
        Enum(BetterDirection, native_enum=False, length=10),
        default=BetterDirection.NEUTRAL,
        nullable=False,
    )
    allows_log_scale: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    values: Mapped[list[MaterialPropertyValue]] = relationship(  # noqa: F821
        back_populates="property_definition"
    )
