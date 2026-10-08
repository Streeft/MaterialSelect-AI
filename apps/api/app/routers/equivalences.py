"""Declared equivalence between designations (D-115, TM1).

Reading is for any logged-in user. Writing is the shared-catalogue curator's
(``require_catalog_curator``), and every write names the source that declares
the correspondence. Equivalence is never inferred from a name.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user, require_catalog_curator
from app.models.user import User
from app.schemas.equivalence import (
    EquivalenceGroupIn,
    EquivalenceGroupOut,
    MaterialEquivalencesOut,
)
from app.services.equivalence_service import EquivalenceService

router = APIRouter(tags=["equivalences"])


@router.get("/materials/{material_id}/equivalencias", response_model=MaterialEquivalencesOut)
def list_material_equivalences(
    material_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MaterialEquivalencesOut:
    """The equivalences a source has declared for this material's designations.

    A material with none answers 200 with an empty list: "nothing declared" is a
    fact about the record, written on the sheet (D-24), not a 404.
    """
    return EquivalenceService(db, user).for_material(material_id)


@router.get("/equivalencias/{group_id}", response_model=EquivalenceGroupOut)
def get_equivalence(
    group_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> EquivalenceGroupOut:
    return EquivalenceService(db, user).get(group_id)


@router.post(
    "/equivalencias",
    response_model=EquivalenceGroupOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_catalog_curator)],
)
def create_equivalence(
    payload: EquivalenceGroupIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EquivalenceGroupOut:
    """Record a correspondence a source declares (curator only; source required)."""
    return EquivalenceService(db, user).create(payload)


@router.put(
    "/equivalencias/{group_id}",
    response_model=EquivalenceGroupOut,
    dependencies=[Depends(require_catalog_curator)],
)
def update_equivalence(
    group_id: int,
    payload: EquivalenceGroupIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EquivalenceGroupOut:
    return EquivalenceService(db, user).update(group_id, payload)


@router.delete(
    "/equivalencias/{group_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_catalog_curator)],
)
def delete_equivalence(
    group_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Response:
    EquivalenceService(db, user).delete(group_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
