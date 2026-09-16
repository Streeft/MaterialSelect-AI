"""Catálogo de químicas de bateria (P4, D-69).

Tabela nova e nada mais: nenhuma coluna existente muda, nenhuma linha existente
é tocada. Uma química de célula não entra em ``material`` de propósito — a
justificativa inteira está no docstring de ``app/models/battery_chemistry.py``.

Como o ``TransportMode`` do D-66, as linhas são **semeadas** e cada uma nomeia a
sua ``Source``. Por isso a tabela nasce vazia aqui: o schema é assunto da
migração, o dado é assunto do seed, e misturar os dois faria a migração precisar
ser reescrita toda vez que uma citação mudasse.

Revision ID: c3a71f0b45de
Revises: ebf6d9eb737a
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "c3a71f0b45de"
down_revision = "ebf6d9eb737a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "battery_chemistry",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("formula", sa.String(length=120), nullable=True),
        sa.Column("description", sa.String(length=1000), nullable=True),
        sa.Column("nominal_voltage", sa.Float(), nullable=False),
        sa.Column("specific_energy", sa.Float(), nullable=False),
        sa.Column("energy_density", sa.Float(), nullable=False),
        sa.Column("specific_power", sa.Float(), nullable=False),
        sa.Column("cycle_efficiency", sa.Float(), nullable=False),
        sa.Column("cycle_life", sa.Integer(), nullable=False),
        sa.Column("cell_cost_per_kwh", sa.Float(), nullable=False),
        sa.Column("thermal_safety", sa.String(length=20), nullable=False),
        sa.Column("thermal_runaway_temp_c", sa.Float(), nullable=False),
        sa.Column("operating_temp_min_c", sa.Float(), nullable=False),
        sa.Column("operating_temp_max_c", sa.Float(), nullable=False),
        sa.Column("max_continuous_c_rate", sa.Float(), nullable=False),
        sa.Column("peak_c_rate", sa.Float(), nullable=False),
        sa.Column("advantages", sa.JSON(), nullable=False),
        sa.Column("limitations", sa.JSON(), nullable=False),
        sa.Column("typical_applications", sa.JSON(), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_demo", sa.Boolean(), nullable=False),
        sa.Column("citation", sa.String(length=400), nullable=True),
        sa.Column("source_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["source_id"], ["source.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_battery_chemistry_source_id"),
        "battery_chemistry",
        ["source_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_battery_chemistry_slug"), "battery_chemistry", ["slug"], unique=True
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_battery_chemistry_slug"), table_name="battery_chemistry")
    op.drop_index(
        op.f("ix_battery_chemistry_source_id"), table_name="battery_chemistry"
    )
    op.drop_table("battery_chemistry")
