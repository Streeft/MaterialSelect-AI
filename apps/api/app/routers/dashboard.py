"""Catalogue panel endpoints.

Thin HTTP layer — every decision lives in :class:`app.services.dashboard_service`.

Both routes are ``GET``, unlike the chart endpoints next door: their inputs are a
slug at most, they change nothing, and a panel that can be linked to and cached
is worth more than symmetry with a neighbouring router.

Requires login but not project scoping — the catalogue is shared reference
data (see ``app.dependencies``).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Path
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.dashboard import DistributionOut, OverviewOut
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/overview", response_model=OverviewOut)
def overview(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> OverviewOut:
    """Totals, provenance mix and coverage per class and per property."""
    return DashboardService(db).overview()


@router.get("/distribution/{property_slug}", response_model=DistributionOut)
def distribution(
    property_slug: str = Path(min_length=1, max_length=160, description="Slug da propriedade"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DistributionOut:
    """The five-number summary of one property, per material class."""
    return DashboardService(db).distribution(property_slug)
