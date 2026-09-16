"""Eco Audit (thin HTTP layer).

``GET /api/eco/modais`` is the transport catalogue — four rows, each saying what
it is and is not known to cost. ``POST /api/eco/auditar`` runs one audit: a POST
like the solver's and the estimator's, and for the same reason, since the brief
is a body of design numbers that a query string would collapse into one cache
entry for two different questions.

Both depend on ``get_current_user`` like every other read surface, so a person's
own records take part in their own audit and nobody else's appear (P1-4).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.eco import EcoAuditRequest, EcoAuditResultOut, TransportModeOut
from app.services.eco_service import EcoService

router = APIRouter(prefix="/eco", tags=["eco"])


@router.get("/modais", response_model=list[TransportModeOut])
def list_transport_modes(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TransportModeOut]:
    """The transport catalogue, in reading order — which is not a ranking."""
    return EcoService(db, user.id).list_transport_modes()


@router.post("/auditar", response_model=EcoAuditResultOut)
def run_eco_audit(
    payload: EcoAuditRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EcoAuditResultOut:
    """Audit one part over material, manufatura, transporte, uso e fim de vida."""
    return EcoService(db, user.id).run(payload)
