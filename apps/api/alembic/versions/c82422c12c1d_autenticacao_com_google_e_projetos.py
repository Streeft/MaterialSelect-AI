"""autenticacao com google e projetos

A API era totalmente aberta (D-18 em docs/DECISIONS.md): sem usuário, sem
sessão, sem dono de nada. Esta migration cria os três modelos de A5 —
``user``, ``project``, ``user_session`` — e faz ``selection_study`` passar a
pertencer a um ``project``.

A unicidade de nome de estudo, que era global (``UNIQUE (name)``, sem nome
explícito na migration original — SQLite a registrou como
``sqlite_autoindex_selection_study_1``, confirmado por inspeção antes de
escrever isto), vira por projeto: dois usuários — ou, no futuro, dois
projetos do mesmo usuário — podem ter cada um um estudo chamado "Estudo 1".

Nenhuma base já hospedada existe ainda (é justamente a decisão que destrava
esta fase), mas um banco de desenvolvimento pode ter estudos sem dono. Em vez
de derrubá-los, esta migration cria um usuário e um projeto "legado" — um
marcador sem login real possível (não existe conta Google com esse `sub`) —
e realoca para lá qualquer ``selection_study`` órfão antes de tornar
``project_id`` obrigatório.

Revision ID: c82422c12c1d
Revises: fa369b7bbbde
Create Date: 2026-08-13 18:15:33.604573
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "c82422c12c1d"
down_revision: Union[str, None] = "fa369b7bbbde"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_LEGACY_GOOGLE_SUB = "legado:c82422c12c1d"


def upgrade() -> None:
    bind = op.get_bind()

    op.create_table(
        "user",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("google_sub", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("avatar_url", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("google_sub"),
    )

    op.create_table(
        "project",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("project", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_project_owner_id"), ["owner_id"], unique=False)

    op.create_table(
        "user_session",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("user_session", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_user_session_user_id"), ["user_id"], unique=False)

    # --- selection_study: adiciona project_id, migra órfãos, fecha a brecha ---
    op.add_column("selection_study", sa.Column("project_id", sa.Integer(), nullable=True))

    # `sa.Table` with an explicit `primary_key=True`, not the lighter
    # `sa.table()`/`sa.column()` — only a real `Column` reports back
    # `inserted_primary_key`, which the legacy project/study backfill needs.
    _metadata = sa.MetaData()
    user_table = sa.Table(
        "user",
        _metadata,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("google_sub", sa.String()),
        sa.Column("email", sa.String()),
        sa.Column("name", sa.String()),
        sa.Column("avatar_url", sa.String()),
        sa.Column("created_at", sa.DateTime()),
    )
    project_table = sa.Table(
        "project",
        _metadata,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String()),
        sa.Column("owner_id", sa.Integer()),
        sa.Column("created_at", sa.DateTime()),
    )
    selection_study_table = sa.table(
        "selection_study",
        sa.column("id", sa.Integer()),
        sa.column("project_id", sa.Integer()),
    )

    has_orphans = bind.execute(
        sa.select(sa.func.count())
        .select_from(selection_study_table)
        .where(selection_study_table.c.project_id.is_(None))
    ).scalar_one()

    if has_orphans:
        now = datetime.now(UTC)
        legacy_user_id = bind.execute(
            user_table.insert().values(
                google_sub=_LEGACY_GOOGLE_SUB,
                email="legado@local.invalid",
                name="Dados legados",
                avatar_url=None,
                created_at=now,
            )
        ).inserted_primary_key[0]
        legacy_project_id = bind.execute(
            project_table.insert().values(
                name="Projeto legado",
                owner_id=legacy_user_id,
                created_at=now,
            )
        ).inserted_primary_key[0]
        bind.execute(
            selection_study_table.update()
            .where(selection_study_table.c.project_id.is_(None))
            .values(project_id=legacy_project_id)
        )

    # `batch_op.drop_constraint` can only target a *named* constraint, and the
    # original `UNIQUE (name)` was never given one — SQLAlchemy reflects it
    # back with `name=None` (confirmed by inspection), which the public API
    # has no way to address. `copy_from` sidesteps reflection entirely: batch
    # mode rebuilds the table from this definition instead of the live one,
    # so a constraint simply not declared here never makes it into the copy.
    _pre_migration_selection_study = sa.Table(
        "selection_study",
        sa.MetaData(),
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(length=1000), nullable=True),
        sa.Column("function_text", sa.String(length=1000), nullable=True),
        sa.Column("objective_text", sa.String(length=1000), nullable=True),
        sa.Column("free_variables", sa.JSON(), nullable=False),
        sa.Column("combinator", sa.String(length=3), nullable=False),
        sa.Column("index_name", sa.String(length=160), nullable=True),
        sa.Column("index_expression", sa.String(length=500), nullable=True),
        sa.Column("index_goal", sa.String(length=10), nullable=True),
        sa.Column("normalization", sa.String(length=10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=True),
    )
    with op.batch_alter_table(
        "selection_study",
        schema=None,
        copy_from=_pre_migration_selection_study,
        recreate="always",
    ) as batch_op:
        batch_op.alter_column("project_id", existing_type=sa.Integer(), nullable=False)
        batch_op.create_index(
            batch_op.f("ix_selection_study_project_id"), ["project_id"], unique=False
        )
        batch_op.create_foreign_key(
            "fk_selection_study_project_id_project",
            "project",
            ["project_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_unique_constraint(
            "uq_selection_study_project_name", ["project_id", "name"]
        )


def downgrade() -> None:
    # Downgrade drops project_id entirely rather than resurrecting the
    # original unnamed UNIQUE(name) — a study whose name collided with
    # another project's would have no well-defined single winner to keep.
    with op.batch_alter_table("selection_study", schema=None) as batch_op:
        batch_op.drop_constraint("uq_selection_study_project_name", type_="unique")
        batch_op.drop_constraint("fk_selection_study_project_id_project", type_="foreignkey")
        batch_op.drop_index(batch_op.f("ix_selection_study_project_id"))
        batch_op.drop_column("project_id")
        batch_op.create_unique_constraint("uq_selection_study_name", ["name"])

    with op.batch_alter_table("user_session", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_user_session_user_id"))
    op.drop_table("user_session")

    with op.batch_alter_table("project", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_project_owner_id"))
    op.drop_table("project")

    op.drop_table("user")
