"""Source registry endpoint (M1): procedência and licença of every base
incorporated into the catalogue.

Requires login but not project scoping — sources are shared reference data,
same as the catalogue they back (see ``app.dependencies``).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user, require_catalog_curator
from app.models.user import User
from app.schemas.sources import SourceOut, SourcePatch
from app.services.source_service import SourceService

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("", response_model=list[SourceOut])
def list_sources(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[SourceOut]:
    """List every registered source, with its license and reviewer."""
    return SourceService(db, user).list_sources()


@router.patch(
    "/{source_id}", response_model=SourceOut, dependencies=[Depends(require_catalog_curator)]
)
def patch_source(
    source_id: int,
    payload: SourcePatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SourceOut:
    """Correct the bibliographic fields of a source, and nothing else (D-236)."""
    return SourceService(db, user).patch(source_id, payload)
