"""selection universe

P0-3 (o estudo escolhe o universo do resultado): `selection_study.universe` e
`selection_stage.material_class_slugs`.

Até aqui todo estudo devolvia **materiais**. O exercício 11 do manual seleciona
processos — a tabela de resultado é o universo de processos, e um estágio
alcança o de materiais ("Insert Material Universe > Polymers > Thermoplastic").
Sem uma coluna dizendo qual universo o estudo devolve, a pergunta não existe;
inferi-la dos estágios deixaria um estudo de pipeline vazio sem universo nenhum.

`material_class_slugs` guarda **pastas** da taxonomia de materiais, e só pastas:
`material` não tem slug para nomear uma folha, e o próprio exercício seleciona
uma pasta.

Aditiva no molde do M6/P0-1/P0-2: as colunas nascem nullable, recebem o valor
honesto no backfill — `"material"` e `[]` — e só então viram NOT NULL. Todo
estudo salvo antes disto continua devolvendo materiais e avaliando igual.

Revision ID: c9f3a17b6e42
Revises: b7e2d9c4a105
Create Date: 2026-09-10T18:40:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9f3a17b6e42'
down_revision: Union[str, None] = 'b7e2d9c4a105'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("selection_study", schema=None) as batch_op:
        batch_op.add_column(sa.Column("universe", sa.String(length=10), nullable=True))

    with op.batch_alter_table("selection_stage", schema=None) as batch_op:
        batch_op.add_column(sa.Column("material_class_slugs", sa.JSON(), nullable=True))

    _backfill()

    with op.batch_alter_table("selection_study", schema=None) as batch_op:
        batch_op.alter_column("universe", existing_type=sa.String(length=10), nullable=False)

    with op.batch_alter_table("selection_stage", schema=None) as batch_op:
        batch_op.alter_column("material_class_slugs", existing_type=sa.JSON(), nullable=False)


def _backfill() -> None:
    """Todo estudo já salvo devolve materiais, e nenhum estágio já salvo é de
    material.

    ``"material"`` aqui não é um padrão escolhido por conveniência: é o que
    esses estudos de fato fazem, e continuarão fazendo depois desta migration.
    """
    bind = op.get_bind()
    study = sa.table("selection_study", sa.column("universe", sa.String()))
    stage = sa.table("selection_stage", sa.column("material_class_slugs", sa.JSON()))
    bind.execute(study.update().values(universe="material"))
    bind.execute(stage.update().values(material_class_slugs=[]))


def downgrade() -> None:
    with op.batch_alter_table("selection_stage", schema=None) as batch_op:
        batch_op.drop_column("material_class_slugs")

    with op.batch_alter_table("selection_study", schema=None) as batch_op:
        batch_op.drop_column("universe")
