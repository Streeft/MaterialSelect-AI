"""Schemas for the audit trail (M2)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.enums import AuditAction, AuditEntityType


class AuditEventOut(BaseModel):
    """One recorded change, as returned by ``GET /api/audit``."""

    id: int
    user_email: str
    entity_type: AuditEntityType
    entity_id: int
    entity_label: str
    action: AuditAction
    changes: dict[str, Any] | None = None
    created_at: datetime
