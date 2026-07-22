"""Import wizard endpoints (thin HTTP layer over ImportService)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.db.base import get_db
from app.domain.errors import ValidationError
from app.importers.service import ImportService
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
    file: UploadFile = File(...), db: Session = Depends(get_db)
) -> UploadResult:
    """Receive a CSV/XLSX file and open an import job."""
    # Read at most limit+1 bytes: enough to detect an oversized file without
    # ever buffering an arbitrarily large upload in memory.
    data = await file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        limit_mb = settings.max_upload_bytes / (1024 * 1024)
        raise ValidationError(f"Arquivo excede o limite de {limit_mb:.0f} MB.")
    return ImportService(db).upload(file.filename or "arquivo", data)


class PreviewRequest(BaseModel):
    sheet_name: str | None = None


@router.post("/{job_id}/preview", response_model=UploadResult)
def preview(job_id: int, payload: PreviewRequest, db: Session = Depends(get_db)) -> UploadResult:
    """Switch sheet (XLSX) and re-read headers + sample."""
    return ImportService(db).preview_sheet(job_id, payload.sheet_name)


class ValidateRequest(BaseModel):
    mapping: ImportMapping
    sheet_name: str | None = None


@router.post("/{job_id}/validate", response_model=ValidationReport)
def validate(
    job_id: int, payload: ValidateRequest, db: Session = Depends(get_db)
) -> ValidationReport:
    """Dry-run the mapping and return the per-row report (writes nothing)."""
    return ImportService(db).validate(job_id, payload.mapping, payload.sheet_name)


@router.post("/{job_id}/commit", response_model=CommitResult)
def commit(job_id: int, db: Session = Depends(get_db)) -> CommitResult:
    """Import every valid row in one transaction."""
    return ImportService(db).commit(job_id)


@router.post("/{job_id}/cancel", response_model=ImportJobOut)
def cancel(job_id: int, db: Session = Depends(get_db)) -> ImportJobOut:
    return ImportService(db).cancel(job_id)


@router.post("/{job_id}/rollback", response_model=ImportJobOut)
def rollback(job_id: int, db: Session = Depends(get_db)) -> ImportJobOut:
    """Logically roll back a committed import (removes its materials)."""
    return ImportService(db).rollback(job_id)


@router.get("", response_model=list[ImportJobOut])
def list_jobs(db: Session = Depends(get_db)) -> list[ImportJobOut]:
    return ImportService(db).list_jobs()


@router.get("/{job_id}/report", response_model=ValidationReport)
def get_report(job_id: int, db: Session = Depends(get_db)) -> ValidationReport:
    return ImportService(db).get_report(job_id)


@templates_router.get("", response_model=list[TemplateOut])
def list_templates(db: Session = Depends(get_db)) -> list[TemplateOut]:
    return ImportService(db).list_templates()


@templates_router.post("", response_model=TemplateOut, status_code=201)
def create_template(payload: TemplateIn, db: Session = Depends(get_db)) -> TemplateOut:
    return ImportService(db).create_template(payload)
