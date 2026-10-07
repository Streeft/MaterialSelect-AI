"""Curvas de material: figura, séries e pontos ordenados (D-106, TM4).

Três tabelas novas, nenhuma coluna mexida e nenhum backfill: um material sem
linha em ``material_curve`` está "sem curva cadastrada", e não tem uma curva
vazia nem um ponto zero (D-24).

Os CHECKs repetem no banco o que ``app.domain.curves`` confere linha a linha,
porque o seed, o importador oficial e uma migração futura escrevem aqui sem
passar pelo serviço: grandeza de eixo da lista fixa; trilha do parâmetro inteira
ou nenhuma; números finitos escritos como ``col > -1e308 AND col < 1e308`` (a
forma que recusa ±Infinity e NaN tanto no PostgreSQL quanto no SQLite, sem o
literal ``'Infinity'`` que só um deles lê); faixa com os dois lados ou nenhum, e
contendo a linha; posição não negativa e única por série/curva; identidade
externa (dataset, id externo, hash) inteira ou nenhuma, e única por dataset.

A lista de grandezas está escrita por extenso de propósito: uma migração não
importa código da aplicação, que pode mudar depois dela.

O autogenerate também propôs mexer em ``battery_chemistry`` e ``subscription``
(a mesma deriva antiga entre modelos e migrações que o D-105 registrou, alheia a
este item); essas linhas foram retiradas desta revisão.

Revision ID: 0925e0787863
Revises: 0d3c39eb2f81
Create Date: 2026-10-07
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0925e0787863'
down_revision: Union[str, None] = '0d3c39eb2f81'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('material_curve',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('material_id', sa.Integer(), nullable=False),
    sa.Column('kind', sa.Enum('TENSAO_DEFORMACAO', 'TEMPERATURA', 'TAXA', 'FADIGA', 'FLUENCIA', name='curvekind', native_enum=False, length=20), nullable=False),
    sa.Column('title', sa.String(length=240), nullable=False),
    sa.Column('description', sa.String(length=1000), nullable=True),
    sa.Column('x_quantity', sa.String(length=32), nullable=False),
    sa.Column('y_quantity', sa.String(length=32), nullable=False),
    sa.Column('x_label', sa.String(length=160), nullable=True),
    sa.Column('y_label', sa.String(length=160), nullable=True),
    sa.Column('x_original_unit', sa.String(length=40), nullable=False),
    sa.Column('y_original_unit', sa.String(length=40), nullable=False),
    sa.Column('x_canonical_unit', sa.String(length=40), nullable=False),
    sa.Column('y_canonical_unit', sa.String(length=40), nullable=False),
    sa.Column('x_conversion_method', sa.String(length=120), nullable=False),
    sa.Column('y_conversion_method', sa.String(length=120), nullable=False),
    sa.Column('parameter_quantity', sa.String(length=32), nullable=True),
    sa.Column('source_id', sa.Integer(), nullable=False),
    sa.Column('citation', sa.String(length=500), nullable=True),
    sa.Column('data_quality', sa.Enum('MEDIDO', 'IMPORTADO', 'ESTIMADO', name='dataquality', native_enum=False, length=12), nullable=False),
    sa.Column('is_demo', sa.Boolean(), nullable=False),
    sa.Column('dataset_id', sa.Integer(), nullable=True),
    sa.Column('external_id', sa.String(length=240), nullable=True),
    sa.Column('raw_sha256', sa.String(length=64), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("parameter_quantity IS NULL OR parameter_quantity IN ('ciclos', 'deformacao', 'modulo', 'razao_tensao', 'taxa_deformacao', 'temperatura', 'tempo', 'tensao')", name='ck_material_curve_parameter_quantity'),
    sa.CheckConstraint("title <> ''", name='ck_material_curve_title_not_blank'),
    sa.CheckConstraint("x_quantity IN ('ciclos', 'deformacao', 'modulo', 'razao_tensao', 'taxa_deformacao', 'temperatura', 'tempo', 'tensao')", name='ck_material_curve_x_quantity'),
    sa.CheckConstraint("y_quantity IN ('ciclos', 'deformacao', 'modulo', 'razao_tensao', 'taxa_deformacao', 'temperatura', 'tempo', 'tensao')", name='ck_material_curve_y_quantity'),
    sa.CheckConstraint('(dataset_id IS NULL AND external_id IS NULL AND raw_sha256 IS NULL) OR (dataset_id IS NOT NULL AND external_id IS NOT NULL AND raw_sha256 IS NOT NULL)', name='ck_material_curve_external_identity'),
    sa.ForeignKeyConstraint(['dataset_id'], ['catalog_dataset.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['material_id'], ['material.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['source_id'], ['source.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('dataset_id', 'external_id', name='uq_material_curve_external')
    )
    with op.batch_alter_table('material_curve', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_material_curve_dataset_id'), ['dataset_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_material_curve_kind'), ['kind'], unique=False)
        batch_op.create_index(batch_op.f('ix_material_curve_material_id'), ['material_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_material_curve_source_id'), ['source_id'], unique=False)

    op.create_table('material_curve_series',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('curve_id', sa.Integer(), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('label', sa.String(length=160), nullable=True),
    sa.Column('conditions', sa.String(length=500), nullable=True),
    sa.Column('parameter_value', sa.Float(), nullable=True),
    sa.Column('parameter_original_unit', sa.String(length=40), nullable=True),
    sa.Column('parameter_normalized', sa.Float(), nullable=True),
    sa.Column('parameter_canonical_unit', sa.String(length=40), nullable=True),
    sa.Column('parameter_conversion_method', sa.String(length=120), nullable=True),
    sa.CheckConstraint('(parameter_value IS NULL AND parameter_original_unit IS NULL AND parameter_normalized IS NULL AND parameter_canonical_unit IS NULL AND parameter_conversion_method IS NULL) OR (parameter_value IS NOT NULL AND parameter_original_unit IS NOT NULL AND parameter_normalized IS NOT NULL AND parameter_canonical_unit IS NOT NULL AND parameter_conversion_method IS NOT NULL)', name='ck_material_curve_series_parameter_trail'),
    sa.CheckConstraint('(parameter_value IS NULL OR (parameter_value > -1e308 AND parameter_value < 1e308)) AND (parameter_normalized IS NULL OR (parameter_normalized > -1e308 AND parameter_normalized < 1e308))', name='ck_material_curve_series_parameter_finite'),
    sa.CheckConstraint('position >= 0', name='ck_material_curve_series_position'),
    sa.ForeignKeyConstraint(['curve_id'], ['material_curve.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('curve_id', 'position', name='uq_material_curve_series_position')
    )
    with op.batch_alter_table('material_curve_series', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_material_curve_series_curve_id'), ['curve_id'], unique=False)

    op.create_table('material_curve_point',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('series_id', sa.Integer(), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('x_value', sa.Float(), nullable=False),
    sa.Column('y_value', sa.Float(), nullable=False),
    sa.Column('y_min_value', sa.Float(), nullable=True),
    sa.Column('y_max_value', sa.Float(), nullable=True),
    sa.Column('x_normalized', sa.Float(), nullable=False),
    sa.Column('y_normalized', sa.Float(), nullable=False),
    sa.Column('y_min_normalized', sa.Float(), nullable=True),
    sa.Column('y_max_normalized', sa.Float(), nullable=True),
    sa.CheckConstraint('(x_value > -1e308 AND x_value < 1e308) AND (y_value > -1e308 AND y_value < 1e308) AND (x_normalized > -1e308 AND x_normalized < 1e308) AND (y_normalized > -1e308 AND y_normalized < 1e308) AND (y_min_value IS NULL OR (y_min_value > -1e308 AND y_min_value < 1e308)) AND (y_max_value IS NULL OR (y_max_value > -1e308 AND y_max_value < 1e308)) AND (y_min_normalized IS NULL OR (y_min_normalized > -1e308 AND y_min_normalized < 1e308)) AND (y_max_normalized IS NULL OR (y_max_normalized > -1e308 AND y_max_normalized < 1e308))', name='ck_material_curve_point_finite'),
    sa.CheckConstraint('(y_min_value IS NULL AND y_max_value IS NULL AND y_min_normalized IS NULL AND y_max_normalized IS NULL) OR (y_min_value IS NOT NULL AND y_max_value IS NOT NULL AND y_min_normalized IS NOT NULL AND y_max_normalized IS NOT NULL)', name='ck_material_curve_point_band_both_sides'),
    sa.CheckConstraint('position >= 0', name='ck_material_curve_point_position'),
    sa.CheckConstraint('y_min_normalized IS NULL OR (y_min_normalized <= y_normalized AND y_normalized <= y_max_normalized)', name='ck_material_curve_point_band_contains'),
    sa.ForeignKeyConstraint(['series_id'], ['material_curve_series.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('series_id', 'position', name='uq_material_curve_point_position')
    )
    with op.batch_alter_table('material_curve_point', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_material_curve_point_series_id'), ['series_id'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('material_curve_point', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_material_curve_point_series_id'))

    op.drop_table('material_curve_point')
    with op.batch_alter_table('material_curve_series', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_material_curve_series_curve_id'))

    op.drop_table('material_curve_series')
    with op.batch_alter_table('material_curve', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_material_curve_source_id'))
        batch_op.drop_index(batch_op.f('ix_material_curve_material_id'))
        batch_op.drop_index(batch_op.f('ix_material_curve_kind'))
        batch_op.drop_index(batch_op.f('ix_material_curve_dataset_id'))

    op.drop_table('material_curve')
