"""Releases do catálogo: linha declarada e marca de demonstração (D-108, TM7).

Duas colunas em ``catalog_dataset`` e nada mais:

- ``lineage`` — o catálogo ao qual a release pertence. É o que torna duas
  releases comparáveis; o slug nomeia os bytes de uma release só e o ``name`` é
  rótulo livre, que não decide identidade. Anulável e **sem backfill**: uma
  release importada antes desta revisão não declarou linha, e inventar uma a
  partir do nome seria deduplicar por nome. O ``CHECK`` recusa a cadeia vazia,
  que leria como linha declarada sem dizer qual.
- ``is_demo`` — release fictícia, marcada na própria linha como todo dado de
  demonstração (docs/15). ``server_default`` falso para as linhas existentes, que
  vieram todas do importador oficial; escrito com ``sa.false()`` porque o
  ``'0'`` que o autogenerate propôs não é um default booleano válido no
  PostgreSQL.

O autogenerate também propôs mexer em ``battery_chemistry`` e ``subscription``
(a deriva antiga entre modelos e migrações registrada no D-105 e no D-106,
alheia a este item); essas linhas foram retiradas desta revisão.

Revision ID: 73a9b5da72b2
Revises: 0925e0787863
Create Date: 2026-10-08
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '73a9b5da72b2'
down_revision: Union[str, None] = '0925e0787863'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('catalog_dataset', schema=None) as batch_op:
        batch_op.add_column(sa.Column('lineage', sa.String(length=120), nullable=True))
        batch_op.add_column(
            sa.Column('is_demo', sa.Boolean(), server_default=sa.false(), nullable=False)
        )
        batch_op.create_index(batch_op.f('ix_catalog_dataset_lineage'), ['lineage'], unique=False)
        batch_op.create_check_constraint(
            'ck_catalog_dataset_lineage', "lineage IS NULL OR lineage <> ''"
        )


def downgrade() -> None:
    with op.batch_alter_table('catalog_dataset', schema=None) as batch_op:
        batch_op.drop_constraint('ck_catalog_dataset_lineage', type_='check')
        batch_op.drop_index(batch_op.f('ix_catalog_dataset_lineage'))
        batch_op.drop_column('is_demo')
        batch_op.drop_column('lineage')
