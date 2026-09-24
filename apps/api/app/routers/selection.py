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
from app.dependencies import get_current_project, get_current_user
from app.domain.ahp import derive_weights
from app.models.project import Project
from app.models.user import User
from app.schemas.selection import (
    AhpWeightsIn,
    AhpWeightsOut,
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
    WeightsPreviewOut,
    WeightsPreviewRequest,
)
from app.services.selection_service import SelectionService

router = APIRouter(prefix="/selection", tags=["selection"])
indices_router = APIRouter(prefix="/performance-indices", tags=["selection"])


@router.post("/filter", response_model=FilterResultOut)
def filter_materials(
    payload: FilterRequest,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> FilterResultOut:
    """Apply constraints and return the elimination funnel plus candidates."""
    return SelectionService(db, project.id, user).filter(payload)


@router.post("/index", response_model=IndexResultOut)
def evaluate_index(
    payload: IndexRequest,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> IndexResultOut:
    """Validate and evaluate a performance-index expression over all materials."""
    return SelectionService(db, project.id, user).evaluate_index(payload)


@router.post("/ahp-weights", response_model=AhpWeightsOut)
def derive_ahp_weights(
    payload: AhpWeightsIn,
    project: Project = Depends(get_current_project),
) -> AhpWeightsOut:
    """Derive normalized weights from a pairwise comparison matrix (AHP).

    Pure computation, no persistence and no project scoping — ``project`` is
    only here to require login, same as every other endpoint in this router
    (see module docstring). A ``ValidationError`` from ``derive_weights``
    (malformed matrix, or a consistency ratio above Saaty's 0.1 threshold) is
    converted to a 400 by the app's global exception handler — see
    ``app.domain.errors.ValidationError``'s own docstring — same as any other
    domain-layer ``ValidationError`` raised from this router (e.g. an
    incompatible unit on ``/filter``). 422 is reserved for Pydantic's own
    request-schema validation (e.g. a matrix with the wrong shape for
    ``AhpWeightsIn.criteria``).
    """
    result = derive_weights(payload.criteria, payload.matrix)
    return AhpWeightsOut(
        weights=result.weights,
        lambda_max=result.lambda_max,
        consistency_index=result.consistency_index,
        consistency_ratio=result.consistency_ratio,
    )


@router.post("/run", response_model=RunResultOut)
def run_selection(
    payload: RunRequest,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> RunResultOut:
    """Run the full pipeline: filter → index → ranking (with sensitivity)."""
    return SelectionService(db, project.id, user).run(payload)


@router.post("/weights-preview", response_model=WeightsPreviewOut)
def preview_weights(
    payload: WeightsPreviewRequest,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> WeightsPreviewOut:
    """The weight budget of the criteria as typed, plus the top-N they rank (D-87).

    Called while the reader types, so it answers 200 with the reason when there
    is nothing to rank yet, instead of an error per keystroke. Same dependencies
    as ``/run``: whoever may run a selection may preview one.
    """
    return SelectionService(db, project.id, user).weights_preview(payload)


# --- saved studies ---------------------------------------------------------


@router.get("/studies", response_model=list[StudySummaryOut])
def list_studies(
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> list[StudySummaryOut]:
    return SelectionService(db, project.id, user).list_studies()


@router.post("/studies", response_model=StudyOut, status_code=status.HTTP_201_CREATED)
def create_study(
    payload: StudyIn,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> StudyOut:
    return SelectionService(db, project.id, user).create_study(payload)


@router.get("/studies/{study_id}", response_model=StudyOut)
def get_study(
    study_id: int,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> StudyOut:
    return SelectionService(db, project.id, user).get_study(study_id)


@router.delete("/studies/{study_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_study(
    study_id: int,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> Response:
    SelectionService(db, project.id, user).delete_study(study_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/studies/{study_id}/run", response_model=RunResultOut)
def run_study(
    study_id: int,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> RunResultOut:
    return SelectionService(db, project.id, user).run_study(study_id)


# --- performance-index catalogue -------------------------------------------


@indices_router.get("", response_model=list[PerformanceIndexOut])
def list_indices(
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> list[PerformanceIndexOut]:
    return SelectionService(db, project.id, user).list_indices()


@indices_router.post("", response_model=PerformanceIndexOut, status_code=status.HTTP_201_CREATED)
def create_index(
    payload: PerformanceIndexIn,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> PerformanceIndexOut:
    return SelectionService(db, project.id, user).create_index(payload)
