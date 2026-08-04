"""Visualisation endpoints: property maps and material comparison.

Thin HTTP layer — every decision lives in :class:`app.services.chart_service`.
Both routes are POST because their inputs are structured (axis pair, class
filter, material sets, index expression and levels) and would not survive a
query string legibly.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.schemas.charts import CompareOut, CompareRequest, PropertyMapOut, PropertyMapRequest
from app.services.chart_service import ChartService

router = APIRouter(prefix="/charts", tags=["charts"])


@router.post("/property-map", response_model=PropertyMapOut)
def property_map(payload: PropertyMapRequest, db: Session = Depends(get_db)) -> PropertyMapOut:
    """Build an Ashby property map: points, envelopes, index line and exclusions."""
    return ChartService(db).property_map(payload)


@router.post("/compare", response_model=CompareOut)
def compare(payload: CompareRequest, db: Session = Depends(get_db)) -> CompareOut:
    """Build the comparison matrix backing the table, bars, radar and heatmap."""
    return ChartService(db).compare(payload)
