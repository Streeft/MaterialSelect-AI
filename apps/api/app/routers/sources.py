"""Source registry endpoint (M1): procedência and licença of every base
incorporated into the catalogue.

Requires login but not project scoping — sources are shared reference data,
same as the catalogue they back (see ``app.dependencies``).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.repositories.material_repository import MaterialRepository
from app.schemas.sources import SourceOut

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("", response_model=list[SourceOut])
def list_sources(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[SourceOut]:
    """List every registered source, with its license and reviewer."""
    sources = MaterialRepository(db).list_sources()
    return [
        SourceOut(
            id=s.id,
            label=s.label,
            reference=s.reference,
            is_demo=s.is_demo,
            license_label=s.license_label,
            license_url=s.license_url,
            contains_third_party_data=s.contains_third_party_data,
            reviewed_by_email=s.reviewed_by.email if s.reviewed_by else None,
            reviewed_at=s.reviewed_at,
        )
        for s in sources
    ]
