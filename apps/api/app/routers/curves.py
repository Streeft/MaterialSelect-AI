"""One material curve, ready to draw (D-106, TM4; reading of the parameter, TM4-e).

Same path as the list in ``materials.py`` and registered **before** it in
``app.main``, so this handler is the one that answers ``GET
/materials/{id}/curvas/{curve_id}``: it adds ``unidade_parametro`` to the
reader's choices. HTTP stays thin — the service converts (``units.py``) and lays
the points out.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.curve import CurveOut, CurveValueOut
from app.services.curve_service import CurveService

router = APIRouter(prefix="/materials", tags=["materials"])


@router.get("/{material_id}/curvas/{curve_id}", response_model=CurveOut)
def get_material_curve(
    material_id: int,
    curve_id: int,
    unidade_x: str | None = Query(
        default=None, description="Unidade de leitura do eixo x (D-70); omitida, a convenção."
    ),
    unidade_y: str | None = Query(
        default=None, description="Unidade de leitura do eixo y (D-70); omitida, a convenção."
    ),
    unidade_parametro: str | None = Query(
        default=None,
        description=(
            "Unidade de leitura do parâmetro da família (TM4-e); omitida, a convenção da "
            "grandeza. Recusada numa curva sem família."
        ),
    ),
    escala: str | None = Query(
        default=None,
        description="linear, log-x, log-y ou log-log; omitida, a convenção do tipo de curva.",
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CurveOut:
    """One curve, ready to draw: points, band and domain in the reading units.

    A unit outside the quantity's list, or a log scale on an axis that cannot be
    logarithmic, is a 400 that names what is admitted — never ignored.
    """
    return CurveService(db, user.id).get_curve(
        material_id,
        curve_id,
        x_unit=unidade_x,
        y_unit=unidade_y,
        scale=escala,
        parameter_unit=unidade_parametro,
    )


@router.get("/{material_id}/curvas/{curve_id}/valor", response_model=CurveValueOut)
def get_material_curve_value(
    material_id: int,
    curve_id: int,
    em: float = Query(description="Valor de x em que se quer ler a curva (ex.: 20)."),
    unidade_em: str = Query(description="Unidade de `em` (ex.: degC); sem ela não há leitura."),
    unidade_y: str | None = Query(default=None, description="Unidade de leitura do eixo y."),
    unidade_parametro: str | None = Query(default=None, description="Unidade do parâmetro."),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CurveValueOut:
    """The curve at a declared x (TM4-b, D-110): the declared point, or its absence.

    Never interpolated or extrapolated: a series without a point at exactly that
    x answers ``found = false`` with the absence written.
    """
    return CurveService(db, user.id).read_value(
        material_id,
        curve_id,
        at=em,
        at_unit=unidade_em,
        y_unit=unidade_y,
        parameter_unit=unidade_parametro,
    )
