"""process attributes

P0-4 (processo passa a ter atributo): `process_attribute_definition` e
`process_attribute_value`.

Até aqui um processo era nome, família e um conjunto de vínculos. O passo 2 do
exercício 11 do manual é um Limit Stage sobre atributos do processo — forma,
faixa de massa, espessura de seção, característica do processo, lote econômico
—, e nenhum deles existia; era também a razão escrita pela qual um estudo de
processos recusava ranqueamento (D-58).

Duas tabelas novas e nenhuma coluna alterada, então **não há backfill**: não
existe registro anterior cujo valor precise ser decidido. É o primeiro P0 em que
isso vale, e vale exatamente porque a informação é nova — um processo que não
tem atributo cadastrado continua não tendo, e a regra de que não se seleciona
sobre dado ausente é o que dá a resposta certa para ele sem que a migração
invente nada.

`process_attribute_value` guarda o trilho de unidades inteiro, igual a
`material_property_value`, mais `normalized_min`/`normalized_max`: num envelope
de capacidade são os **limites** que respondem ao critério, e o ponto médio é
apenas representativo.

Revision ID: d4a8c1f70b93
Revises: c9f3a17b6e42
Create Date: 2026-09-10T20:05:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4a8c1f70b93'
down_revision: Union[str, None] = 'c9f3a17b6e42'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "process_attribute_definition",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("slug", sa.String(length=160), nullable=False),
        sa.Column("symbol", sa.String(length=32), nullable=True),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column(
            "kind",
            sa.Enum(
                "ESCALAR",
                "ENVELOPE",
                "DISCRETO",
                name="processattributekind",
                native_enum=False,
                length=10,
            ),
            nullable=False,
        ),
        sa.Column("physical_dimension", sa.String(length=120), nullable=False),
        sa.Column("canonical_unit", sa.String(length=60), nullable=True),
        sa.Column("accepted_units", sa.JSON(), nullable=False),
        sa.Column("allowed_labels", sa.JSON(), nullable=False),
        sa.Column(
            "better_direction",
            sa.Enum(
                "HIGHER",
                "LOWER",
                "NEUTRAL",
                name="betterdirection",
                native_enum=False,
                length=10,
            ),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
        # Um atributo discreto não tem unidade, e um numérico não pode estar sem
        # ela — o trilho de unidades é o ponto. No banco porque uma definição
        # com unidade *e* rótulos, ou sem nenhuma das duas, deixa todo valor
        # abaixo dela ilegível: o motor não saberia por qual regra comparar.
        sa.CheckConstraint(
            "(kind = 'DISCRETO') = (canonical_unit IS NULL)",
            name="ck_process_attribute_definition_unit_by_kind",
        ),
    )

    op.create_table(
        "process_attribute_value",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("process_id", sa.Integer(), nullable=False),
        sa.Column("attribute_id", sa.Integer(), nullable=False),
        sa.Column("value_scalar", sa.Float(), nullable=True),
        sa.Column("value_min", sa.Float(), nullable=True),
        sa.Column("value_max", sa.Float(), nullable=True),
        sa.Column("value_typical", sa.Float(), nullable=True),
        sa.Column("labels", sa.JSON(), nullable=False),
        sa.Column("original_unit", sa.String(length=60), nullable=True),
        sa.Column("normalized_value", sa.Float(), nullable=True),
        sa.Column("normalized_min", sa.Float(), nullable=True),
        sa.Column("normalized_max", sa.Float(), nullable=True),
        sa.Column("canonical_unit", sa.String(length=60), nullable=True),
        sa.Column("conversion_method", sa.String(length=120), nullable=True),
        sa.Column("uncertainty", sa.Float(), nullable=True),
        sa.Column("measurement_condition", sa.String(length=200), nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("source_id", sa.Integer(), nullable=True),
        sa.Column(
            "data_quality",
            sa.Enum(
                "MEDIDO",
                "IMPORTADO",
                "ESTIMADO",
                name="dataquality",
                native_enum=False,
                length=12,
            ),
            nullable=False,
        ),
        sa.Column("is_missing", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["attribute_id"], ["process_attribute_definition.id"]
        ),
        sa.ForeignKeyConstraint(["process_id"], ["process.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_id"], ["source.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "process_id", "attribute_id", name="uq_process_attribute_value_pair"
        ),
    )
    # `process_id` não ganha índice próprio: é a coluna que abre
    # uq_process_attribute_value_pair, que já serve toda busca por processo.
    op.create_index(
        op.f("ix_process_attribute_value_attribute_id"),
        "process_attribute_value",
        ["attribute_id"],
    )
    op.create_index(
        op.f("ix_process_attribute_value_source_id"),
        "process_attribute_value",
        ["source_id"],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_process_attribute_value_source_id"),
        table_name="process_attribute_value",
    )
    op.drop_index(
        op.f("ix_process_attribute_value_attribute_id"),
        table_name="process_attribute_value",
    )
    op.drop_table("process_attribute_value")
    op.drop_table("process_attribute_definition")
