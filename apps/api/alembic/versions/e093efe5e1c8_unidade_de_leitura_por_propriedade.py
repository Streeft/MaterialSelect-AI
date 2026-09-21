"""A unidade de leitura, por propriedade (D-70).

Duas colunas anuláveis e uma restrição. Nenhum valor gravado muda, e nenhuma
linha é tocada: `display_unit` é a unidade em que a grandeza **se lê**, e a
leitura acontece na saída — o canônico permanece o que sempre foi, inclusive o
`conversion_method`, que é trilho de auditoria e não texto de leitura.

`NULL` é o padrão e é resposta legítima: quer dizer "esta grandeza se lê como
está guardada". Por isso a migração não precisa de backfill — sem o seed, tudo
continua lendo em canônico, exatamente como antes.

O autogenerate também propôs duas mudanças **não relacionadas** que ficaram de
fora de propósito: a unicidade de `ix_subscription_user_id` (deriva
pré-existente, registrada em `docs/TODO.md`) e a reexpressão do índice único de
`battery_chemistry.slug` como constraint — equivalentes ao que já existe, e
nenhuma delas é assunto desta mudança.

Revision ID: e093efe5e1c8
Revises: c3a71f0b45de
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "e093efe5e1c8"
down_revision = "c3a71f0b45de"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("property_definition", schema=None) as batch_op:
        batch_op.add_column(sa.Column("display_unit", sa.String(length=60), nullable=True))

    with op.batch_alter_table("process_attribute_definition", schema=None) as batch_op:
        batch_op.add_column(sa.Column("display_unit", sa.String(length=60), nullable=True))
        # Uma unidade de leitura exige uma canônica para ser lida a partir de
        # quê. Um atributo discreto não tem nenhuma das duas.
        batch_op.create_check_constraint(
            "ck_process_attribute_definition_display_unit_needs_canonical",
            "display_unit IS NULL OR canonical_unit IS NOT NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("process_attribute_definition", schema=None) as batch_op:
        batch_op.drop_constraint(
            "ck_process_attribute_definition_display_unit_needs_canonical", type_="check"
        )
        batch_op.drop_column("display_unit")

    with op.batch_alter_table("property_definition", schema=None) as batch_op:
        batch_op.drop_column("display_unit")
