"""Audit trail endpoint (M2): who changed what, and when.

Requires login (via ``get_current_project``, so project scoping is available
for the privacy filter — see ``AuditRepository.list_events``). Catalogue
entity types are shared reference data and visible to any logged-in user,
same as the endpoints that read the catalogue itself; ``selection_study``
events are only visible to the project that owned the study.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_project
from app.models.enums import AuditEntityType
from app.models.project import Project
from app.repositories.audit_repository import AuditRepository
from app.schemas.audit import AuditEventOut

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditEventOut])
def list_audit_events(
    entity_type: AuditEntityType | None = Query(default=None),
    entity_id: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
) -> list[AuditEventOut]:
    """List recorded changes, most recent first."""
    events = AuditRepository(db).list_events(
        entity_type=entity_type,
        entity_id=entity_id,
        project_id=project.id,
        limit=limit,
        offset=offset,
    )
    return [
        AuditEventOut(
            id=e.id,
            user_email=e.user_email,
            entity_type=e.entity_type,
            entity_id=e.entity_id,
            entity_label=e.entity_label,
            action=e.action,
            changes=e.changes,
            created_at=e.created_at,
        )
        for e in events
    ]
