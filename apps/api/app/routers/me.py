"""What belongs to the signed-in person (D-249): today, how they want the app to look.

``/api/me/appearance`` keeps the colour, contrast, motion and rail choices on the account, so
they follow the person to the next device. Both routes are the caller's own and only need a login:
they are not behind the subscription gate, because how a lapsed account sees the paywall page is
also its owner's choice. Nothing here takes an id.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.appearance import AppearanceIn, AppearanceOut
from app.services.appearance_service import AppearanceService

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/appearance", response_model=AppearanceOut)
def get_appearance(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> AppearanceOut:
    """The saved choice, or the defaults with ``saved: false`` when none was ever saved."""
    return AppearanceService(db, user.id).get()


@router.put("/appearance", response_model=AppearanceOut)
def put_appearance(
    payload: AppearanceIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AppearanceOut:
    """Replace the whole choice (colour, contrast, motion, rail) on the account."""
    return AppearanceService(db, user.id).put(payload)
