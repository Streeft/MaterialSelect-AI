"""Data-access layer for the audit trail (M2)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit import AuditEvent
from app.models.enums import AuditEntityType


class AuditRepository:
    """Writes and lists ``AuditEvent`` rows."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def add(self, event: AuditEvent) -> None:
        self.db.add(event)

    def list_events(
        self,
        *,
        entity_type: AuditEntityType | None = None,
        entity_id: int | None = None,
        project_id: int,
        limit: int = 50,
        offset: int = 0,
    ) -> list[AuditEvent]:
        """Most recent first; optionally narrowed to one entity type/id.

        ``project_id`` is mandatory and enforces the same privacy boundary as
        every other project-scoped query: a ``SELECTION_STUDY`` row is
        visible only when its own ``project_id`` snapshot matches the
        caller's. Catalogue entity types (material, material_class,
        property_definition, performance_index) have no owner and stay
        visible to any logged-in user, same as the endpoints that read them.
        """
        stmt = select(AuditEvent).where(
            (AuditEvent.entity_type != AuditEntityType.SELECTION_STUDY)
            | (AuditEvent.project_id == project_id)
        )
        if entity_type is not None:
            stmt = stmt.where(AuditEvent.entity_type == entity_type)
        if entity_id is not None:
            stmt = stmt.where(AuditEvent.entity_id == entity_id)
        stmt = stmt.order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
        stmt = stmt.limit(limit).offset(offset)
        return list(self.db.execute(stmt).scalars().all())
