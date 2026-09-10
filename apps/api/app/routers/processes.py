"""Process universe endpoints (P0-2).

Requires login but not project scoping — the process catalogue is shared
reference data, exactly like the material taxonomy (see ``app.dependencies``).

Read-only: nothing here writes. The demo universe comes from the seed, and a
hand-editable process catalogue is its own piece of work, with the audit trail
the material catalogue has.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.process import (
    ProcessAttributeOut,
    ProcessClassOut,
    ProcessDetailOut,
    ProcessOut,
)
from app.services.process_service import ProcessService

router = APIRouter(prefix="/processes", tags=["processes"])


# Declared before the parameterised path below, so "classes" is never read as a
# process slug. P0-4 added that path, which is what makes the order load-bearing
# rather than merely tidy.
@router.get("/classes", response_model=list[ProcessClassOut])
def list_process_classes(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[ProcessClassOut]:
    """List the process taxonomy, with how many processes sit directly in each folder."""
    return ProcessService(db).list_classes()


@router.get("/attributes", response_model=list[ProcessAttributeOut])
def list_process_attributes(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[ProcessAttributeOut]:
    """List the process attribute catalogue (P0-4) — what a limit stage over
    processes can select on, and which shape of value each attribute holds."""
    return ProcessService(db).list_attributes()


@router.get("", response_model=list[ProcessOut])
def list_processes(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[ProcessOut]:
    """List active processes, each with how many materials it applies to."""
    return ProcessService(db).list_processes()


# Last, so "classes" and "attributes" above are never read as a process slug.
@router.get("/{slug}", response_model=ProcessDetailOut)
def get_process(
    slug: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ProcessDetailOut:
    """One process with its attributes and their provenance — the process datasheet."""
    return ProcessService(db).get_process(slug)
