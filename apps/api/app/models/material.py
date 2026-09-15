"""Material model: a catalogued material and its identifying metadata."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _utcnow() -> datetime:
    """Timezone-aware UTC now (module-level so it is picklable / testable)."""
    return datetime.now(UTC)


class Material(Base):
    """A material in the catalogue.

    Property values live in :class:`MaterialPropertyValue`. ``is_demo`` flags
    synthetic demonstration data so the UI can warn that it must not be used in
    real projects.
    """

    __tablename__ = "material"
    __table_args__ = (
        # P3: um registro sintetizado é hipótese de alguém, nunca catálogo
        # compartilhado. A garantia fica no banco e não só no serviço porque o
        # custo de errar é um número calculado passando por medido para todo
        # mundo — e porque o seed, o importador e uma migração futura escrevem
        # nesta tabela sem passar pelo serviço.
        # Escrito sem comparar com 1: o PostgreSQL recusa `booleano = 1`, e o
        # job de migrações da CI roda contra PostgreSQL de verdade.
        CheckConstraint(
            "NOT (is_synthesized AND owner_id IS NULL)",
            name="ck_material_sintetizado_tem_dono",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    class_id: Mapped[int] = mapped_column(
        ForeignKey("material_class.id"), nullable=False, index=True
    )
    subclass: Mapped[str | None] = mapped_column(String(200), nullable=True)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    # Free-form keywords for search; stored as a JSON list for portability.
    keywords: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # P1-4: who this record belongs to. NULL is the shared reference catalogue
    # — every row that existed before My Records, and every row the importer
    # and the seed still create. Set means one person's own record, readable
    # and writable only by them.
    #
    # A column and not a parallel `UserMaterial` table: the selection engine,
    # the chart repository, the dashboard and the exporters all ask a material
    # the same questions regardless of who made it, and a second table would
    # fork every one of those into two code paths answering "what is this
    # material's modulus?" — the two-truths failure the project refuses
    # elsewhere. D-57 split the process attributes off because they are a
    # *different kind of thing*; ownership is the same thing with a different
    # reader.
    #
    # The cascade is the honest one: a private record has no meaning without
    # its owner.
    owner_id: Mapped[int | None] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # P3: a derived record — a composite or a foam the Synthesizer computed from
    # catalogued parents plus a recipe. The flag is on the **record** and not on
    # each value because the decision to inherit a value unchanged is as much a
    # modelling choice as the decision to mix two; what varies per value is
    # *which law* ran, and that travels with the value in `notes`.
    #
    # A synthesized record is always somebody's own (see the CheckConstraint
    # below): it is a hypothesis, not a catalogue entry, and putting one in the
    # shared catalogue would make a computed number look measured to everyone.
    is_synthesized: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Set when the material was created by an import job, enabling logical
    # rollback of the whole import as a unit. NULL for manually created rows.
    import_job_id: Mapped[int | None] = mapped_column(
        ForeignKey("import_job.id"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    material_class: Mapped[MaterialClass] = relationship(back_populates="materials")  # noqa: F821
    property_values: Mapped[list[MaterialPropertyValue]] = relationship(  # noqa: F821
        back_populates="material", cascade="all, delete-orphan"
    )
    # P3: a receita, quando este registro é derivado. NULL em todo material
    # catalogado, que é o que todos eram antes do Synthesizer.
    synthesis: Mapped[MaterialSynthesis | None] = relationship(  # noqa: F821
        back_populates="material",
        foreign_keys="MaterialSynthesis.material_id",
        cascade="all, delete-orphan",
        uselist=False,
    )
    # P0-2: the processes this material can be made with. No cascade delete of
    # the processes themselves — a process outlives any one material that uses
    # it; the link rows go with the material through the association's
    # `ondelete="CASCADE"`.
    processes: Mapped[list[Process]] = relationship(  # noqa: F821
        secondary="material_process",
        back_populates="materials",
        order_by="Process.name",
    )
    # P1-4: the bookmarks pointing at this material. Cascade for the reason
    # every owned collection here has one — SQLite runs without
    # `PRAGMA foreign_keys=ON`, so `ondelete` alone would orphan the rows — and
    # the path that actually hard-deletes a material is real, not theoretical:
    # rolling back an import (`ImportRepository`) removes its rows outright,
    # and someone may well have starred one of them first.
    favorites: Mapped[list[Favorite]] = relationship(  # noqa: F821
        cascade="all, delete-orphan",
    )
    recent_views: Mapped[list[RecentRecord]] = relationship(  # noqa: F821
        cascade="all, delete-orphan",
    )
