"""Starting numbers of the calculators (thin HTTP layer, D-216).

``GET /api/padroes`` is the single answer to "what does the screen start with?"
for cost, eco, battery and solver. The content is the same for everyone, but
it is a product route like the calculators it prefills: signed in, subscribed.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.defaults import DefaultsOut
from app.services.defaults_service import DefaultsService

router = APIRouter(prefix="/padroes", tags=["padroes"])


@router.get("", response_model=DefaultsOut)
def get_defaults(_user: User = Depends(get_current_user)) -> DefaultsOut:
    """The premises each calculator opens with — inputs, not facts about materials."""
    return DefaultsService().get()
