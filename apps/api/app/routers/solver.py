"""Engineering Solver and Performance Index Finder (thin HTTP layer).

``GET /api/solver/casos`` is the Finder: the catalogue of load cases, each
carrying its function, constraint, objective and the index the derivation
yields. ``POST /api/solver/resolver`` is the Solver: one case plus the design
numbers, answered with a mass per material.

Both depend on ``get_current_user`` like every other read surface, so a
person's own records take part in their own brief and nobody else's appear
(P1-4).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.solver import LoadCaseOut, SolveRequest, SolveResultOut
from app.services.solver_service import SolverService

router = APIRouter(prefix="/solver", tags=["solver"])


@router.get("/casos", response_model=list[LoadCaseOut])
def list_cases(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[LoadCaseOut]:
    """The load-case catalogue: função → restrição → objetivo → índice."""
    return SolverService(db, user.id).list_cases()


@router.get("/casos/{key}", response_model=LoadCaseOut)
def get_case(
    key: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LoadCaseOut:
    return SolverService(db, user.id).get_case(key)


@router.post("/resolver", response_model=SolveResultOut)
def solve_brief(
    payload: SolveRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SolveResultOut:
    """Dimension every visible material against one design brief."""
    return SolverService(db, user.id).solve(payload)
