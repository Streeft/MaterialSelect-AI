"""chart stage

P1-2 (o Chart Stage filtra): as colunas do quarto tipo de estágio.

O terceiro tipo de estágio do método — depois de Limit e Tree — é o gráfico que
**reprova**: a caixa desenhada sobre um plano, e a linha iso-índice deslizada até
isolar os candidatos. Até aqui o gráfico mostrava e não selecionava.

**Sem backfill, e pelo mesmo motivo do P0-4:** a informação é nova. Nenhum estágio
já salvo é de gráfico, e NULL é o valor honesto para todos eles.

Toda coluna nasce anulável e **fica** anulável, o que não é a frouxidão que
parece: NULL quer dizer "sem limite", e 0 é um limite. Uma caixa aberta de um lado
é coisa que se desenha — "tudo acima de 100 GPa" não devia ter de inventar um
teto —, então limite ausente e limite zero têm de continuar distinguíveis. É a
mesma regra que o princípio 3 enuncia para valor de propriedade.

Cada eixo é *ou* uma propriedade cadastrada *ou* uma expressão de índice, em duas
colunas e não uma, porque slug e expressão são espaços de nomes diferentes que se
sobrepõem: `densidade` também é expressão válida. A `CheckConstraint` faz o banco
concordar — e só para o estágio de gráfico, porque nos outros quatro tipos essas
colunas ficam NULL e um valor perdido ali é recusado pelo serviço e lido por
ninguém.

Revision ID: f2b6d0e39c47
Revises: e6c3f45a91d8
Create Date: 2026-09-11T14:10:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2b6d0e39c47'
down_revision: Union[str, None] = 'e6c3f45a91d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


#: Nome → tipo das onze colunas do payload, para a ida e a volta não poderem
#: discordar sobre quais são.
_CHART_COLUMNS: list[tuple[str, sa.types.TypeEngine]] = [
    ("chart_x_slug", sa.String(length=160)),
    ("chart_x_expression", sa.String(length=500)),
    ("chart_y_slug", sa.String(length=160)),
    ("chart_y_expression", sa.String(length=500)),
    ("chart_x_min", sa.Float()),
    ("chart_x_max", sa.Float()),
    ("chart_y_min", sa.Float()),
    ("chart_y_max", sa.Float()),
    ("chart_index_expression", sa.String(length=500)),
    ("chart_index_goal", sa.String(length=10)),
    ("chart_index_level", sa.Float()),
]

_AXES_CHECK = (
    "kind <> 'chart' OR ("
    "((chart_x_slug IS NULL) <> (chart_x_expression IS NULL))"
    " AND ((chart_y_slug IS NULL) <> (chart_y_expression IS NULL)))"
)


def upgrade() -> None:
    with op.batch_alter_table("selection_stage", schema=None) as batch_op:
        for name, type_ in _CHART_COLUMNS:
            batch_op.add_column(sa.Column(name, type_, nullable=True))
        batch_op.create_check_constraint("ck_selection_stage_chart_axes", _AXES_CHECK)


def downgrade() -> None:
    with op.batch_alter_table("selection_stage", schema=None) as batch_op:
        batch_op.drop_constraint("ck_selection_stage_chart_axes", type_="check")
        for name, _ in reversed(_CHART_COLUMNS):
            batch_op.drop_column(name)
