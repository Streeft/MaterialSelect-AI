"""Saved view endpoints (D-207): a reader's tabs on a database screen."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.saved_view import SavedViewIn, SavedViewOut, SavedViewPatch, SavedViewScope
from app.services.saved_view_service import SavedViewService

router = APIRouter(prefix="/saved-views", tags=["saved-views"])


@router.get("", response_model=list[SavedViewOut])
def list_saved_views(
    scope: SavedViewScope = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SavedViewOut]:
    """The reader's views for one screen, in tab order."""
    return SavedViewService(db, user.id).list_views(scope)


@router.post("", response_model=SavedViewOut, status_code=status.HTTP_201_CREATED)
def create_saved_view(
    payload: SavedViewIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SavedViewOut:
    return SavedViewService(db, user.id).create_view(payload)


@router.patch("/{view_id}", response_model=SavedViewOut)
def update_saved_view(
    view_id: int,
    patch: SavedViewPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SavedViewOut:
    return SavedViewService(db, user.id).update_view(view_id, patch)


@router.delete("/{view_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_view(
    view_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    SavedViewService(db, user.id).delete_view(view_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
