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

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user
from app.domain.errors import ValidationError
from app.models.user import User
from app.routers.exports import SUPPORTED_FORMATS, _file_response
from app.schemas.eco import (
    EcoAuditRequest,
    EcoAuditResultOut,
    EcoComparisonRequest,
    EcoComparisonResultOut,
    EndOfLifeRouteOut,
    TransportModeOut,
)
from app.services.eco_service import EcoService
from app.services.export_service import ExportService

router = APIRouter(prefix="/eco", tags=["eco"])


@router.get("/modais", response_model=list[TransportModeOut])
def list_transport_modes(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TransportModeOut]:
    """The transport catalogue, in reading order — which is not a ranking."""
    return EcoService(db, user.id).list_transport_modes()


@router.get("/rotas-fim-de-vida", response_model=list[EndOfLifeRouteOut])
def list_end_of_life_routes(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[EndOfLifeRouteOut]:
    """The seven end-of-life routes and how many visible materials can price each."""
    return EcoService(db, user.id).list_end_of_life_routes()


@router.post("/auditar", response_model=EcoAuditResultOut)
def run_eco_audit(
    payload: EcoAuditRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EcoAuditResultOut:
    """Audit a product (components × legs) over its five phases (D-121)."""
    return EcoService(db, user.id).run(payload)


@router.post("/comparar", response_model=EcoComparisonResultOut)
def compare_eco_audits(
    payload: EcoComparisonRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EcoComparisonResultOut:
    """Compare two eco-audit alternatives side-by-side."""
    return EcoService(db, user.id).compare(payload)


@router.post("/exportar.{fmt}")
def export_eco_audit(
    fmt: str,
    payload: EcoAuditRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """The audit of a brief as CSV, XLSX, HTML, DOCX or PPTX (D-172).

    A POST because the brief is a body, like ``/auditar``. The audit is re-run
    server-side, so the file always carries the figures the screen shows; the
    response is built by the same ``_file_response`` as every other export, so
    the escape (per format), the CSP on HTML and the filename rules are shared.
    """
    if fmt not in SUPPORTED_FORMATS:
        raise ValidationError(
            f"Formato de exportação não suportado: '{fmt}'. Use {', '.join(SUPPORTED_FORMATS)}."
        )
    return _file_response(ExportService(db, user).eco_report(payload), fmt)
