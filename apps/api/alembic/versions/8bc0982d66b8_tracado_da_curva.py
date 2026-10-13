"""Traçado da curva: ``path_kind`` em ``material_curve`` (D-118, TM4-c).

- ``path_kind`` — ``'function'`` (um y por x, x estritamente crescente: a regra
  de sempre) ou ``'path'`` (trajetória na ordem declarada; x pode repetir ou
  voltar, como num laço de histerese). ``NOT NULL`` com ``server_default
  'function'``: toda curva existente foi gravada sob a regra monotônica, então o
  preenchimento declara o que já era verdade, e não inventa nada.
- ``ck_material_curve_path_kind`` — a lista do domínio
  (``app.domain.curve_quantities.PATH_KINDS``), por extenso; ``IN`` sobre texto é
  portável entre SQLite e PostgreSQL.

O autogenerate detectou a coluna, mas não o ``CHECK`` (escrito à mão aqui). Ele
também propôs mexer em ``battery_chemistry`` e ``subscription`` (a deriva antiga
registrada no D-105 e no D-106, alheia a este item); essas linhas foram retiradas.

Revision ID: 8bc0982d66b8
Revises: 703bbf25ce90
Create Date: 2026-10-13
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8bc0982d66b8'
down_revision: Union[str, None] = '703bbf25ce90'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('material_curve', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('path_kind', sa.String(length=10), server_default='function', nullable=False)
        )
        batch_op.create_check_constraint(
            'ck_material_curve_path_kind',
            "path_kind IN ('function', 'path')",
        )


def downgrade() -> None:
    with op.batch_alter_table('material_curve', schema=None) as batch_op:
        batch_op.drop_constraint('ck_material_curve_path_kind', type_='check')
        batch_op.drop_column('path_kind')
