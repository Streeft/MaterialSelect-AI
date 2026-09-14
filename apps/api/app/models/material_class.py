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
    #: Editorial text about the **family**, not about any material in it (P1-4).
    #:
    #: A folder was a label until here: a name, a slug and a parent. The method's
    #: browse step asks a different question — "what *is* this family, and where
    #: is it used?" — and a label cannot answer it. These two fields are the
    #: answer, and they are deliberately **free text**, because they are editorial
    #: prose and not data: nothing here is compared, converted, ranked or plotted.
    #:
    #: They are therefore **outside principle 1** by construction rather than by
    #: exception — that principle governs *property values*, and a sentence about
    #: a family is not one. What keeps them honest is the opposite rule: NULL
    #: means nobody wrote it, and the interface renders that as a written absence
    #: (D-24), never as an empty panel the reader has to interpret.
    applications: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    characteristics: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("material_class.id"), nullable=True)

    parent: Mapped[MaterialClass | None] = relationship(
        remote_side="MaterialClass.id", backref="children"
    )
    materials: Mapped[list[Material]] = relationship(back_populates="material_class")  # noqa: F821
