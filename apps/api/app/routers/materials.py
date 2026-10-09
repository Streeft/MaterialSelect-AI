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
from app.dependencies import can_edit_shared_catalog, get_current_user, get_unit_choices
from app.models.user import User
from app.schemas.curve import (
    CurveIn,
    CurveKindSpecOut,
    CurveOut,
    CurveSummaryOut,
    MaterialCurvesOut,
)
from app.schemas.material import (
    ChartData,
    CompositionReplaceIn,
    DesignationsReplaceIn,
    MaterialCreate,
    MaterialDetail,
    MaterialListItem,
    MaterialSearchOut,
    MaterialUpdate,
    PropertyValueIn,
)
from app.schemas.similarity import SimilarOut, SimilarRequest
from app.services.curve_service import CurveService
from app.services.material_service import MaterialService
from app.services.similarity_service import SimilarityService

router = APIRouter(prefix="/materials", tags=["materials"])


@router.get("", response_model=list[MaterialListItem])
def list_materials(
    search: str | None = Query(
        default=None,
        description=(
            "Consulta (D-55): nome, classe, palavra-chave ou código de designação; "
            "aceita comp:, norma: e designacao: (D-105)"
        ),
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
) -> list[MaterialListItem]:
    """List active materials, optionally filtered by a search term."""
    return MaterialService(db, user, unit_choices).list_materials(search)


@router.get("/busca", response_model=MaterialSearchOut)
def search_materials(
    q: str | None = Query(
        default=None,
        description=(
            "Consulta (D-55, D-105): termos com AND/OR/NOT, aspas, parênteses e curingas; "
            "comp:Cr>=12, comp:Ni:8-10, comp:Fe; norma:UNS; designacao:S30400"
        ),
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
) -> MaterialSearchOut:
    """The catalogue search with what it knows besides the rows.

    Same matching as ``GET /materials?search=``; this one also says, when the
    query asks about composition, which rule ran and how many materials were
    left out for lack of data. Declared before ``/{material_id}``.
    """
    return MaterialService(db, user, unit_choices).search(q)


@router.post("", response_model=MaterialDetail, status_code=status.HTTP_201_CREATED)
def create_material(
    payload: MaterialCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
    can_edit_shared: bool = Depends(can_edit_shared_catalog),
) -> MaterialDetail:
    """Create a material together with its property values."""
    return MaterialService(db, user, unit_choices, can_edit_shared).create_material(payload)


@router.get("/chart", response_model=ChartData)
def material_chart(
    x: str = Query(description="Slug da propriedade do eixo X"),
    y: str = Query(description="Slug da propriedade do eixo Y"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
) -> ChartData:
    """Return scatter data (normalised values) for two properties.

    Declared before ``/{material_id}`` so the literal path wins over the dynamic
    one.
    """
    return MaterialService(db, user, unit_choices).build_chart(x, y)


@router.get("/curvas-tipos", response_model=list[CurveKindSpecOut])
def curve_kinds(user: User = Depends(get_current_user)) -> list[CurveKindSpecOut]:
    """What each kind of curve admits (axes, parameter, units) — the form's vocabulary.

    Declared before ``/{material_id}`` so the literal path wins.
    """
    return CurveService.kind_specs()


@router.get("/{material_id}", response_model=MaterialDetail)
def get_material(
    material_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
) -> MaterialDetail:
    """Return a material's full sheet, with properties grouped by category."""
    return MaterialService(db, user, unit_choices).get_material_detail(material_id)


@router.post(
    "/{material_id}/curvas", response_model=CurveSummaryOut, status_code=status.HTTP_201_CREATED
)
def create_material_curve(
    material_id: int,
    payload: CurveIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    can_edit_shared: bool = Depends(can_edit_shared_catalog),
) -> CurveSummaryOut:
    """Write a curve by hand (TM4-d), validated by the builder the seed and importer use.

    Permission follows the material: the owner of an own record, or a curator on
    the shared catalogue (403); a record of the official catalogue is 409.
    """
    return CurveService(db, user.id, user=user, can_edit_shared=can_edit_shared).create_curve(
        material_id, payload
    )


@router.put("/{material_id}/curvas/{curve_id}", response_model=CurveSummaryOut)
def replace_material_curve(
    material_id: int,
    curve_id: int,
    payload: CurveIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    can_edit_shared: bool = Depends(can_edit_shared_catalog),
) -> CurveSummaryOut:
    """Replace a hand-written curve whole (same id); an official curve is 409."""
    return CurveService(db, user.id, user=user, can_edit_shared=can_edit_shared).replace_curve(
        material_id, curve_id, payload
    )


@router.delete("/{material_id}/curvas/{curve_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_material_curve(
    material_id: int,
    curve_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    can_edit_shared: bool = Depends(can_edit_shared_catalog),
) -> Response:
    CurveService(db, user.id, user=user, can_edit_shared=can_edit_shared).delete_curve(
        material_id, curve_id
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{material_id}/curvas", response_model=MaterialCurvesOut)
def list_material_curves(
    material_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MaterialCurvesOut:
    """The material's curves (D-106), with a count for every kind — zero included.

    A material with no curve answers 200 with ``total = 0``: "no curve
    registered" is a fact about the record, written on the sheet (D-24). A
    material this viewer may not see is 404, like its sheet (D-62).
    """
    return CurveService(db, user.id).list_curves(material_id)


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
    escala: str | None = Query(
        default=None,
        description="linear, log-x, log-y ou log-log; omitida, a convenção do tipo de curva.",
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CurveOut:
    """One curve, ready to draw: points, band and domain in the reading units.

    A unit outside the axis's list, or a log scale on an axis that cannot be
    logarithmic, is a 400 that names what is admitted — never ignored.
    """
    return CurveService(db, user.id).get_curve(
        material_id, curve_id, x_unit=unidade_x, y_unit=unidade_y, scale=escala
    )


@router.post("/{material_id}/similares", response_model=SimilarOut)
def similar_materials(
    material_id: int,
    payload: SimilarRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
) -> SimilarOut:
    """Rank the catalogue by distance from this material (P2).

    A POST because the basis is a body, not an identity: "similar in these five
    respects" is a different question from "similar in these two", and putting a
    list of slugs in a query string would make the two share a cache entry.
    """
    return SimilarityService(db, user.id).similar_to(material_id, payload)


@router.patch("/{material_id}", response_model=MaterialDetail)
def update_material(
    material_id: int,
    payload: MaterialUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
    can_edit_shared: bool = Depends(can_edit_shared_catalog),
) -> MaterialDetail:
    """Apply a partial update to a material's identity fields."""
    return MaterialService(db, user, unit_choices, can_edit_shared).update_material(
        material_id, payload
    )


@router.put("/{material_id}/values", response_model=MaterialDetail)
def replace_values(
    material_id: int,
    values: list[PropertyValueIn],
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
    can_edit_shared: bool = Depends(can_edit_shared_catalog),
) -> MaterialDetail:
    """Replace all property values of a material with the provided set."""
    return MaterialService(db, user, unit_choices, can_edit_shared).replace_property_values(
        material_id, values
    )


@router.put("/{material_id}/composicao", response_model=MaterialDetail)
def replace_composition(
    material_id: int,
    payload: CompositionReplaceIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
    can_edit_shared: bool = Depends(can_edit_shared_catalog),
) -> MaterialDetail:
    """Replace the composition (TM2-a, D-105): owner of an own record, or a curator.

    The service refuses the shared catalogue to a non-curator (403), a record
    from the official catalogue (409) and any row the composition rules reject
    (400). The balance is declared, never computed.
    """
    return MaterialService(db, user, unit_choices, can_edit_shared).replace_composition(
        material_id, payload
    )


@router.put("/{material_id}/designacoes", response_model=MaterialDetail)
def replace_designations(
    material_id: int,
    payload: DesignationsReplaceIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
    can_edit_shared: bool = Depends(can_edit_shared_catalog),
) -> MaterialDetail:
    """Replace the designations (TM2-a, D-105); same permission rule as the composition."""
    return MaterialService(db, user, unit_choices, can_edit_shared).replace_designations(
        material_id, payload
    )


@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_material(
    material_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
    can_edit_shared: bool = Depends(can_edit_shared_catalog),
) -> Response:
    """Soft-delete (deactivate) a material."""
    MaterialService(db, user, unit_choices, can_edit_shared).deactivate_material(material_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
