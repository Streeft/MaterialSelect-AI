"""``GET /api/search``: the palette's light search (D-207).

Thin on purpose: the reader, their project and the two query parameters go to
``SearchService``; ranking lives in ``app.domain.quick_search``.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_project, get_current_user
from app.models.project import Project
from app.models.user import User
from app.schemas.search import SearchOut
from app.services.search_service import SearchService

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=SearchOut)
def quick_search(
    q: str = Query(default="", max_length=200, description="Termo digitado na paleta"),
    limit: int = Query(default=8, ge=1, le=50, description="Máximo de resultados por tipo"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    project: Project = Depends(get_current_project),
) -> SearchOut:
    """Materials, processes, notebooks and studies whose name matches ``q``, best first."""
    return SearchService(db, user.id, project.id).search(q, limit)
