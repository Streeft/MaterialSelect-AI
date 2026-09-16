"""Battery Designer HTTP Router (Module S / P4).

Endpoints:
- GET  /api/baterias/quimicas: List all electrochemical cell chemistries.
- GET  /api/baterias/quimicas/{slug}: Get chemistry details and guidelines.
- GET  /api/baterias/arquetipos: List application archetypes (EV, Drone, Power Tools, BESS).
- POST /api/baterias/dimensionar: Size a battery pack for a given chemistry and target requirements.
- POST /api/baterias/comparar: Size and compare all chemistries under identical requirements.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.battery import (
    ApplicationArchetypeOut,
    BatteryChemistryOut,
    BatteryComparisonRequest,
    BatteryComparisonResultOut,
    PackDesignRequest,
    PackDesignResultOut,
)
from app.services.battery_service import BatteryService

router = APIRouter(prefix="/baterias", tags=["baterias"])


@router.get("/quimicas", response_model=list[BatteryChemistryOut])
def list_chemistries(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[BatteryChemistryOut]:
    """List all available electrochemical cell chemistries in the catalog."""
    return BatteryService(db, user.id).list_chemistries()


@router.get("/quimicas/{slug}", response_model=BatteryChemistryOut)
def get_chemistry(
    slug: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BatteryChemistryOut:
    """Get technical specification and thermal safety data for a specific battery chemistry."""
    return BatteryService(db, user.id).get_chemistry(slug)


@router.get("/arquetipos", response_model=list[ApplicationArchetypeOut])
def list_archetypes(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ApplicationArchetypeOut]:
    """List application archetypes with default target voltages, energy and power."""
    return BatteryService(db, user.id).list_archetypes()


@router.post("/dimensionar", response_model=PackDesignResultOut)
def design_pack_endpoint(
    payload: PackDesignRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PackDesignResultOut:
    """Deterministically size a battery pack (Ns x Np) for a chosen chemistry."""
    return BatteryService(db, user.id).design(payload)


@router.post("/comparar", response_model=BatteryComparisonResultOut)
def compare_chemistries_endpoint(
    payload: BatteryComparisonRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BatteryComparisonResultOut:
    """Size and compare all battery chemistries under identical requirements."""
    return BatteryService(db, user.id).compare(payload)
