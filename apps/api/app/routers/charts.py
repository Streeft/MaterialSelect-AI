"""Visualisation endpoints: property maps and material comparison.

Thin HTTP layer — every decision lives in :class:`app.services.chart_service`.
Both routes are POST because their inputs are structured (axis pair, class
filter, material sets, index expression and levels) and would not survive a
query string legibly.

Requires login but not project scoping — the catalogue is shared reference
data (see ``app.dependencies``).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user, get_unit_choices
from app.models.user import User
from app.schemas.charts import (
    CompareOut,
    CompareRequest,
    IndexLineOut,
    IndexLineRequest,
    MapBoxOut,
    MapBoxRequest,
    MapPresetOut,
    PropertyMapOut,
    PropertyMapRequest,
)
from app.services.chart_service import ChartService

router = APIRouter(prefix="/charts", tags=["charts"])


@router.post("/property-map", response_model=PropertyMapOut)
def property_map(
    payload: PropertyMapRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
) -> PropertyMapOut:
    """Build an Ashby property map: points, envelopes, index line and exclusions."""
    return ChartService(db, user.id, unit_choices).property_map(payload)


@router.post("/map-box", response_model=MapBoxOut)
def map_box(
    payload: MapBoxRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
) -> MapBoxOut:
    """Convert a Chart Stage region between map reading units and canonical units (D-81)."""
    return ChartService(db, user.id, unit_choices).map_box(payload)


@router.get("/presets", response_model=list[MapPresetOut])
def map_presets(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[MapPresetOut]:
    """The classic Ashby charts (axes, scale, index) and whether this catalogue can draw each."""
    return ChartService(db, user.id).map_presets()


@router.post("/index-line", response_model=IndexLineOut)
def move_index_line(
    payload: IndexLineRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
) -> IndexLineOut:
    """Place an iso-index line at a level or through a map point; split the map by it (D-211)."""
    return ChartService(db, user.id, unit_choices).index_line(payload)


@router.post("/compare", response_model=CompareOut)
def compare(
    payload: CompareRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
) -> CompareOut:
    """Build the comparison matrix backing the table, bars, radar and heatmap."""
    return ChartService(db, user.id, unit_choices).compare(payload)
