"""Knowledge-base ingestion: read Cérebro/, catalogue, extract, index.

A rare, slow, operator-run action — never triggered by a client request. Same
authorization as any other logged-in route (no administrator role exists in
this project, D-42); the rarity of use is what makes a synchronous, possibly
multi-minute call acceptable here, unlike ``imports`` upload.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user
from app.knowledge.service import KnowledgeService
from app.models.user import User
from app.schemas.knowledge import IngestReportOut

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.post("/ingest", response_model=IngestReportOut)
def ingest(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> IngestReportOut:
    """Re-run ingestion over the configured knowledge root."""
    report = KnowledgeService(db).ingest()
    db.commit()
    return IngestReportOut(
        root=report.root,
        created=report.created,
        updated=report.updated,
        unchanged=report.unchanged,
        failed=report.failed,
        skipped=report.skipped,
        total_chunks=report.total_chunks,
        embedded_chunks=report.embedded_chunks,
        embeddings_skipped_reason=report.embeddings_skipped_reason,
        failures=[f"{o.path}: {o.detail}" for o in report.outcomes if o.action == "falhou"],
    )
