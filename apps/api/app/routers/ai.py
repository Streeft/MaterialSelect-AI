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
from app.schemas.ai import (
    AIStatusOut,
    ExplainRequest,
    ExplanationOut,
    InterpretationOut,
    InterpretRequest,
)
from app.services.ai_service import AIService

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/status", response_model=AIStatusOut)
def ai_status(db: Session = Depends(get_db)) -> AIStatusOut:
    """Report whether the layer is on, and whether it is the simulated provider."""
    return AIService(db).status()


@router.post("/interpret", response_model=InterpretationOut)
def interpret(payload: InterpretRequest, db: Session = Depends(get_db)) -> InterpretationOut:
    """Structure a problem statement into editable, reviewable suggestions."""
    return AIService(db).interpret(payload)


@router.post("/explain", response_model=ExplanationOut)
def explain(payload: ExplainRequest, db: Session = Depends(get_db)) -> ExplanationOut:
    """Describe a saved study's already-computed result in prose."""
    return AIService(db).explain(payload.study_id)
