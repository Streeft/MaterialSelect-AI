"""Synthesizer (camada HTTP fina).

``GET /api/sintetizar/tipos`` é o catálogo de leis: para cada tipo de síntese,
qual regra roda em cada propriedade e **quais propriedades ele declaradamente
não calcula**, com o motivo. ``POST /api/sintetizar/previa`` roda a receita sem
gravar; ``POST /api/sintetizar`` roda e grava.

A prévia existe porque quem sintetiza precisa ver as leis e as ausências antes
de decidir se aquilo é o material que queria — gravar primeiro e explicar depois
encheria o espaço do usuário de hipóteses que ele não leu.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.synthesis import (
    KindOut,
    SynthesisPreview,
    SynthesisRequest,
    SynthesisResultOut,
)
from app.services.synthesis_service import SynthesisService

router = APIRouter(prefix="/sintetizar", tags=["sintetizar"])


@router.get("/tipos", response_model=list[KindOut])
def list_kinds(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[KindOut]:
    """As leis de cada tipo de síntese, e o que cada um não calcula."""
    return SynthesisService(db, user).list_kinds()


@router.post("/previa", response_model=SynthesisPreview)
def preview(
    payload: SynthesisRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SynthesisPreview:
    """O que a receita produziria, sem gravar nada."""
    return SynthesisService(db, user).preview(payload)


@router.post("", response_model=SynthesisResultOut, status_code=201)
def create(
    payload: SynthesisRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SynthesisResultOut:
    """Grava um registro derivado, que é sempre de quem o criou."""
    return SynthesisService(db, user).create(payload)
