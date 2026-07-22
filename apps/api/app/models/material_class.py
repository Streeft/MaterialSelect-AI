"""MaterialClass model: configurable, hierarchical material taxonomy."""

from __future__ import annotations

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class MaterialClass(Base):
    """A node in the material taxonomy (e.g. Metais, Polímeros).

    The taxonomy is data-driven (seeded, not hard-coded in the UI) and supports
    hierarchy through the self-referential ``parent_id``.
    """

    __tablename__ = "material_class"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("material_class.id"), nullable=True
    )

    parent: Mapped[MaterialClass | None] = relationship(
        remote_side="MaterialClass.id", backref="children"
    )
    materials: Mapped[list[Material]] = relationship(  # noqa: F821
        back_populates="material_class"
    )
