"""Optional AI-assistance endpoints.

Every route returns a *proposal* or a *description*. None of them changes stored
data, and none of them returns a number the deterministic layers did not
compute. When the layer is disabled, ``/status`` still answers (saying so) while
the working routes return 400 — the rest of the API is unaffected.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_project, get_current_user
from app.models.project import Project
from app.models.user import User
from app.schemas.ai import (
    AIDiagnosticoOut,
    AIStatusOut,
    ExplainRequest,
    ExplanationOut,
    InterpretationOut,
    InterpretRequest,
    PlanRequest,
    PlanRunRequest,
    PlanRunResponse,
    ProjectPlanOut,
    SuggestionsOut,
    SuggestRequest,
)
from app.services.ai_service import AIService

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/status", response_model=AIStatusOut)
def ai_status(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> AIStatusOut:
    """Report whether the layer is on, which model and host answer (never the
    key) and each capability configured or not (D-228)."""
    return AIService(db, user=user).status()


@router.post("/diagnostico", response_model=AIDiagnosticoOut)
def diagnose(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> AIDiagnosticoOut:
    """Try the model (a small JSON), the embedding and the web search once each (D-228).

    Spends no daily quota; limited per person per hour on its own counter.
    """
    return AIService(db, user=user).diagnose()


@router.post("/suggest", response_model=SuggestionsOut)
def suggest(
    payload: SuggestRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SuggestionsOut:
    """Up to three checked next steps for one tool's screen (D-228). Never applied here."""
    return AIService(db, user=user).suggest(payload)


@router.post("/interpret", response_model=InterpretationOut)
def interpret(
    payload: InterpretRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> InterpretationOut:
    """Structure a problem statement into editable, reviewable suggestions."""
    return AIService(db, user=user).interpret(payload)


@router.post("/explain", response_model=ExplanationOut)
def explain(
    payload: ExplainRequest,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> ExplanationOut:
    """Describe a saved study's already-computed result in prose."""
    return AIService(db, user=user).explain(payload.study_id, project.id)


@router.post("/plan", response_model=ProjectPlanOut)
def plan(
    payload: PlanRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectPlanOut:
    """Turn a plain-language request into a checked, executed project proposal (D-224)."""
    return AIService(db, user=user).plan(payload)


@router.post("/plan/run", response_model=PlanRunResponse)
def run_plan(
    payload: PlanRunRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PlanRunResponse:
    """Run a plan again with the person's choices; no model call, no quota (D-224)."""
    return AIService(db, user=user).run_plan(payload)
