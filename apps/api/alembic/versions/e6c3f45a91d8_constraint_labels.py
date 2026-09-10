"""constraint labels

P0-4, segunda parte: `selection_constraint.labels`.

A restrição discreta (`has_any_label` / `has_no_label`) nomeia rótulos de um
atributo de processo, e um estudo salvo tem de conseguir guardá-los. Coluna
própria e não `class_slugs` reaproveitada: slug de classe e rótulo de atributo
são espaços de nomes diferentes, e uma lista só deixaria o leitor adivinhando o
que cada entrada nomeia.

Aditiva no molde do M6/P0-1/P0-2/P0-3: nasce nullable, recebe `[]` no backfill —
nenhuma restrição já salva é discreta, porque o operador não existia — e só então
vira NOT NULL.

Revision ID: e6c3f45a91d8
Revises: d4a8c1f70b93
Create Date: 2026-09-10T20:40:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e6c3f45a91d8'
down_revision: Union[str, None] = 'd4a8c1f70b93'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("selection_constraint", schema=None) as batch_op:
        batch_op.add_column(sa.Column("labels", sa.JSON(), nullable=True))

    _backfill()

    with op.batch_alter_table("selection_constraint", schema=None) as batch_op:
        batch_op.alter_column("labels", existing_type=sa.JSON(), nullable=False)


def _backfill() -> None:
    """Nenhuma restrição já salva nomeia rótulo, porque o operador que os nomeia
    não existia antes desta revisão.

    `[]` aqui é o valor honesto e não um padrão de conveniência: é o que essas
    restrições de fato dizem sobre rótulos — nada.
    """
    bind = op.get_bind()
    constraint = sa.table("selection_constraint", sa.column("labels", sa.JSON()))
    bind.execute(constraint.update().values(labels=[]))


def downgrade() -> None:
    with op.batch_alter_table("selection_constraint", schema=None) as batch_op:
        batch_op.drop_column("labels")
