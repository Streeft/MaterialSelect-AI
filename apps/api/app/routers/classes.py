"""Material taxonomy (class) CRUD endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.schemas.material_class import MaterialClassIn, MaterialClassOut
from app.services.taxonomy_service import TaxonomyService

router = APIRouter(prefix="/classes", tags=["classes"])


@router.get("", response_model=list[MaterialClassOut])
def list_classes(db: Session = Depends(get_db)) -> list[MaterialClassOut]:
    """List all material classes with their material counts."""
    return TaxonomyService(db).list_classes()


@router.post("", response_model=MaterialClassOut, status_code=status.HTTP_201_CREATED)
def create_class(payload: MaterialClassIn, db: Session = Depends(get_db)) -> MaterialClassOut:
    """Create a material class."""
    return TaxonomyService(db).create_class(payload)


@router.put("/{class_id}", response_model=MaterialClassOut)
def update_class(
    class_id: int, payload: MaterialClassIn, db: Session = Depends(get_db)
) -> MaterialClassOut:
    """Update a material class."""
    return TaxonomyService(db).update_class(class_id, payload)


@router.delete("/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_class(class_id: int, db: Session = Depends(get_db)) -> Response:
    """Delete a material class (only if unused and without subclasses)."""
    TaxonomyService(db).delete_class(class_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
