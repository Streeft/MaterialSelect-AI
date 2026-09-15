"""Part Cost Estimator (thin HTTP layer).

``POST /api/custo/estimar`` prices one part across every process that can make
it. A POST like the solver's, and for the same reason: the brief is a body of
design and shop numbers, and putting them in a query string would make two
different questions share a cache entry.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.part_cost import CostRequest, CostResultOut
from app.services.part_cost_service import PartCostService

router = APIRouter(prefix="/custo", tags=["custo"])


@router.post("/estimar", response_model=CostResultOut)
def estimate_part_cost(
    payload: CostRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CostResultOut:
    """Cost one part, term by term, for each compatible process."""
    return PartCostService(db, user.id).estimate(payload)
