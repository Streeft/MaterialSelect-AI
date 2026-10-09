"""Curvas: medida engenharia/verdadeira e tipo de módulo declarados (D-119, TM5-b).

Duas colunas anuláveis em ``material_curve``, **sem backfill**:

- ``strain_measure`` — ``'engineering'`` ou ``'true'``, como a fonte declara a
  curva tensão–deformação. Nulo é "não declarado": o cartão CAE plástico recusa
  a curva (422) em vez de presumir uma das duas. Nenhuma curva existente ganha
  valor — inventar a medida de uma curva já gravada seria presumir.
- ``modulus_kind`` — ``'young'``, ``'shear'`` ou ``'bulk'``, para um eixo y de
  módulo. O vocabulário do D-106 tem uma grandeza ``modulo`` só, que não separa
  E de G; o cartão plástico só lê E de uma curva declarada ``young``.

Os ``CHECK`` (portáveis: comparação de texto, sem ``boolean = 1``) recusam valor
fora da lista e valor onde ele não significa nada (medida fora de
tensão–deformação; tipo de módulo num eixo que não é módulo). O autogenerate não
os detecta e eles foram escritos à mão, com os mesmos nomes do modelo.

O autogenerate também propôs mexer em ``battery_chemistry`` e ``subscription``
(a deriva antiga registrada no D-105 e no D-106, alheia a este item); essas
linhas foram retiradas desta revisão.

Revision ID: 81adb0b92f72
Revises: 73a9b5da72b2
Create Date: 2026-10-08
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '81adb0b92f72'
down_revision: Union[str, None] = '73a9b5da72b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('material_curve', schema=None) as batch_op:
        batch_op.add_column(sa.Column('strain_measure', sa.String(length=12), nullable=True))
        batch_op.add_column(sa.Column('modulus_kind', sa.String(length=12), nullable=True))
        batch_op.create_check_constraint(
            'ck_material_curve_strain_measure',
            "strain_measure IS NULL OR (strain_measure IN ('engineering', 'true') "
            "AND kind = 'TENSAO_DEFORMACAO')",
        )
        batch_op.create_check_constraint(
            'ck_material_curve_modulus_kind',
            "modulus_kind IS NULL OR (modulus_kind IN ('bulk', 'shear', 'young') "
            "AND y_quantity = 'modulo')",
        )


def downgrade() -> None:
    with op.batch_alter_table('material_curve', schema=None) as batch_op:
        batch_op.drop_constraint('ck_material_curve_modulus_kind', type_='check')
        batch_op.drop_constraint('ck_material_curve_strain_measure', type_='check')
        batch_op.drop_column('modulus_kind')
        batch_op.drop_column('strain_measure')
