"""notas de estudo e de estagio, origem de copia de material

Revision ID: d4f041be7fd4
Revises: 8bc0982d66b8
Create Date: 2026-10-14 00:37:25.497600

D-122: ``notes`` (texto puro, anulável) em ``selection_study`` e
``selection_stage``; ``copied_from_id`` (anulável, SET NULL) em ``material``.
Só colunas novas anuláveis: nenhum registro existente muda de significado.
O autogenerate também propôs mexer em ``battery_chemistry`` e ``subscription``
(deriva antiga, alheia a esta mudança) e isso foi deixado de fora de propósito.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4f041be7fd4'
down_revision: Union[str, None] = '8bc0982d66b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('material', schema=None) as batch_op:
        batch_op.add_column(sa.Column('copied_from_id', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_material_copied_from_id'), ['copied_from_id'], unique=False)
        batch_op.create_foreign_key(
            'fk_material_copied_from_id', 'material', ['copied_from_id'], ['id'], ondelete='SET NULL'
        )

    with op.batch_alter_table('selection_stage', schema=None) as batch_op:
        batch_op.add_column(sa.Column('notes', sa.String(length=2000), nullable=True))

    with op.batch_alter_table('selection_study', schema=None) as batch_op:
        batch_op.add_column(sa.Column('notes', sa.String(length=2000), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('selection_study', schema=None) as batch_op:
        batch_op.drop_column('notes')

    with op.batch_alter_table('selection_stage', schema=None) as batch_op:
        batch_op.drop_column('notes')

    with op.batch_alter_table('material', schema=None) as batch_op:
        batch_op.drop_constraint('fk_material_copied_from_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_material_copied_from_id'))
        batch_op.drop_column('copied_from_id')
