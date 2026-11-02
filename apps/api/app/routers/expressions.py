"""The expression calculator (D-191): palette and description (thin HTTP layer).

Login is required, like every catalogue read. Neither endpoint evaluates an
index over materials; that stays on ``/selection/index`` and the chart and
comparison endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.expression import (
    ExpressionDescribeIn,
    ExpressionDescribeOut,
    ExpressionPaletteOut,
    ExpressionUniverse,
)
from app.services.expression_service import ExpressionService

router = APIRouter(prefix="/expressions", tags=["expressions"])


@router.get("/palette", response_model=ExpressionPaletteOut)
def expression_palette(
    universe: ExpressionUniverse = Query(default="material"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ExpressionPaletteOut:
    """Properties, functions and constants an expression may use."""
    return ExpressionService(db, user).palette(universe)


@router.post("/describe", response_model=ExpressionDescribeOut)
def describe_expression(
    payload: ExpressionDescribeIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ExpressionDescribeOut:
    """Friendly LaTeX, label, dimension, unit and errors (200 even when refused)."""
    return ExpressionService(db, user).describe(payload.expression, payload.universe)
