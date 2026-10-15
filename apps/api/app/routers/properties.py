"""Property-definition CRUD endpoints.

Requires login but not project scoping — property definitions are shared
reference data (see ``app.dependencies``).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user, require_catalog_curator
from app.domain import depth_profile as depth
from app.models.user import User
from app.schemas.property import (
    DepthLevelOut,
    DepthProfilesOut,
    PropertyDefinitionIn,
    PropertyDefinitionOut,
)
from app.services.property_service import PropertyService

router = APIRouter(prefix="/properties", tags=["properties"])


@router.get("", response_model=list[PropertyDefinitionOut])
def list_properties(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[PropertyDefinitionOut]:
    """List all property definitions with their value counts."""
    return PropertyService(db, user).list_properties()


@router.get("/niveis", response_model=DepthProfilesOut)
def depth_profiles(user: User = Depends(get_current_user)) -> DepthProfilesOut:
    """Os perfis de profundidade L1/L2/L3 (D-127): configuração, não dado."""
    return DepthProfilesOut(
        default_level=int(depth.DEFAULT_LEVEL),
        undeclared_min_level=int(depth.UNDECLARED_MIN_LEVEL),
        levels=[
            DepthLevelOut(level=int(lvl), label=label, description=text)
            for lvl, (label, text) in depth.LEVEL_LABELS.items()
        ],
        property_min_level={k: int(v) for k, v in depth.PROPERTY_MIN_LEVEL.items()},
        tool_min_level={k: int(v) for k, v in depth.TOOL_MIN_LEVEL.items()},
    )


@router.post(
    "",
    response_model=PropertyDefinitionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_catalog_curator)],
)
def create_property(
    payload: PropertyDefinitionIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PropertyDefinitionOut:
    """Create a property definition."""
    return PropertyService(db, user).create_property(payload)


@router.put(
    "/{property_id}",
    response_model=PropertyDefinitionOut,
    dependencies=[Depends(require_catalog_curator)],
)
def update_property(
    property_id: int,
    payload: PropertyDefinitionIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PropertyDefinitionOut:
    """Update a property definition."""
    return PropertyService(db, user).update_property(property_id, payload)


@router.delete(
    "/{property_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_catalog_curator)],
)
def delete_property(
    property_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Delete a property definition (only if it has no values)."""
    PropertyService(db, user).delete_property(property_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
