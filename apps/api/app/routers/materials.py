"""Material catalogue endpoints."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.schemas.material import ChartData, MaterialDetail, MaterialListItem
from app.services.material_service import MaterialNotFoundError, MaterialService

router = APIRouter(prefix="/materials", tags=["materials"])


@router.get("", response_model=list[MaterialListItem])
def list_materials(
    search: Optional[str] = Query(default=None, description="Termo de busca por nome, classe ou palavra-chave"),
    db: Session = Depends(get_db),
) -> list[MaterialListItem]:
    """List active materials, optionally filtered by a search term."""
    return MaterialService(db).list_materials(search)


@router.get("/chart", response_model=ChartData)
def material_chart(
    x: str = Query(description="Slug da propriedade do eixo X"),
    y: str = Query(description="Slug da propriedade do eixo Y"),
    db: Session = Depends(get_db),
) -> ChartData:
    """Return scatter data (normalised values) for two properties.

    Declared before ``/{material_id}`` so the literal path wins over the dynamic
    one.
    """
    try:
        return MaterialService(db).build_chart(x, y)
    except MaterialNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Propriedade não encontrada: {exc}") from exc


@router.get("/{material_id}", response_model=MaterialDetail)
def get_material(material_id: int, db: Session = Depends(get_db)) -> MaterialDetail:
    """Return a material's full sheet, with properties grouped by category."""
    try:
        return MaterialService(db).get_material_detail(material_id)
    except MaterialNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Material não encontrado: {exc}") from exc
