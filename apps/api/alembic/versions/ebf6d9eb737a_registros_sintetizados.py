"""registros sintetizados

O Synthesizer (P3): ``material.is_synthesized`` mais a tabela da receita.
Aditiva por inteiro — todo material que já existia continua com
``is_synthesized = false``, que é o que ele sempre foi.

Duas coisas que a autogeração não escreve sozinha e que quebrariam em produção:

* a coluna nova entra com ``server_default`` porque a tabela tem linhas e a
  coluna é ``NOT NULL``; o default é **retirado em seguida**, para o banco não
  ficar com um padrão que o modelo não declara — que é justamente a divergência
  que uma autogeração futura apontaria;
* a restrição é escrita como ``NOT (is_synthesized AND owner_id IS NULL)`` e
  **não** comparando com 1: o PostgreSQL recusa `booleano = 1`, e o job de
  migrações da CI roda contra PostgreSQL de verdade.

A divergência pré-existente de ``ix_subscription_user_id`` foi retirada daqui de
propósito, como na migração anterior: não é desta mudança, e já está registrada
como pendência própria em ``docs/TODO.md``.

Revision ID: ebf6d9eb737a
Revises: 9364360c8de0
Create Date: 2026-09-15 20:53:47.107956
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "ebf6d9eb737a"
down_revision: Union[str, None] = "9364360c8de0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "material_synthesis",
        sa.Column("material_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("parent_a_id", sa.Integer(), nullable=True),
        sa.Column("parent_b_id", sa.Integer(), nullable=True),
        sa.Column("parameters", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["material_id"], ["material.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_a_id"], ["material.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["parent_b_id"], ["material.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("material_id"),
    )
    with op.batch_alter_table("material_synthesis", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_material_synthesis_parent_a_id"), ["parent_a_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_material_synthesis_parent_b_id"), ["parent_b_id"], unique=False
        )

    with op.batch_alter_table("material", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "is_synthesized",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
        batch_op.create_check_constraint(
            "ck_material_sintetizado_tem_dono",
            "NOT (is_synthesized AND owner_id IS NULL)",
        )
    with op.batch_alter_table("material", schema=None) as batch_op:
        batch_op.alter_column("is_synthesized", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("material", schema=None) as batch_op:
        batch_op.drop_constraint("ck_material_sintetizado_tem_dono", type_="check")
        batch_op.drop_column("is_synthesized")

    with op.batch_alter_table("material_synthesis", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_material_synthesis_parent_b_id"))
        batch_op.drop_index(batch_op.f("ix_material_synthesis_parent_a_id"))

    op.drop_table("material_synthesis")
