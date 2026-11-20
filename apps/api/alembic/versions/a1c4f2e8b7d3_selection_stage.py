"""selection_stage

P0-1 (seleção multiestágio): introduz ``SelectionStage``, a lista ordenada de
estágios de um estudo. Até aqui um estudo carregava *uma* árvore de restrições,
e tudo que a metodologia faz combinando estágios — um estágio de limites
estreitando o que um estágio de árvore admitiu, desabilitar o estágio 2 para
ver o efeito, apagar o estágio 3 e manter os outros — não tinha onde morar.

O backfill dá a cada estudo já existente **exatamente um** estágio ``limit``
habilitado, na posição 0, e reaponta para ele o grupo raiz que a migration do
M6 já havia criado, mais todos os grupos aninhados daquele estudo. Um estudo
salvo antes desta migration continua avaliando exatamente como antes: o que era
"uma árvore de restrições" agora é "um estágio de limites com essa mesma
árvore".

``selection_constraint_group.stage_id`` nasce nullable e só vira NOT NULL
depois do backfill — mesma ordem que a migration do M6 usou para ``group_id``,
e pela mesma razão: criar a tabela, adicionar a coluna nullable, preencher via
SQL cru, só então travar NOT NULL. Fazer diferente falha contra um banco com
estudos já salvos.

Revision ID: a1c4f2e8b7d3
Revises: 6845a9523f17
Create Date: 2026-09-09 14:20:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c4f2e8b7d3'
down_revision: Union[str, None] = '6845a9523f17'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "selection_stage",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("study_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("class_slugs", sa.JSON(), nullable=False),
        sa.Column("include_descendants", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["study_id"], ["selection_study.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("selection_stage", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_selection_stage_study_id"), ["study_id"], unique=False
        )

    with op.batch_alter_table("selection_constraint_group", schema=None) as batch_op:
        batch_op.add_column(sa.Column("stage_id", sa.Integer(), nullable=True))
        batch_op.create_index(
            batch_op.f("ix_selection_constraint_group_stage_id"), ["stage_id"], unique=False
        )
        batch_op.create_foreign_key(
            "fk_selection_constraint_group_stage_id_selection_stage",
            "selection_stage",
            ["stage_id"],
            ["id"],
            ondelete="CASCADE",
        )

    _backfill_stages()

    with op.batch_alter_table("selection_constraint_group", schema=None) as batch_op:
        batch_op.alter_column("stage_id", existing_type=sa.Integer(), nullable=False)


def _backfill_stages() -> None:
    """Um estágio ``limit`` habilitado por estudo já existente; todos os grupos
    daquele estudo — raiz e aninhados — reapontados para ele.

    Em SQL cru de propósito: isto descreve o banco neste ponto do tempo, e não
    chama código de aplicação que pode mudar amanhã.
    """
    bind = op.get_bind()

    study = sa.table("selection_study", sa.column("id", sa.Integer()))
    # `sa.Table` de verdade, com `primary_key=True` explícito: só uma `Column`
    # real devolve `inserted_primary_key`, que cada grupo precisa antes de ser
    # reapontado. Mesma razão da migration do M6.
    stage_table = sa.Table(
        "selection_stage",
        sa.MetaData(),
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("study_id", sa.Integer()),
        sa.Column("position", sa.Integer()),
        sa.Column("kind", sa.String()),
        sa.Column("label", sa.String()),
        sa.Column("enabled", sa.Boolean()),
        sa.Column("class_slugs", sa.JSON()),
        sa.Column("include_descendants", sa.Boolean()),
    )
    group = sa.table(
        "selection_constraint_group",
        sa.column("id", sa.Integer()),
        sa.column("study_id", sa.Integer()),
        sa.column("stage_id", sa.Integer()),
    )

    studies = bind.execute(sa.select(study.c.id)).all()
    for row in studies:
        new_stage_id = bind.execute(
            stage_table.insert().values(
                study_id=row.id,
                position=0,
                kind="limit",
                label=None,
                enabled=True,
                class_slugs=[],
                include_descendants=True,
            )
        ).inserted_primary_key[0]
        bind.execute(
            group.update().where(group.c.study_id == row.id).values(stage_id=new_stage_id)
        )


def downgrade() -> None:
    with op.batch_alter_table("selection_constraint_group", schema=None) as batch_op:
        batch_op.drop_constraint(
            "fk_selection_constraint_group_stage_id_selection_stage",
            type_="foreignkey",
        )
        batch_op.drop_index(batch_op.f("ix_selection_constraint_group_stage_id"))
        batch_op.drop_column("stage_id")

    with op.batch_alter_table("selection_stage", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_selection_stage_study_id"))

    op.drop_table("selection_stage")
