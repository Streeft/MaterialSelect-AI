"""Request/response schemas for the import wizard."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import ImportStatus

ColumnRole = Literal["value", "min", "max", "typical"]


class ColumnMapping(BaseModel):
    """Maps one spreadsheet column to one property (with a role and unit).

    ``role`` lets separate min/max/typical columns feed a single interval
    property. ``unit`` is the fallback when the cell itself carries no unit.
    """

    column: str
    property_slug: str
    role: ColumnRole = "value"
    unit: str | None = None


class ImportMapping(BaseModel):
    """Full mapping submitted by the wizard for validation/commit."""

    name_column: str
    class_column: str | None = None
    default_class_id: int | None = None
    subclass_column: str | None = None
    description_column: str | None = None
    keywords_column: str | None = None
    source_label: str | None = Field(default=None, max_length=160)
    # Procedência/licença (M1) — required only when ``source_label`` names a
    # source not yet registered; an already-registered source keeps the
    # license it was given the first time (see ImportService._check_source_licensing).
    source_license_label: str | None = Field(default=None, max_length=200)
    source_license_url: str | None = Field(default=None, max_length=500)
    source_contains_third_party_data: bool = False
    # The human confirmation the backlog item requires before incorporating a
    # source flagged as possibly containing third-party data. Meaningless
    # (and ignored) unless source_contains_third_party_data is also True.
    source_review_confirmed: bool = False
    columns: list[ColumnMapping] = []


class ColumnSuggestion(BaseModel):
    """Heuristic pre-fill for the mapping UI (never applied silently)."""

    column: str
    suggested_target: str | None = None  # "name" | "class" | ... | "property"
    suggested_property_slug: str | None = None
    suggested_role: ColumnRole = "value"
    suggested_unit: str | None = None


class UploadResult(BaseModel):
    """Response of the upload step: enough to render preview + mapping UI."""

    job_id: int
    filename: str
    file_format: str
    sheet_names: list[str] = []
    sheet_name: str | None = None
    headers: list[str]
    sample_rows: list[list[str | None]]
    row_count: int
    suggestions: list[ColumnSuggestion] = []


class RowIssue(BaseModel):
    """One problem found in one row during validation."""

    column: str | None = None
    message: str


class RowReport(BaseModel):
    """Validation outcome for one data row."""

    row_number: int  # 1-based, excluding the header row
    name: str | None = None
    status: Literal["ok", "error", "duplicate"]
    issues: list[RowIssue] = []
    warnings: list[str] = []


class ValidationReport(BaseModel):
    """Full dry-run report; nothing has been written to the catalogue."""

    job_id: int
    status: ImportStatus
    row_count: int
    valid_count: int
    error_count: int
    duplicate_count: int
    rows: list[RowReport]


class CommitResult(BaseModel):
    """Outcome of committing the valid rows of a validated job."""

    job_id: int
    status: ImportStatus
    imported_count: int
    skipped_count: int


class ImportJobOut(BaseModel):
    """History entry for the imports listing."""

    id: int
    filename: str
    file_format: str
    sheet_name: str | None = None
    status: ImportStatus
    row_count: int
    valid_count: int
    error_count: int
    duplicate_count: int
    imported_count: int
    created_at: datetime
    committed_at: datetime | None = None


class TemplateIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=500)
    mapping: ImportMapping


class TemplateOut(BaseModel):
    id: int
    name: str
    description: str | None = None
    mapping: ImportMapping
    created_at: datetime
