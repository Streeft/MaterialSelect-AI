"""AuditEvent: who changed what, and when (M2).

An append-only trail over the entities a person edits by hand — materials,
classes, property definitions, performance indices and selection studies.
Every row is written by ``app.services.audit_service`` inside the same
transaction as the change it describes, so a change and its audit row are
never inconsistent with each other (one committed without the other).

``user_id`` is a nullable FK (``SET NULL`` on delete) so a row survives even
if the account is later removed, but ``user_email`` is a denormalized
snapshot taken at event time for the same reason: an audit trail that lost
"who" the moment an account was deleted would defeat its own purpose.
``entity_label`` is the same idea applied to "what" — a human-readable name
captured at event time, so a row stays legible after the entity itself is
renamed or deleted.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import AuditAction, AuditEntityType


def _utcnow() -> datetime:
    return datetime.now(UTC)


class AuditEvent(Base):
    """One recorded change to one entity."""

    __tablename__ = "audit_event"
    __table_args__ = (
        Index("ix_audit_event_entity", "entity_type", "entity_id"),
        Index("ix_audit_event_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_email: Mapped[str] = mapped_column(String(320), nullable=False)

    entity_type: Mapped[AuditEntityType] = mapped_column(
        Enum(AuditEntityType, native_enum=False, length=20), nullable=False
    )
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    entity_label: Mapped[str] = mapped_column(String(200), nullable=False)
    # Snapshot of the owning Project, for entity types scoped by one (today
    # only SELECTION_STUDY — the catalogue entity types are shared and leave
    # this NULL). Not a live join: after a study is deleted, entity_id no
    # longer resolves to anything, and privacy filtering on "was this study
    # ever this project's" would silently break at the exact moment it
    # matters most (auditing a deletion) without this snapshot.
    project_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    action: Mapped[AuditAction] = mapped_column(
        Enum(AuditAction, native_enum=False, length=12), nullable=False
    )
    # {field_or_slug: {"before": ..., "after": ...}}; None for CRIADO/EXCLUIDO,
    # where the action itself is the whole fact worth recording.
    changes: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    user = relationship("User")
