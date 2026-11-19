"""Source registry endpoint (M1): procedência and licença of every base
incorporated into the catalogue.

Requires login but not project scoping — sources are shared reference data,
same as the catalogue they back (see ``app.dependencies``).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user, require_catalog_curator
from app.models.user import User
from app.schemas.sources import (
    SourceCreate,
    SourceMergeIn,
    SourceMergeOut,
    SourceOut,
    SourcePatch,
)
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


@router.post(
    "",
    response_model=SourceOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_catalog_curator)],
)
def create_source(
    payload: SourceCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SourceOut:
    """Register a source by hand (D-249): label and licence required, the curator stamped."""
    return SourceService(db, user).create(payload)


@router.delete(
    "/{source_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_catalog_curator)],
)
def delete_source(
    source_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Delete a source nothing cites (D-249); a cited one is a 409 that says what cites it."""
    SourceService(db, user).delete(source_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{source_id}/mesclar",
    response_model=SourceMergeOut,
    dependencies=[Depends(require_catalog_curator)],
)
def merge_source(
    source_id: int,
    payload: SourceMergeIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SourceMergeOut:
    """Move every citation of this source to another and remove it (D-249), audited."""
    return SourceService(db, user).merge(source_id, payload.target_id)
