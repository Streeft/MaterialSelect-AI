"""Releases of the official catalogue and what changed between them (D-108, TM7).

Thin and read-only: every route reads, none writes, so there is no curator
guard to forget (D-83). The router sits behind the same product gate as the
materials router (login, plus subscription outside open mode). Everything the
screen prints — the classification, the counts, the numbers in the reading
unit — is computed by ``CatalogReleaseService`` and ``app/domain/release_diff``.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user, get_unit_choices
from app.models.user import User
from app.schemas.catalog_release import CatalogReleaseOut, DiffItemOut, ReleaseDiffOut
from app.services.catalog_release_service import DEFAULT_PAGE_SIZE, CatalogReleaseService

router = APIRouter(prefix="/catalogo", tags=["catalogo"])


@router.get("/releases", response_model=list[CatalogReleaseOut])
def list_releases(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> list[CatalogReleaseOut]:
    """Every release of the official catalogue, grouped by lineage, in import order."""
    return CatalogReleaseService(db).list_releases()


@router.get("/releases/{base}/diff/{target}", response_model=ReleaseDiffOut)
def release_diff(
    base: str,
    target: str,
    tipo: str | None = Query(
        default=None, description="Filtro: novo, alterado, desativado ou inalterado."
    ),
    classe: str | None = Query(default=None, description="Filtro: slug da classe de material."),
    pagina: int = Query(default=1, description="Página, a partir de 1."),
    por_pagina: int = Query(default=DEFAULT_PAGE_SIZE, description="Registros por página (1–200)."),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
) -> ReleaseDiffOut:
    """What changed from release ``base`` to release ``target`` of one catalogue."""
    return CatalogReleaseService(db, unit_choices).diff(
        base, target, tipo=tipo, classe=classe, page=pagina, page_size=por_pagina
    )


@router.get("/releases/{base}/diff/{target}/registro", response_model=DiffItemOut)
def release_diff_record(
    base: str,
    target: str,
    tabela: str | None = Query(default=None, description="Tabela externa do registro."),
    external_id: str | None = Query(
        default=None, alias="id", description="Id externo do registro na fonte."
    ),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
) -> DiffItemOut:
    """One record of the diff, addressed by its external identity (never by name)."""
    return CatalogReleaseService(db, unit_choices).record(base, target, tabela, external_id)
