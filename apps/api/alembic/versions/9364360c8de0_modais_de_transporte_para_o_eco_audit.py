"""modais de transporte para o eco audit

O terceiro universo de que o Eco Audit precisa, e o menor: quatro linhas com
duas intensidades cada. Aditiva por inteiro — nada que já existia muda.

As duas intensidades são **anuláveis e ficam anuláveis**: NULL quer dizer que
ninguém catalogou aquele número para este modal, o que é diferente de zero, e a
auditoria reporta a fase de transporte como ausente-com-motivo em vez de livre
(princípio 3).

O autogenerate também apontou uma divergência **pré-existente** em
``ix_subscription_user_id`` (unique=False no banco, unique=True no modelo). Ela
não é desta migração e foi retirada daqui de propósito: consertá-la de carona
misturaria uma correção de schema alheia com a adição de uma tabela, e a
divergência já está registrada como pendência própria em ``docs/TODO.md``.

Revision ID: 9364360c8de0
Revises: b4e8a2f17c93
Create Date: 2026-09-15 20:23:07.255302
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9364360c8de0"
down_revision: Union[str, None] = "b4e8a2f17c93"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "transport_mode",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("energy_intensity", sa.Float(), nullable=True),
        sa.Column("carbon_intensity", sa.Float(), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_demo", sa.Boolean(), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["source_id"], ["source.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    with op.batch_alter_table("transport_mode", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_transport_mode_source_id"), ["source_id"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("transport_mode", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_transport_mode_source_id"))
    op.drop_table("transport_mode")
