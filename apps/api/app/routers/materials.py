"""Material catalogue endpoints (read + write).

Domain errors raised by the service (NotFound/Validation/Conflict) are mapped to
HTTP status codes by the exception handlers registered in ``app.main``.

Every endpoint requires login (``get_current_user``) but does not scope by
project: the catalogue is shared reference data, not a project's authorial
work (see ``app.dependencies``).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.material import (
    ChartData,
    MaterialCreate,
    MaterialDetail,
    MaterialListItem,
    MaterialUpdate,
    PropertyValueIn,
)
from app.services.material_service import MaterialService

router = APIRouter(prefix="/materials", tags=["materials"])


@router.get("", response_model=list[MaterialListItem])
def list_materials(
    search: str | None = Query(
        default=None, description="Termo de busca por nome, classe ou palavra-chave"
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[MaterialListItem]:
    """List active materials, optionally filtered by a search term."""
    return MaterialService(db, user).list_materials(search)


@router.post("", response_model=MaterialDetail, status_code=status.HTTP_201_CREATED)
def create_material(
    payload: MaterialCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MaterialDetail:
    """Create a material together with its property values."""
    return MaterialService(db, user).create_material(payload)


@router.get("/chart", response_model=ChartData)
def material_chart(
    x: str = Query(description="Slug da propriedade do eixo X"),
    y: str = Query(description="Slug da propriedade do eixo Y"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChartData:
    """Return scatter data (normalised values) for two properties.

    Declared before ``/{material_id}`` so the literal path wins over the dynamic
    one.
    """
    return MaterialService(db, user).build_chart(x, y)


@router.get("/{material_id}", response_model=MaterialDetail)
def get_material(
    material_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MaterialDetail:
    """Return a material's full sheet, with properties grouped by category."""
    return MaterialService(db, user).get_material_detail(material_id)


@router.patch("/{material_id}", response_model=MaterialDetail)
def update_material(
    material_id: int,
    payload: MaterialUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MaterialDetail:
    """Apply a partial update to a material's identity fields."""
    return MaterialService(db, user).update_material(material_id, payload)


@router.put("/{material_id}/values", response_model=MaterialDetail)
def replace_values(
    material_id: int,
    values: list[PropertyValueIn],
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MaterialDetail:
    """Replace all property values of a material with the provided set."""
    return MaterialService(db, user).replace_property_values(material_id, values)


@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_material(
    material_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Soft-delete (deactivate) a material."""
    MaterialService(db, user).deactivate_material(material_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
