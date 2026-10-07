"""Composição química e designações de material (D-105, TM2).

Duas tabelas novas, nenhuma coluna mexida: um material sem linha de composição
continua "sem composição cadastrada", e não 0 % de nada (D-24) — por isso não há
backfill. Os CHECKs repetem no banco as regras de ``app.domain.composition``
(resto e ausência nunca carregam número; mín. <= máx.; teor em 0–100 %; nominal
dentro da faixa; símbolo da lista fixa de elementos), porque o seed, o
importador oficial e uma migração futura escrevem aqui sem passar pelo serviço.

A lista de elementos está escrita por extenso de propósito: uma migração não
importa código da aplicação, que pode mudar depois dela.

O autogenerate também propôs mexer em ``battery_chemistry`` e ``subscription``
(deriva antiga entre modelos e migrações, alheia a este item); essas linhas
foram retiradas desta revisão.

Revision ID: 0d3c39eb2f81
Revises: a2f7c91d0e64
Create Date: 2026-10-07
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0d3c39eb2f81'
down_revision: Union[str, None] = 'a2f7c91d0e64'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('material_composition',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('material_id', sa.Integer(), nullable=False),
    sa.Column('element', sa.String(length=3), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('is_balance', sa.Boolean(), nullable=False),
    sa.Column('is_missing', sa.Boolean(), nullable=False),
    sa.Column('value_min', sa.Float(), nullable=True),
    sa.Column('value_max', sa.Float(), nullable=True),
    sa.Column('value_nominal', sa.Float(), nullable=True),
    sa.Column('original_unit', sa.String(length=40), nullable=True),
    sa.Column('normalized_min', sa.Float(), nullable=True),
    sa.Column('normalized_max', sa.Float(), nullable=True),
    sa.Column('normalized_nominal', sa.Float(), nullable=True),
    sa.Column('canonical_unit', sa.String(length=20), nullable=True),
    sa.Column('conversion_method', sa.String(length=120), nullable=True),
    sa.Column('notes', sa.String(length=500), nullable=True),
    sa.Column('source_id', sa.Integer(), nullable=False),
    sa.Column('citation', sa.String(length=500), nullable=True),
    sa.Column('data_quality', sa.Enum('MEDIDO', 'IMPORTADO', 'ESTIMADO', name='dataquality', native_enum=False, length=12), nullable=False),
    sa.Column('is_demo', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("element IN ('H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn', 'Fr', 'Ra', 'Ac', 'Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm', 'Md', 'No', 'Lr', 'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds', 'Rg', 'Cn', 'Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og')", name='ck_material_composition_element'),
    sa.CheckConstraint('(NOT is_balance AND NOT is_missing) OR (value_min IS NULL AND value_max IS NULL AND value_nominal IS NULL AND normalized_min IS NULL AND normalized_max IS NULL AND normalized_nominal IS NULL)', name='ck_material_composition_stateless_numbers'),
    sa.CheckConstraint('(normalized_min IS NULL OR (normalized_min >= 0 AND normalized_min <= 100)) AND (normalized_max IS NULL OR (normalized_max >= 0 AND normalized_max <= 100)) AND (normalized_nominal IS NULL OR (normalized_nominal >= 0 AND normalized_nominal <= 100))', name='ck_material_composition_percent_range'),
    sa.CheckConstraint('NOT (is_balance AND is_missing)', name='ck_material_composition_balance_or_missing'),
    sa.CheckConstraint('is_balance OR is_missing OR normalized_min IS NOT NULL OR normalized_max IS NOT NULL OR normalized_nominal IS NOT NULL', name='ck_material_composition_has_number'),
    sa.CheckConstraint('normalized_min IS NULL OR normalized_max IS NULL OR normalized_min <= normalized_max', name='ck_material_composition_min_le_max'),
    sa.CheckConstraint('normalized_nominal IS NULL OR ((normalized_min IS NULL OR normalized_nominal >= normalized_min) AND (normalized_max IS NULL OR normalized_nominal <= normalized_max))', name='ck_material_composition_nominal_in_range'),
    sa.ForeignKeyConstraint(['material_id'], ['material.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['source_id'], ['source.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('material_id', 'element', name='uq_material_composition_element')
    )
    with op.batch_alter_table('material_composition', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_material_composition_element'), ['element'], unique=False)
        batch_op.create_index(batch_op.f('ix_material_composition_material_id'), ['material_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_material_composition_source_id'), ['source_id'], unique=False)
        batch_op.create_index('uq_material_composition_one_balance', ['material_id'], unique=True, sqlite_where=sa.text('is_balance'), postgresql_where=sa.text('is_balance'))

    op.create_table('material_designation',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('material_id', sa.Integer(), nullable=False),
    sa.Column('system', sa.Enum('UNS', 'AISI_SAE', 'ASTM', 'EN', 'ISO', 'DIN', 'JIS', 'GB', 'ABNT', 'COMERCIAL', name='designationsystem', native_enum=False, length=16), nullable=False),
    sa.Column('code', sa.String(length=120), nullable=False),
    sa.Column('code_key', sa.String(length=120), nullable=False),
    sa.Column('region', sa.String(length=80), nullable=True),
    sa.Column('source_id', sa.Integer(), nullable=False),
    sa.Column('citation', sa.String(length=500), nullable=True),
    sa.Column('is_demo', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("code_key <> ''", name='ck_material_designation_code_not_blank'),
    sa.ForeignKeyConstraint(['material_id'], ['material.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['source_id'], ['source.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('material_id', 'system', 'code_key', name='uq_material_designation_code')
    )
    with op.batch_alter_table('material_designation', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_material_designation_code_key'), ['code_key'], unique=False)
        batch_op.create_index(batch_op.f('ix_material_designation_material_id'), ['material_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_material_designation_source_id'), ['source_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_material_designation_system'), ['system'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('material_designation', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_material_designation_system'))
        batch_op.drop_index(batch_op.f('ix_material_designation_source_id'))
        batch_op.drop_index(batch_op.f('ix_material_designation_material_id'))
        batch_op.drop_index(batch_op.f('ix_material_designation_code_key'))

    op.drop_table('material_designation')
    with op.batch_alter_table('material_composition', schema=None) as batch_op:
        batch_op.drop_index('uq_material_composition_one_balance', sqlite_where=sa.text('is_balance'), postgresql_where=sa.text('is_balance'))
        batch_op.drop_index(batch_op.f('ix_material_composition_source_id'))
        batch_op.drop_index(batch_op.f('ix_material_composition_material_id'))
        batch_op.drop_index(batch_op.f('ix_material_composition_element'))

    op.drop_table('material_composition')
