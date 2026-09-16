"""my records

P1-4: o espaço do usuário sobre um catálogo compartilhado.

Três coisas novas, e nenhuma delas reescreve uma linha existente:

``material.owner_id`` nasce **NULL em toda linha que já existe**, e NULL é o
catálogo compartilhado — exatamente o que o catálogo sempre foi (D-42). Não há
backfill porque não há informação a preencher: nenhum material já cadastrado é
registro próprio de ninguém, e inventar um dono seria o oposto do princípio 1.

``favorite`` e ``recent_record`` guardam um marcador por usuário. As duas
colunas de registro são anuláveis e exatamente uma é preenchida, o que a
``CheckConstraint`` faz o banco concordar — a mesma forma do eixo do Chart
Stage, que é *ou* slug *ou* expressão (D-60). O par polimórfico
``universe``/``record_id`` teria uma coluna a menos e **nenhuma chave
estrangeira**: apagar um processo deixaria um marcador apontando para nada, sem
que restrição nenhuma pudesse dizê-lo.

A unicidade é por universo, e não é redundância: o SQL trata NULLs como
distintos, então ``uq_favorite_user_material`` simplesmente não restringe as
linhas cujo ``material_id`` é NULL — que são as favoritas de processo, cobertas
pela outra.

Revision ID: b4e8a2f17c93
Revises: a7d51c93e084
Create Date: 2026-09-14T13:20:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b4e8a2f17c93'
down_revision: Union[str, None] = 'a7d51c93e084'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


#: As duas tabelas de marcador têm a mesma forma de propósito, então a ida e a
#: volta as constroem do mesmo lugar e não podem divergir.
_ONE_UNIVERSE = "(material_id IS NULL) <> (process_id IS NULL)"

_BOOKMARK_TABLES = ("favorite", "recent_record")


def _bookmark_columns() -> list[sa.Column]:
    return [
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("material_id", sa.Integer(), nullable=True),
        sa.Column("process_id", sa.Integer(), nullable=True),
    ]


def upgrade() -> None:
    with op.batch_alter_table("material", schema=None) as batch_op:
        batch_op.add_column(sa.Column("owner_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_material_owner_id_user", "user", ["owner_id"], ["id"], ondelete="CASCADE"
        )
    op.create_index("ix_material_owner_id", "material", ["owner_id"])

    op.create_table(
        "favorite",
        *_bookmark_columns(),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["material_id"], ["material.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["process_id"], ["process.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(_ONE_UNIVERSE, name="ck_favorite_one_universe"),
        sa.UniqueConstraint("user_id", "material_id", name="uq_favorite_user_material"),
        sa.UniqueConstraint("user_id", "process_id", name="uq_favorite_user_process"),
    )
    op.create_index("ix_favorite_user_id", "favorite", ["user_id"])

    op.create_table(
        "recent_record",
        *_bookmark_columns(),
        sa.Column("viewed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["material_id"], ["material.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["process_id"], ["process.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(_ONE_UNIVERSE, name="ck_recent_record_one_universe"),
        sa.UniqueConstraint("user_id", "material_id", name="uq_recent_user_material"),
        sa.UniqueConstraint("user_id", "process_id", name="uq_recent_user_process"),
    )
    op.create_index("ix_recent_record_user_id", "recent_record", ["user_id"])


def downgrade() -> None:
    for table in reversed(_BOOKMARK_TABLES):
        op.drop_index(f"ix_{table}_user_id", table_name=table)
        op.drop_table(table)

    op.drop_index("ix_material_owner_id", table_name="material")
    with op.batch_alter_table("material", schema=None) as batch_op:
        batch_op.drop_constraint("fk_material_owner_id_user", type_="foreignkey")
        batch_op.drop_column("owner_id")
