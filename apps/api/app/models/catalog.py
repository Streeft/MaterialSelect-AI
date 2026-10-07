"""Official catalogue provenance and external identity mapping.

The licensed source files are not the application's relational model. These
tables preserve which external dataset/import produced each shared catalogue
record without polluting Material/Process with provider-specific columns.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class CatalogDataset(Base):
    """One externally supplied catalogue/dataset and its immutable identity."""

    __tablename__ = "catalog_dataset"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(240), nullable=False)
    release: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    license_label: Mapped[str] = mapped_column(String(240), nullable=False)
    provenance: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    import_runs: Mapped[list["CatalogImportRun"]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan"
    )
    record_refs: Mapped[list["CatalogRecordRef"]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan"
    )


class CatalogImportRun(Base):
    """Audit row for one validation or committed official-catalogue import."""

    __tablename__ = "catalog_import_run"

    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_id: Mapped[int] = mapped_column(
        ForeignKey("catalog_dataset.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bundle_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    manifest_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    dry_run: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    counts: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    report: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    dataset: Mapped[CatalogDataset] = relationship(back_populates="import_runs")


class CatalogRecordRef(Base):
    """Stable external identity for a material, process or transport mode.

    Exactly one internal FK is set. This keeps referential integrity while
    allowing the source dataset to use arbitrary record ids/GRUIDs.
    """

    __tablename__ = "catalog_record_ref"
    __table_args__ = (
        CheckConstraint(
            "("
            "(material_id IS NOT NULL AND process_id IS NULL AND transport_mode_id IS NULL) OR "
            "(material_id IS NULL AND process_id IS NOT NULL AND transport_mode_id IS NULL) OR "
            "(material_id IS NULL AND process_id IS NULL AND transport_mode_id IS NOT NULL)"
            ")",
            name="ck_catalog_record_ref_one_target",
        ),
        UniqueConstraint(
            "dataset_id",
            "external_table",
            "external_record_id",
            name="uq_catalog_record_ref_external_identity",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_id: Mapped[int] = mapped_column(
        ForeignKey("catalog_dataset.id", ondelete="CASCADE"), nullable=False, index=True
    )
    external_table: Mapped[str] = mapped_column(String(160), nullable=False)
    external_record_id: Mapped[str] = mapped_column(String(240), nullable=False)
    external_gruid: Mapped[str | None] = mapped_column(String(240), nullable=True, index=True)
    raw_record_sha256: Mapped[str] = mapped_column(String(64), nullable=False)

    material_id: Mapped[int | None] = mapped_column(
        ForeignKey("material.id", ondelete="CASCADE"), nullable=True, index=True
    )
    process_id: Mapped[int | None] = mapped_column(
        ForeignKey("process.id", ondelete="CASCADE"), nullable=True, index=True
    )
    transport_mode_id: Mapped[int | None] = mapped_column(
        ForeignKey("transport_mode.id", ondelete="CASCADE"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    dataset: Mapped[CatalogDataset] = relationship(back_populates="record_refs")
