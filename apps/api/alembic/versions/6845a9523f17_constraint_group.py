"""constraint_group

M6 (restrições aninhadas): introduz ``ConstraintGroup``, um nó de árvore
booleana AND/OR sobre as restrições de um estudo. Até aqui um estudo
combinava suas restrições sob um único operador global
(``selection_study.combinator``); esta migration cria, para cada estudo já
existente, exatamente um ``ConstraintGroup`` raiz (``parent_group_id NULL``)
com o mesmo operador, e reaponta cada ``selection_constraint`` daquele estudo
para esse grupo via a nova coluna ``group_id``. Um estudo salvo antes desta
migration continua avaliando exatamente como antes: o que era "combinator
aplicado sobre uma lista plana de restrições" agora é o mesmo AND/OR lido do
único grupo raiz do estudo. Aninhar um grupo dentro de outro (uma tarefa
futura) é como "(A E B) OU (C E D)" será expresso: dois grupos-filho de um
grupo raiz OU, cada um um grupo E sobre suas próprias restrições.

``group_id`` nasce nullable nesta mesma migration e só vira NOT NULL depois
do backfill — a ordem importa: criar a tabela, adicionar a coluna nullable,
preencher via SQL cru, só então travar NOT NULL. Fazer diferente falha contra
um banco com estudos já salvos.

Revision ID: 6845a9523f17
Revises: f8c93a1d8844
Create Date: 2026-09-01 12:16:47.425280
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6845a9523f17'
down_revision: Union[str, None] = 'f8c93a1d8844'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "selection_constraint_group",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("study_id", sa.Integer(), nullable=False),
        sa.Column("parent_group_id", sa.Integer(), nullable=True),
        sa.Column("operator", sa.String(length=3), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["parent_group_id"], ["selection_constraint_group.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["study_id"], ["selection_study.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("selection_constraint_group", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_selection_constraint_group_parent_group_id"),
            ["parent_group_id"],
            unique=False,
        )
        batch_op.create_index(
            batch_op.f("ix_selection_constraint_group_study_id"), ["study_id"], unique=False
        )

    # `group_id` starts nullable: every pre-existing `selection_constraint`
    # row has none yet, and only the backfill below can give it one. The
    # model declares `nullable=False` — that describes steady state, not
    # every intermediate step of this migration.
    with op.batch_alter_table("selection_constraint", schema=None) as batch_op:
        batch_op.add_column(sa.Column("group_id", sa.Integer(), nullable=True))
        batch_op.create_index(
            batch_op.f("ix_selection_constraint_group_id"), ["group_id"], unique=False
        )
        batch_op.create_foreign_key(
            "fk_selection_constraint_group_id_selection_constraint_group",
            "selection_constraint_group",
            ["group_id"],
            ["id"],
            ondelete="CASCADE",
        )

    _backfill_root_groups()

    with op.batch_alter_table("selection_constraint", schema=None) as batch_op:
        batch_op.alter_column("group_id", existing_type=sa.Integer(), nullable=False)


def _backfill_root_groups() -> None:
    """One root ``ConstraintGroup`` per existing study, operator = that
    study's ``combinator``; every constraint of that study is repointed at
    the new group. Runs entirely in raw SQL — this describes the database at
    this point in time, not by calling into application code that could
    change tomorrow.
    """
    bind = op.get_bind()

    study = sa.table(
        "selection_study",
        sa.column("id", sa.Integer()),
        sa.column("combinator", sa.String()),
    )
    # A real `sa.Table` with an explicit `primary_key=True`, not the lighter
    # `sa.table()` — only a real `Column` reports back `inserted_primary_key`,
    # which each study's new root group needs before the constraints can be
    # repointed at it.
    group_table = sa.Table(
        "selection_constraint_group",
        sa.MetaData(),
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("study_id", sa.Integer()),
        sa.Column("parent_group_id", sa.Integer()),
        sa.Column("operator", sa.String()),
        sa.Column("position", sa.Integer()),
    )
    constraint = sa.table(
        "selection_constraint",
        sa.column("id", sa.Integer()),
        sa.column("study_id", sa.Integer()),
        sa.column("group_id", sa.Integer()),
    )

    studies = bind.execute(sa.select(study.c.id, study.c.combinator)).all()
    for row in studies:
        new_group_id = bind.execute(
            group_table.insert().values(
                study_id=row.id,
                parent_group_id=None,
                operator=row.combinator,
                position=0,
            )
        ).inserted_primary_key[0]
        bind.execute(
            constraint.update()
            .where(constraint.c.study_id == row.id)
            .values(group_id=new_group_id)
        )


def downgrade() -> None:
    with op.batch_alter_table("selection_constraint", schema=None) as batch_op:
        batch_op.drop_constraint(
            "fk_selection_constraint_group_id_selection_constraint_group",
            type_="foreignkey",
        )
        batch_op.drop_index(batch_op.f("ix_selection_constraint_group_id"))
        batch_op.drop_column("group_id")

    with op.batch_alter_table("selection_constraint_group", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_selection_constraint_group_study_id"))
        batch_op.drop_index(batch_op.f("ix_selection_constraint_group_parent_group_id"))

    op.drop_table("selection_constraint_group")
