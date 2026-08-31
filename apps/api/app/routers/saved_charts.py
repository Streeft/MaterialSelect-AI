"""Saved chart endpoints (named, reusable map configurations)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_project, get_current_user
from app.models.project import Project
from app.models.user import User
from app.schemas.saved_chart import SavedChartIn, SavedChartListItem, SavedChartOut
from app.services.saved_chart_service import SavedChartService

router = APIRouter(prefix="/saved-charts", tags=["saved-charts"])


@router.get("", response_model=list[SavedChartListItem])
def list_saved_charts(
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
) -> list[SavedChartListItem]:
    """List all saved charts for the current user's project (omits configuration)."""
    return SavedChartService(db, project.id).list_charts()


@router.post("", response_model=SavedChartOut, status_code=status.HTTP_201_CREATED)
def create_saved_chart(
    payload: SavedChartIn,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> SavedChartOut:
    """Create a new saved chart configuration."""
    return SavedChartService(db, project.id, user).create_chart(payload)


@router.get("/{chart_id}", response_model=SavedChartOut)
def get_saved_chart(
    chart_id: int,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
) -> SavedChartOut:
    """Fetch one saved chart (full, with configuration)."""
    return SavedChartService(db, project.id).get_chart(chart_id)


@router.delete("/{chart_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_chart(
    chart_id: int,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> Response:
    """Delete a saved chart."""
    SavedChartService(db, project.id, user).delete_chart(chart_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
