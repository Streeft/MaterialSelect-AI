"""Import wizard endpoints (thin HTTP layer over ImportService).

Requires login but not project scoping — imported materials join the shared
catalogue, not a project (see ``app.dependencies``).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.db.base import get_db
from app.dependencies import get_current_user
from app.domain.errors import ValidationError
from app.importers.service import ImportService
from app.models.user import User
from app.schemas.imports import (
    CommitResult,
    ImportJobOut,
    ImportMapping,
    TemplateIn,
    TemplateOut,
    UploadResult,
    ValidationReport,
)

router = APIRouter(prefix="/imports", tags=["imports"])
templates_router = APIRouter(prefix="/import-templates", tags=["imports"])


@router.post("/upload", response_model=UploadResult)
async def upload_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UploadResult:
    """Receive a CSV/XLSX file and open an import job.

    This is the only ``async`` endpoint in the application — it has to be, to
    ``await`` the upload stream — and that makes it the only one that can stall
    everyone else. ``ImportService.upload`` parses the workbook and writes to the
    database, seconds of blocking work for a large XLSX; run inline it would hold
    the event loop and freeze *every* request in the process, not just this one.
    ``run_in_threadpool`` puts it exactly where FastAPI already runs every other
    (synchronous) endpoint of this router.
    """
    # Read at most limit+1 bytes: enough to detect an oversized file without
    # ever buffering an arbitrarily large upload in memory.
    data = await file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        limit_mb = settings.max_upload_bytes / (1024 * 1024)
        raise ValidationError(f"Arquivo excede o limite de {limit_mb:.0f} MB.")
    return await run_in_threadpool(ImportService(db).upload, file.filename or "arquivo", data)


class PreviewRequest(BaseModel):
    sheet_name: str | None = None


@router.post("/{job_id}/preview", response_model=UploadResult)
def preview(
    job_id: int,
    payload: PreviewRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UploadResult:
    """Switch sheet (XLSX) and re-read headers + sample."""
    return ImportService(db).preview_sheet(job_id, payload.sheet_name)


class ValidateRequest(BaseModel):
    mapping: ImportMapping
    sheet_name: str | None = None


@router.post("/{job_id}/validate", response_model=ValidationReport)
def validate(
    job_id: int,
    payload: ValidateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ValidationReport:
    """Dry-run the mapping and return the per-row report (writes nothing)."""
    return ImportService(db).validate(job_id, payload.mapping, payload.sheet_name)


@router.post("/{job_id}/commit", response_model=CommitResult)
def commit(
    job_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> CommitResult:
    """Import every valid row in one transaction."""
    return ImportService(db).commit(job_id)


@router.post("/{job_id}/cancel", response_model=ImportJobOut)
def cancel(
    job_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ImportJobOut:
    return ImportService(db).cancel(job_id)


@router.post("/{job_id}/rollback", response_model=ImportJobOut)
def rollback(
    job_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ImportJobOut:
    """Logically roll back a committed import (removes its materials)."""
    return ImportService(db).rollback(job_id)


@router.get("", response_model=list[ImportJobOut])
def list_jobs(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[ImportJobOut]:
    return ImportService(db).list_jobs()


@router.get("/{job_id}/report", response_model=ValidationReport)
def get_report(
    job_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ValidationReport:
    return ImportService(db).get_report(job_id)


@templates_router.get("", response_model=list[TemplateOut])
def list_templates(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[TemplateOut]:
    return ImportService(db).list_templates()


@templates_router.post("", response_model=TemplateOut, status_code=201)
def create_template(
    payload: TemplateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TemplateOut:
    return ImportService(db).create_template(payload)
