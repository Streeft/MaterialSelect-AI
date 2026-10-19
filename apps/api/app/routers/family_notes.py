"""Notas de família de materiais (D-151): texto conceitual, com licença e revisão.

Mesma regra de acesso da lista de classes e do glossário: login e assinatura ativa.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.family_notes import FamilyNoteOut
from app.services.family_note_service import FamilyNoteService

router = APIRouter(prefix="/familias/notas", tags=["family-notes"])


@router.get("", response_model=list[FamilyNoteOut])
def list_family_notes(user: User = Depends(get_current_user)) -> list[FamilyNoteOut]:
    """Todas as notas de família, por slug."""
    return FamilyNoteService().list_notes()


@router.get("/{slug}", response_model=FamilyNoteOut)
def get_family_note(slug: str, user: User = Depends(get_current_user)) -> FamilyNoteOut:
    """Uma nota; 404 escrito quando a família não tem nota."""
    return FamilyNoteService().get_note(slug)
