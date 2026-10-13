"""Equivalência declarada entre designações: grupo, tipo, fonte e membros (D-115, TM1).

Só as duas tabelas novas; o autogenerate também apontou deriva alheia (índice de
battery_chemistry e subscription), deixada de fora de propósito.

Revision ID: 129a7dbbd361
Revises: 73a9b5da72b2
Create Date: 2026-10-08 17:19:57.942279
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '129a7dbbd361'
down_revision: Union[str, None] = '73a9b5da72b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('equivalence_group',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('kind', sa.Enum('EQUIVALENTE', 'APROXIMADA', 'SIMILAR', name='equivalencekind', native_enum=False, length=16), nullable=False),
    sa.Column('source_id', sa.Integer(), nullable=False),
    sa.Column('citation', sa.String(length=500), nullable=True),
    sa.Column('note', sa.String(length=500), nullable=True),
    sa.Column('is_demo', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['source_id'], ['source.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('equivalence_group', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_equivalence_group_kind'), ['kind'], unique=False)
        batch_op.create_index(batch_op.f('ix_equivalence_group_source_id'), ['source_id'], unique=False)

    op.create_table('equivalence_member',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('group_id', sa.Integer(), nullable=False),
    sa.Column('designation_id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['designation_id'], ['material_designation.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['group_id'], ['equivalence_group.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('group_id', 'designation_id', name='uq_equivalence_member')
    )
    with op.batch_alter_table('equivalence_member', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_equivalence_member_designation_id'), ['designation_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_equivalence_member_group_id'), ['group_id'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('equivalence_member', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_equivalence_member_group_id'))
        batch_op.drop_index(batch_op.f('ix_equivalence_member_designation_id'))

    op.drop_table('equivalence_member')
    with op.batch_alter_table('equivalence_group', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_equivalence_group_source_id'))
        batch_op.drop_index(batch_op.f('ix_equivalence_group_kind'))

    op.drop_table('equivalence_group')
