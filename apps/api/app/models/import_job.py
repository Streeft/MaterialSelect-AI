"""ImportJob and ImportMappingTemplate models.

An ImportJob tracks one uploaded file through its lifecycle (see
:class:`app.models.enums.ImportStatus`). The column mapping and the per-row
validation report are stored as JSON on the job, which makes every import fully
auditable and reproducible. Materials created by a commit carry the job id
(``material.import_job_id``) so the whole import can be logically rolled back
as a unit.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Enum, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import ImportStatus


def _utcnow() -> datetime:
    return datetime.now(UTC)


class ImportJob(Base):
    """One uploaded file and its progress through the import wizard."""

    __tablename__ = "import_job"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Sanitised original filename (display only; never used as a path).
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    # Server-side storage path of the uploaded bytes, derived from the job id.
    stored_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_format: Mapped[str] = mapped_column(String(10), nullable=False)  # "csv" | "xlsx"
    sheet_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    status: Mapped[ImportStatus] = mapped_column(
        Enum(ImportStatus, native_enum=False, length=12),
        default=ImportStatus.PENDENTE,
        nullable=False,
    )

    # Column mapping (as submitted for validation) and per-row report.
    mapping: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    report: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    row_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    valid_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    duplicate_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    imported_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    committed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class ImportMappingTemplate(Base):
    """A reusable, named column mapping for recurring spreadsheet layouts."""

    __tablename__ = "import_mapping_template"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    mapping: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
