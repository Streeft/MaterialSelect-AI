"""Deterministic selection endpoints (thin HTTP layer over SelectionService).

Every endpoint depends on ``get_current_project`` — which itself depends on
``get_current_user`` — so login is required everywhere here, even for the
catalogue-only endpoints (filter/index/run/indices) that don't use the
project id. That keeps one dependency per endpoint instead of two.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_project
from app.models.project import Project
from app.schemas.selection import (
    FilterRequest,
    FilterResultOut,
    IndexRequest,
    IndexResultOut,
    PerformanceIndexIn,
    PerformanceIndexOut,
    RunRequest,
    RunResultOut,
    StudyIn,
    StudyOut,
    StudySummaryOut,
)
from app.services.selection_service import SelectionService

router = APIRouter(prefix="/selection", tags=["selection"])
indices_router = APIRouter(prefix="/performance-indices", tags=["selection"])


@router.post("/filter", response_model=FilterResultOut)
def filter_materials(
    payload: FilterRequest,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
) -> FilterResultOut:
    """Apply constraints and return the elimination funnel plus candidates."""
    return SelectionService(db, project.id).filter(payload)


@router.post("/index", response_model=IndexResultOut)
def evaluate_index(
    payload: IndexRequest,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
) -> IndexResultOut:
    """Validate and evaluate a performance-index expression over all materials."""
    return SelectionService(db, project.id).evaluate_index(payload)


@router.post("/run", response_model=RunResultOut)
def run_selection(
    payload: RunRequest,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
) -> RunResultOut:
    """Run the full pipeline: filter → index → ranking (with sensitivity)."""
    return SelectionService(db, project.id).run(payload)


# --- saved studies ---------------------------------------------------------


@router.get("/studies", response_model=list[StudySummaryOut])
def list_studies(
    db: Session = Depends(get_db), project: Project = Depends(get_current_project)
) -> list[StudySummaryOut]:
    return SelectionService(db, project.id).list_studies()


@router.post("/studies", response_model=StudyOut, status_code=status.HTTP_201_CREATED)
def create_study(
    payload: StudyIn,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
) -> StudyOut:
    return SelectionService(db, project.id).create_study(payload)


@router.get("/studies/{study_id}", response_model=StudyOut)
def get_study(
    study_id: int,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
) -> StudyOut:
    return SelectionService(db, project.id).get_study(study_id)


@router.delete("/studies/{study_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_study(
    study_id: int,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
) -> Response:
    SelectionService(db, project.id).delete_study(study_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/studies/{study_id}/run", response_model=RunResultOut)
def run_study(
    study_id: int,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
) -> RunResultOut:
    return SelectionService(db, project.id).run_study(study_id)


# --- performance-index catalogue -------------------------------------------


@indices_router.get("", response_model=list[PerformanceIndexOut])
def list_indices(
    db: Session = Depends(get_db), project: Project = Depends(get_current_project)
) -> list[PerformanceIndexOut]:
    return SelectionService(db, project.id).list_indices()


@indices_router.post("", response_model=PerformanceIndexOut, status_code=status.HTTP_201_CREATED)
def create_index(
    payload: PerformanceIndexIn,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
) -> PerformanceIndexOut:
    return SelectionService(db, project.id).create_index(payload)
