"""Property-definition CRUD endpoints.

Requires login but not project scoping — property definitions are shared
reference data (see ``app.dependencies``).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.property import PropertyDefinitionIn, PropertyDefinitionOut
from app.services.property_service import PropertyService

router = APIRouter(prefix="/properties", tags=["properties"])


@router.get("", response_model=list[PropertyDefinitionOut])
def list_properties(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[PropertyDefinitionOut]:
    """List all property definitions with their value counts."""
    return PropertyService(db).list_properties()


@router.post("", response_model=PropertyDefinitionOut, status_code=status.HTTP_201_CREATED)
def create_property(
    payload: PropertyDefinitionIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PropertyDefinitionOut:
    """Create a property definition."""
    return PropertyService(db).create_property(payload)


@router.put("/{property_id}", response_model=PropertyDefinitionOut)
def update_property(
    property_id: int,
    payload: PropertyDefinitionIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PropertyDefinitionOut:
    """Update a property definition."""
    return PropertyService(db).update_property(property_id, payload)


@router.delete("/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_property(
    property_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Delete a property definition (only if it has no values)."""
    PropertyService(db).delete_property(property_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
