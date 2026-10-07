"""MaterialDesignation: a name a material carries in some naming system (D-105, TM2).

One material, N designations — ``UNS S30400``, ``AISI 304``, ``EN 1.4301``, a
trade name — each with the source that states it. A designation is an
attribute of **one** record: two materials sharing a code is not a statement
that they are the same material, and nothing here links them. Equivalence
between standards is TM1, and only a source that declares it can supply it.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from app.db.base import Base
from app.models.enums import DesignationSystem


def _utcnow() -> datetime:
    return datetime.now(UTC)


class MaterialDesignation(Base):
    __tablename__ = "material_designation"
    __table_args__ = (
        # The same code twice in one system on one material would be one fact
        # written twice; search would then count it twice for relevance.
        UniqueConstraint("material_id", "system", "code_key", name="uq_material_designation_code"),
        CheckConstraint("code_key <> ''", name="ck_material_designation_code_not_blank"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    material_id: Mapped[int] = mapped_column(
        ForeignKey("material.id", ondelete="CASCADE"), nullable=False, index=True
    )
    system: Mapped[DesignationSystem] = mapped_column(
        Enum(DesignationSystem, native_enum=False, length=16), nullable=False, index=True
    )
    #: As the source wrote it — what the sheet shows.
    code: Mapped[str] = mapped_column(String(120), nullable=False)
    #: ``designation_key(code)``: what search compares. Kept in step with
    #: ``code`` by the validator below, on every write path, so no caller can
    #: store one without the other.
    code_key: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    #: Where the designation applies, when the source restricts it ("Europa").
    region: Mapped[str | None] = mapped_column(String(80), nullable=True)

    # Provenance is required: a designation with no source is a claim nobody
    # made. ``citation`` locates it inside the source (table, page, clause).
    source_id: Mapped[int] = mapped_column(ForeignKey("source.id"), nullable=False, index=True)
    citation: Mapped[str | None] = mapped_column(String(500), nullable=True)
    #: Fictitious row (docs/15-dados-demonstrativos.md). Declared on the row
    #: itself so that a demo designation on a real material is still findable
    #: by ``clear_demo``.
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    material: Mapped[Material] = relationship(back_populates="designations")  # noqa: F821
    source: Mapped[Source] = relationship()  # noqa: F821

    @validates("code")
    def _keep_key_in_step(self, _key: str, code: str) -> str:
        # Imported here: the domain module imports the enums, and importing
        # ``app.models.enums`` runs this package's ``__init__`` — a top-level
        # import would close the circle.
        from app.domain.designation import designation_key

        self.code_key = designation_key(code)
        return code.strip()
