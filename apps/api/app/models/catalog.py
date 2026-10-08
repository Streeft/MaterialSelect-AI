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
    String,
    UniqueConstraint,
)
from sqlalchemy import false as sa_false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class CatalogDataset(Base):
    """One externally supplied catalogue/dataset and its immutable identity.

    One row is one **release** (the slug names the bytes, D-102). ``lineage``
    names the catalogue the release belongs to, so two releases can be
    compared (D-108): the slug cannot say it, and the free-text ``name`` is a
    label, not an identity. NULL means the bundle never declared one — such a
    release is comparable with nothing, never matched by its name.
    """

    __tablename__ = "catalog_dataset"
    __table_args__ = (
        CheckConstraint("lineage IS NULL OR lineage <> ''", name="ck_catalog_dataset_lineage"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(240), nullable=False)
    release: Mapped[str | None] = mapped_column(String(120), nullable=True)
    lineage: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    source_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    license_label: Mapped[str] = mapped_column(String(240), nullable=False)
    provenance: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    #: A fictitious release (D-108 demo): declared on the row, like every other
    #: demo marker, so ``clear_demo`` finds it and the official import refuses
    #: to commit while one exists.
    is_demo: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=sa_false(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    import_runs: Mapped[list[CatalogImportRun]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan"
    )
    record_refs: Mapped[list[CatalogRecordRef]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan"
    )
    supplemental_values: Mapped[list[CatalogSupplementalValue]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan"
    )
    dataset_values: Mapped[list[CatalogDatasetValue]] = relationship(
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


class CatalogSupplementalValue(Base):
    """Lossless provider value not representable as MaterialPropertyValue.

    Text, discrete vocabularies, curves and equations stay here as structured
    JSON. They are preserved and provenance-linked but never enter selection,
    ranking or calculations until a deterministic domain model exists for that
    value kind.
    """

    __tablename__ = "catalog_supplemental_value"
    __table_args__ = (
        CheckConstraint(
            "("
            "(material_id IS NOT NULL AND process_id IS NULL AND transport_mode_id IS NULL) OR "
            "(material_id IS NULL AND process_id IS NOT NULL AND transport_mode_id IS NULL) OR "
            "(material_id IS NULL AND process_id IS NULL AND transport_mode_id IS NOT NULL)"
            ")",
            name="ck_catalog_supplemental_value_one_target",
        ),
        UniqueConstraint(
            "dataset_id",
            "external_table",
            "external_record_id",
            "external_attribute_id",
            name="uq_catalog_supplemental_external_value",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_id: Mapped[int] = mapped_column(
        ForeignKey("catalog_dataset.id", ondelete="CASCADE"), nullable=False, index=True
    )
    material_id: Mapped[int | None] = mapped_column(
        ForeignKey("material.id", ondelete="CASCADE"), nullable=True, index=True
    )
    process_id: Mapped[int | None] = mapped_column(
        ForeignKey("process.id", ondelete="CASCADE"), nullable=True, index=True
    )
    transport_mode_id: Mapped[int | None] = mapped_column(
        ForeignKey("transport_mode.id", ondelete="CASCADE"), nullable=True, index=True
    )
    external_table: Mapped[str] = mapped_column(String(160), nullable=False)
    external_record_id: Mapped[str] = mapped_column(String(240), nullable=False)
    external_attribute_id: Mapped[str] = mapped_column(String(240), nullable=False)
    attribute_name: Mapped[str] = mapped_column(String(240), nullable=False)
    value_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    original_unit: Mapped[str | None] = mapped_column(String(80), nullable=True)
    payload: Mapped[dict | list | str | float | int | bool | None] = mapped_column(
        JSON, nullable=True
    )
    raw_value_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    dataset: Mapped[CatalogDataset] = relationship(back_populates="supplemental_values")


class CatalogDatasetValue(Base):
    """Dataset-level licensed fact/default without a material/process target."""

    __tablename__ = "catalog_dataset_value"
    __table_args__ = (
        UniqueConstraint("dataset_id", "namespace", "key", name="uq_catalog_dataset_value_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_id: Mapped[int] = mapped_column(
        ForeignKey("catalog_dataset.id", ondelete="CASCADE"), nullable=False, index=True
    )
    namespace: Mapped[str] = mapped_column(String(160), nullable=False)
    key: Mapped[str] = mapped_column(String(240), nullable=False)
    value_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    original_unit: Mapped[str | None] = mapped_column(String(80), nullable=True)
    payload: Mapped[dict | list | str | float | int | bool | None] = mapped_column(
        JSON, nullable=True
    )
    raw_value_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    dataset: Mapped[CatalogDataset] = relationship(back_populates="dataset_values")
