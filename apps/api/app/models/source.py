"""Source model: bibliographic / provenance reference for property values."""

from __future__ import annotations

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Source(Base):
    """A data source that a property value can be traced back to.

    Normalised into its own table (rather than a free-text column) so the same
    reference can be shared by many values and later formatted as an ABNT/APA
    citation in generated reports.
    """

    __tablename__ = "source"

    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    reference: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    values: Mapped[list[MaterialPropertyValue]] = relationship(  # noqa: F821
        back_populates="source"
    )
