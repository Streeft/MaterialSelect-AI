"""Composição por condição: ``condition_label`` na linha de composição (D-117, TM2-c).

Uma coluna em ``material_composition`` e as regras de unicidade refeitas com ela:

- ``condition_label`` — a condição para a qual a fonte declara a composição
  ("fundido", "laminado"). Anulável e **sem backfill**: ``NULL`` é "sem condição
  declarada", que é exatamente o que toda linha existente é. O ``CHECK``
  ``ck_material_composition_condition_label`` recusa rótulo vazio, com espaço nas
  pontas ou com mais de 60 caracteres; ``length`` e ``trim`` existem no SQLite e
  no PostgreSQL com o mesmo sentido.
- Unicidade por (material, condição, elemento). Como ``NULL`` não colide com
  ``NULL`` numa chave única, a metade "sem condição" de cada regra é um índice
  único parcial próprio: ``uq_material_composition_element_unconditioned`` (um
  elemento por material sem condição) e o já existente
  ``uq_material_composition_one_balance``, recriado com ``condition_label IS
  NULL`` no predicado, ao lado de ``…_one_balance_per_condition``.

O autogenerate detectou a coluna, a troca da chave única e os dois índices
novos, mas não o ``CHECK`` nem a mudança de predicado do índice parcial
existente — ambos escritos à mão aqui. Ele também propôs mexer em
``battery_chemistry`` e ``subscription`` (a deriva antiga registrada no D-105 e
no D-106, alheia a este item); essas linhas foram retiradas.

Revision ID: 703bbf25ce90
Revises: 81adb0b92f72
Create Date: 2026-10-13
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '703bbf25ce90'
down_revision: Union[str, None] = '81adb0b92f72'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_LABEL_CHECK = (
    "condition_label IS NULL OR (length(condition_label) BETWEEN 1 AND 60 "
    "AND condition_label = trim(condition_label))"
)


def upgrade() -> None:
    with op.batch_alter_table('material_composition', schema=None) as batch_op:
        batch_op.add_column(sa.Column('condition_label', sa.String(length=60), nullable=True))
        batch_op.drop_constraint('uq_material_composition_element', type_='unique')
        batch_op.drop_index(
            'uq_material_composition_one_balance',
            sqlite_where=sa.text('is_balance'),
            postgresql_where=sa.text('is_balance'),
        )
        batch_op.create_check_constraint('ck_material_composition_condition_label', _LABEL_CHECK)
        batch_op.create_unique_constraint(
            'uq_material_composition_condition_element',
            ['material_id', 'condition_label', 'element'],
        )
        batch_op.create_index(
            'uq_material_composition_element_unconditioned',
            ['material_id', 'element'],
            unique=True,
            sqlite_where=sa.text('condition_label IS NULL'),
            postgresql_where=sa.text('condition_label IS NULL'),
        )
        batch_op.create_index(
            'uq_material_composition_one_balance',
            ['material_id'],
            unique=True,
            sqlite_where=sa.text('is_balance AND condition_label IS NULL'),
            postgresql_where=sa.text('is_balance AND condition_label IS NULL'),
        )
        batch_op.create_index(
            'uq_material_composition_one_balance_per_condition',
            ['material_id', 'condition_label'],
            unique=True,
            sqlite_where=sa.text('is_balance AND condition_label IS NOT NULL'),
            postgresql_where=sa.text('is_balance AND condition_label IS NOT NULL'),
        )


def downgrade() -> None:
    # Rows with a condition cannot be represented without the column: a
    # downgrade over them would collide on the old (material, element) key.
    op.execute("DELETE FROM material_composition WHERE condition_label IS NOT NULL")
    with op.batch_alter_table('material_composition', schema=None) as batch_op:
        batch_op.drop_index(
            'uq_material_composition_one_balance_per_condition',
            sqlite_where=sa.text('is_balance AND condition_label IS NOT NULL'),
            postgresql_where=sa.text('is_balance AND condition_label IS NOT NULL'),
        )
        batch_op.drop_index(
            'uq_material_composition_one_balance',
            sqlite_where=sa.text('is_balance AND condition_label IS NULL'),
            postgresql_where=sa.text('is_balance AND condition_label IS NULL'),
        )
        batch_op.drop_index(
            'uq_material_composition_element_unconditioned',
            sqlite_where=sa.text('condition_label IS NULL'),
            postgresql_where=sa.text('condition_label IS NULL'),
        )
        batch_op.drop_constraint('uq_material_composition_condition_element', type_='unique')
        batch_op.drop_constraint('ck_material_composition_condition_label', type_='check')
        batch_op.create_unique_constraint(
            'uq_material_composition_element', ['material_id', 'element']
        )
        batch_op.create_index(
            'uq_material_composition_one_balance',
            ['material_id'],
            unique=True,
            sqlite_where=sa.text('is_balance'),
            postgresql_where=sa.text('is_balance'),
        )
        batch_op.drop_column('condition_label')
