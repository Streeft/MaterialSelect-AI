"""Catalogue panel endpoints.

Thin HTTP layer — every decision lives in :class:`app.services.dashboard_service`.

Every route is ``GET``, unlike the chart endpoints next door: their inputs are a
slug and a few filters at most, they change nothing, and a panel that can be
linked to and cached is worth more than symmetry with a neighbouring router.

Requires login but not project scoping — the catalogue is shared reference
data (see ``app.dependencies``). ``/activity`` is the exception that proves the
rule: it reads only the caller's own rows.

The four global filters (D-193) — ``classe``, ``subclasse``, ``nivel``,
``demo`` — are accepted by every catalogue route and echoed back in
``filters``.
"""

from __future__ import annotations

from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user, get_unit_choices
from app.domain.dashboard_filters import DashboardFilters
from app.domain.depth_profile import DepthLevel
from app.exporters.spreadsheet import to_csv
from app.models.user import User
from app.schemas.dashboard import (
    ActivityOut,
    CompositionOut,
    CorrelationOut,
    DistributionOut,
    OverviewOut,
    ProcessPanelOut,
    PropertyStatsOut,
    SourcesOut,
    TopOut,
)
from app.services.dashboard_service import TOP_DEFAULT, TOP_MAX, DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def get_filters(
    classe: str | None = Query(default=None, max_length=120, description="Slug da classe"),
    subclasse: str | None = Query(default=None, max_length=200, description="Subclasse exata"),
    nivel: int = Query(default=3, ge=1, le=3, description="Nível de profundidade (D-127)"),
    demo: Literal["todos", "demo", "reais"] = Query(default="todos"),
) -> DashboardFilters:
    """The panel's global filters, read from the URL so a view can be linked."""
    return DashboardFilters(
        class_slug=classe or None,
        subclass=subclasse or None,
        level=DepthLevel(nivel),
        demo=demo,
    )


@router.get("/overview", response_model=OverviewOut)
def overview(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    filters: DashboardFilters = Depends(get_filters),
) -> OverviewOut:
    """Totals, provenance mix and coverage per class and per property.

    Sem escolha de unidade de leitura de propósito (D-70): o panorama conta
    registros e percentuais de cobertura, e nenhum dos seus números está numa
    unidade de propriedade. Aceitar o parâmetro aqui sugeriria que ele muda algo.
    """
    return DashboardService(db, user.id, filters=filters).overview()


@router.get("/distribution/{property_slug}", response_model=DistributionOut)
def distribution(
    property_slug: str = Path(min_length=1, max_length=160, description="Slug da propriedade"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
    filters: DashboardFilters = Depends(get_filters),
) -> DistributionOut:
    """The five-number summary of one property, per material class."""
    return DashboardService(db, user.id, unit_choices, filters).distribution(property_slug)


@router.get("/composition", response_model=CompositionOut)
def composition(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    filters: DashboardFilters = Depends(get_filters),
) -> CompositionOut:
    """Materials per class and subclass, with the treemap laid out (ADR 0004)."""
    return DashboardService(db, user.id, filters=filters).composition()


@router.get("/processes", response_model=ProcessPanelOut)
def processes(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    filters: DashboardFilters = Depends(get_filters),
) -> ProcessPanelOut:
    """Processes per family and materials per process."""
    return DashboardService(db, user.id, filters=filters).processes()


@router.get("/sources", response_model=SourcesOut)
def sources(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    filters: DashboardFilters = Depends(get_filters),
) -> SourcesOut:
    """Provenance (medido/importado/estimado/ausente) per source."""
    return DashboardService(db, user.id, filters=filters).sources()


@router.get("/property/{property_slug}", response_model=PropertyStatsOut)
def property_stats(
    property_slug: str = Path(min_length=1, max_length=160),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
    filters: DashboardFilters = Depends(get_filters),
) -> PropertyStatsOut:
    """Histogram, summary statistics and gaps of one property."""
    return DashboardService(db, user.id, unit_choices, filters).property_stats(property_slug)


@router.get("/top", response_model=TopOut)
def top(
    propriedade: str | None = Query(default=None, max_length=160),
    indice: str | None = Query(default=None, max_length=160),
    n: int = Query(default=TOP_DEFAULT, ge=1, le=TOP_MAX),
    ordem: Literal["melhor", "pior"] = Query(default="melhor"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
    filters: DashboardFilters = Depends(get_filters),
) -> TopOut:
    """The N best or worst materials by a property or a performance index."""
    return DashboardService(db, user.id, unit_choices, filters).top(
        property_slug=propriedade, index_slug=indice, n=n, order=ordem
    )


@router.get("/correlation", response_model=CorrelationOut)
def correlation(
    propriedades: str | None = Query(
        default=None,
        max_length=4000,
        description="Slugs separados por vírgula; omitido, as mais preenchidas do nível",
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    filters: DashboardFilters = Depends(get_filters),
) -> CorrelationOut:
    """Spearman correlation matrix between properties (computed here, ADR 0004)."""
    slugs = [s.strip() for s in (propriedades or "").split(",") if s.strip()]
    return DashboardService(db, user.id, filters=filters).correlation(slugs or None)


@router.get("/activity", response_model=ActivityOut)
def activity(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> ActivityOut:
    """The caller's own studies, saved charts, audit trail and AI use."""
    return DashboardService(db, user.id).activity(user.id)


@router.get("/export.csv")
def export_csv(
    secao: Literal["visao", "propriedades", "processos", "qualidade", "atividade"] = Query(
        default="visao"
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    filters: DashboardFilters = Depends(get_filters),
) -> Response:
    """The tables of one tab as CSV, every cell escaped (``app.exporters.cells``)."""
    report = DashboardService(db, user.id, filters=filters).export_report(secao, user.id)
    filename = f"painel-{secao}.csv"
    return Response(
        content=to_csv(report),
        media_type="text/csv; charset=utf-8",
        headers={
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": (
                f'attachment; filename="{filename}"; '
                f"filename*=UTF-8''{quote(filename, safe='')}"
            ),
        },
    )
