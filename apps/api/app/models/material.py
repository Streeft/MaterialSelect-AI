"""Material model: a catalogued material and its identifying metadata."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _utcnow() -> datetime:
    """Timezone-aware UTC now (module-level so it is picklable / testable)."""
    return datetime.now(timezone.utc)


class Material(Base):
    """A material in the catalogue.

    Property values live in :class:`MaterialPropertyValue`. ``is_demo`` flags
    synthetic demonstration data so the UI can warn that it must not be used in
    real projects.
    """

    __tablename__ = "material"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("material_class.id"), nullable=False)
    subclass: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    # Free-form keywords for search; stored as a JSON list for portability.
    keywords: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    material_class: Mapped["MaterialClass"] = relationship(  # noqa: F821
        back_populates="materials"
    )
    property_values: Mapped[list["MaterialPropertyValue"]] = relationship(  # noqa: F821
        back_populates="material", cascade="all, delete-orphan"
    )
