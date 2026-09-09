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
from app.schemas.process import ProcessClassOut, ProcessOut
from app.services.process_service import ProcessService

router = APIRouter(prefix="/processes", tags=["processes"])


# Declared before any parameterised path would be, so "classes" is never read as
# a process identifier. There is no such path today; the order keeps it safe if
# one is added.
@router.get("/classes", response_model=list[ProcessClassOut])
def list_process_classes(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[ProcessClassOut]:
    """List the process taxonomy, with how many processes sit directly in each folder."""
    return ProcessService(db).list_classes()


@router.get("", response_model=list[ProcessOut])
def list_processes(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[ProcessOut]:
    """List active processes, each with how many materials it applies to."""
    return ProcessService(db).list_processes()
