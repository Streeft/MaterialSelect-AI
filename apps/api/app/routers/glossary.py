"""Glossário de propriedades (D-130): verbetes conceituais, com fonte e licença.

Mesma regra de acesso da lista de propriedades: login e assinatura ativa.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.glossary import GlossaryEntryOut
from app.services.glossary_service import GlossaryService

router = APIRouter(prefix="/glossario", tags=["glossary"])


@router.get("", response_model=list[GlossaryEntryOut])
def list_glossary(user: User = Depends(get_current_user)) -> list[GlossaryEntryOut]:
    """Todos os verbetes do glossário, por slug."""
    return GlossaryService().list_entries()


@router.get("/{slug}", response_model=GlossaryEntryOut)
def get_glossary_entry(slug: str, user: User = Depends(get_current_user)) -> GlossaryEntryOut:
    """Um verbete; 404 escrito quando a propriedade não tem verbete."""
    return GlossaryService().get_entry(slug)
