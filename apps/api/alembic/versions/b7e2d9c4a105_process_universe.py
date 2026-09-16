"""process universe

P0-2 (universo de processos): introduz ``ProcessClass``, ``Process`` e a
associação N–N ``material_process``, e dá ao estágio de seleção o terceiro tipo
que essa associação torna possível — o estágio de processo.

Até aqui o catálogo tinha um universo só, materiais, então um estágio de árvore
só podia ser "filtre por pasta". A pergunta que o método faz é uma **junção
entre tabelas**: *que materiais este processo conforma*, *que processos unem
estes materiais*. Sem uma segunda tabela e um vínculo explícito, ela não tem
onde ser feita.

Três tabelas novas e duas colunas novas. As colunas nascem nullable, recebem
``[]`` no backfill e só então viram NOT NULL — mesma ordem das migrations do M6
e do P0-1, e pela mesma razão: um banco que já tem estágios salvos recusaria a
coluna NOT NULL sem default. Um estágio salvo antes desta migration continua
sendo exatamente o que era: as duas listas vazias não descrevem processo nenhum,
e ``kind`` continua ``limit`` ou ``tree``.

Nenhum dado de processo é semeado aqui — a migration descreve o schema, e o
universo demonstrativo (fictício e marcado com ``is_demo``) vem de
``app.db.seed``.

Revision ID: b7e2d9c4a105
Revises: a1c4f2e8b7d3
Create Date: 2026-09-09 22:40:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7e2d9c4a105'
down_revision: Union[str, None] = 'a1c4f2e8b7d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "process_class",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["parent_id"], ["process_class.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
        sa.UniqueConstraint("slug"),
    )

    op.create_table(
        "process",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("slug", sa.String(length=160), nullable=False),
        sa.Column("class_id", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=1000), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_demo", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["class_id"], ["process_class.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    with op.batch_alter_table("process", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_process_name"), ["name"], unique=False)
        batch_op.create_index(batch_op.f("ix_process_class_id"), ["class_id"], unique=False)

    op.create_table(
        "material_process",
        sa.Column("material_id", sa.Integer(), nullable=False),
        sa.Column("process_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["material_id"], ["material.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["process_id"], ["process.id"], ondelete="CASCADE"),
        # A chave composta é o que torna o par único: um material não pode estar
        # ligado duas vezes ao mesmo processo.
        sa.PrimaryKeyConstraint("material_id", "process_id"),
    )
    with op.batch_alter_table("material_process", schema=None) as batch_op:
        # Só do lado do processo: `material_id` já é a coluna à frente da chave
        # composta, e o outro sentido da junção é que precisa de índice.
        batch_op.create_index(
            batch_op.f("ix_material_process_process_id"), ["process_id"], unique=False
        )

    with op.batch_alter_table("selection_stage", schema=None) as batch_op:
        batch_op.add_column(sa.Column("process_slugs", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("process_class_slugs", sa.JSON(), nullable=True))

    _backfill_stage_process_columns()

    with op.batch_alter_table("selection_stage", schema=None) as batch_op:
        batch_op.alter_column("process_slugs", existing_type=sa.JSON(), nullable=False)
        batch_op.alter_column("process_class_slugs", existing_type=sa.JSON(), nullable=False)


def _backfill_stage_process_columns() -> None:
    """Lista vazia em todo estágio já salvo — nenhum deles é de processo.

    Pelas colunas tipadas do SQLAlchemy, e não por ``'[]'`` em SQL cru, para que
    o driver serialize o JSON do jeito de cada banco (SQLite guarda texto,
    Postgres guarda ``json``).
    """
    bind = op.get_bind()
    stage = sa.table(
        "selection_stage",
        sa.column("process_slugs", sa.JSON()),
        sa.column("process_class_slugs", sa.JSON()),
    )
    bind.execute(stage.update().values(process_slugs=[], process_class_slugs=[]))


def downgrade() -> None:
    with op.batch_alter_table("selection_stage", schema=None) as batch_op:
        batch_op.drop_column("process_class_slugs")
        batch_op.drop_column("process_slugs")

    with op.batch_alter_table("material_process", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_material_process_process_id"))
    op.drop_table("material_process")

    with op.batch_alter_table("process", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_process_class_id"))
        batch_op.drop_index(batch_op.f("ix_process_name"))
    op.drop_table("process")

    op.drop_table("process_class")
