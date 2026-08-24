"""Records who changed what, and when (M2).

A thin layer over ``AuditRepository``: every catalogue/study-mutating service
calls ``record_change`` right after mutating an entity but before its own
``commit()``, so the audit row lands in the *same* transaction as the change
it describes — one can never be committed without the other.

``record_change`` is a deliberate no-op when ``user`` is ``None``: some
callers (the bulk importer, background report generation) have no
authenticated actor to attribute a change to, and fabricating one would be
worse than the gap — the ancestor of the same rule that keeps a missing
property value ``NULL`` instead of guessing.
"""

from __future__ import annotations

from typing import Any

from app.models.audit import AuditEvent
from app.models.enums import AuditAction, AuditEntityType
from app.models.user import User
from app.repositories.audit_repository import AuditRepository


def record_change(
    repo: AuditRepository,
    user: User | None,
    *,
    entity_type: AuditEntityType,
    entity_id: int,
    entity_label: str,
    action: AuditAction,
    changes: dict[str, dict[str, Any]] | None = None,
    project_id: int | None = None,
) -> None:
    if user is None:
        return
    repo.add(
        AuditEvent(
            user_id=user.id,
            user_email=user.email,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_label=entity_label,
            project_id=project_id,
            action=action,
            changes=changes or None,
        )
    )


def diff_fields(before: dict[str, Any], after: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Return only the keys whose value actually changed, as ``{key: {before, after}}``.

    Compares the union of both dicts' keys, not just ``before``'s — a key
    that only ``after`` has (e.g. a property value that did not exist before)
    must still show up as a change.
    """
    changes: dict[str, dict[str, Any]] = {}
    for key in before.keys() | after.keys():
        old, new = before.get(key), after.get(key)
        if old != new:
            changes[key] = {"before": old, "after": new}
    return changes
