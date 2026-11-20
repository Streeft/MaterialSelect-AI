"""The tray (D-258): what the reader is carrying to the bench."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.tray import TrayItemPatch, TrayItemsIn, TrayOut
from app.services.tray_service import TrayService

router = APIRouter(prefix="/tray", tags=["tray"])


def _service(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> TrayService:
    return TrayService(db, user.id)


@router.get("", response_model=TrayOut)
def get_tray(service: TrayService = Depends(_service)) -> TrayOut:
    return service.tray()


@router.put("/items", response_model=TrayOut)
def put_items(payload: TrayItemsIn, service: TrayService = Depends(_service)) -> TrayOut:
    """Puts one or several things in the tray; one already there stays where it is."""
    return service.put(payload)


@router.patch("/items/{item_id}", response_model=TrayOut)
def update_item(
    item_id: int, patch: TrayItemPatch, service: TrayService = Depends(_service)
) -> TrayOut:
    return service.update(item_id, patch)


@router.delete("/items/{item_id}", response_model=TrayOut)
def remove_item(item_id: int, service: TrayService = Depends(_service)) -> TrayOut:
    return service.remove(item_id)


@router.delete("", response_model=TrayOut)
def clear_tray(service: TrayService = Depends(_service)) -> TrayOut:
    return service.clear()
