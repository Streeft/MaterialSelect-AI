"""official catalogue provenance

Revision ID: a2f7c91d0e64
Revises: b7d219fa82de
Create Date: 2026-10-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a2f7c91d0e64"
down_revision: str | None = "b7d219fa82de"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "catalog_dataset",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("name", sa.String(length=240), nullable=False),
        sa.Column("release", sa.String(length=120), nullable=True),
        sa.Column("source_sha256", sa.String(length=64), nullable=False),
        sa.Column("license_label", sa.String(length=240), nullable=False),
        sa.Column("provenance", sa.String(length=1000), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )

    op.create_table(
        "catalog_import_run",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("dataset_id", sa.Integer(), nullable=False),
        sa.Column("bundle_sha256", sa.String(length=64), nullable=False),
        sa.Column("manifest_sha256", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("dry_run", sa.Boolean(), nullable=False),
        sa.Column("counts", sa.JSON(), nullable=False),
        sa.Column("report", sa.JSON(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["dataset_id"], ["catalog_dataset.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_catalog_import_run_dataset_id"),
        "catalog_import_run",
        ["dataset_id"],
        unique=False,
    )

    op.create_table(
        "catalog_record_ref",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("dataset_id", sa.Integer(), nullable=False),
        sa.Column("external_table", sa.String(length=160), nullable=False),
        sa.Column("external_record_id", sa.String(length=240), nullable=False),
        sa.Column("external_gruid", sa.String(length=240), nullable=True),
        sa.Column("raw_record_sha256", sa.String(length=64), nullable=False),
        sa.Column("material_id", sa.Integer(), nullable=True),
        sa.Column("process_id", sa.Integer(), nullable=True),
        sa.Column("transport_mode_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "("
            "(material_id IS NOT NULL AND process_id IS NULL AND transport_mode_id IS NULL) OR "
            "(material_id IS NULL AND process_id IS NOT NULL AND transport_mode_id IS NULL) OR "
            "(material_id IS NULL AND process_id IS NULL AND transport_mode_id IS NOT NULL)"
            ")",
            name="ck_catalog_record_ref_one_target",
        ),
        sa.ForeignKeyConstraint(["dataset_id"], ["catalog_dataset.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["material_id"], ["material.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["process_id"], ["process.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["transport_mode_id"], ["transport_mode.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "dataset_id",
            "external_table",
            "external_record_id",
            name="uq_catalog_record_ref_external_identity",
        ),
    )
    op.create_index(
        op.f("ix_catalog_record_ref_dataset_id"),
        "catalog_record_ref",
        ["dataset_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_catalog_record_ref_external_gruid"),
        "catalog_record_ref",
        ["external_gruid"],
        unique=False,
    )
    op.create_index(
        op.f("ix_catalog_record_ref_material_id"),
        "catalog_record_ref",
        ["material_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_catalog_record_ref_process_id"),
        "catalog_record_ref",
        ["process_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_catalog_record_ref_transport_mode_id"),
        "catalog_record_ref",
        ["transport_mode_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_catalog_record_ref_transport_mode_id"), table_name="catalog_record_ref")
    op.drop_index(op.f("ix_catalog_record_ref_process_id"), table_name="catalog_record_ref")
    op.drop_index(op.f("ix_catalog_record_ref_material_id"), table_name="catalog_record_ref")
    op.drop_index(op.f("ix_catalog_record_ref_external_gruid"), table_name="catalog_record_ref")
    op.drop_index(op.f("ix_catalog_record_ref_dataset_id"), table_name="catalog_record_ref")
    op.drop_table("catalog_record_ref")
    op.drop_index(op.f("ix_catalog_import_run_dataset_id"), table_name="catalog_import_run")
    op.drop_table("catalog_import_run")
    op.drop_table("catalog_dataset")
