"""Material taxonomy (class) CRUD endpoints.

Requires login but not project scoping — the taxonomy is shared reference
data (see ``app.dependencies``).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.material_class import MaterialClassIn, MaterialClassOut
from app.services.taxonomy_service import TaxonomyService

router = APIRouter(prefix="/classes", tags=["classes"])


@router.get("", response_model=list[MaterialClassOut])
def list_classes(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[MaterialClassOut]:
    """List all material classes with their material counts."""
    return TaxonomyService(db, user).list_classes()


@router.post("", response_model=MaterialClassOut, status_code=status.HTTP_201_CREATED)
def create_class(
    payload: MaterialClassIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MaterialClassOut:
    """Create a material class."""
    return TaxonomyService(db, user).create_class(payload)


@router.put("/{class_id}", response_model=MaterialClassOut)
def update_class(
    class_id: int,
    payload: MaterialClassIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MaterialClassOut:
    """Update a material class."""
    return TaxonomyService(db, user).update_class(class_id, payload)


@router.delete("/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_class(
    class_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Delete a material class (only if unused and without subclasses)."""
    TaxonomyService(db, user).delete_class(class_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
