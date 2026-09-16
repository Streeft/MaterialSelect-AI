"""Source model: bibliographic / provenance reference for property values.

M1 (docs/TODO.md): every source registers its own procedência e licença, and
a source flagged as possibly containing third-party data records who reviewed
it and when — the human decision the backlog item requires, made once at the
moment the source is first registered (see ``app.importers.service`` and
``app.services.material_service`` for where that gate is enforced).
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


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

    # Procedência/licença (M1). ``license_label`` is a short human label, not a
    # controlled vocabulary — "CC-BY-4.0", "Domínio público", "Uso interno
    # autorizado" are all valid; what matters is that it is never blank for a
    # source registered after M1 (enforced at registration time, not here —
    # a nullable column lets sources created before M1 exist without a
    # fabricated retroactive value, see the backfill migration).
    license_label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    license_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # The "sinalização de conteúdo possivelmente protegido" the backlog item
    # names: set explicitly by whoever registers the source, never inferred.
    contains_third_party_data: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # The "decisão humana obrigatória antes da incorporação": who registered
    # this source and when, stamped once, at registration — not a live
    # "current reviewer" that could be reassigned later.
    reviewed_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    values: Mapped[list[MaterialPropertyValue]] = relationship(  # noqa: F821
        back_populates="source"
    )
    reviewed_by = relationship("User")
