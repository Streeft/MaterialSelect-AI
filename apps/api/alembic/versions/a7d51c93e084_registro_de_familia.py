"""registro de familia

P1-4 (browse): `applications` e `characteristics` em `material_class` e em
`process_class`.

Até aqui uma pasta da taxonomia era um **rótulo** — nome, slug e pai. O passo de
navegação do método faz outra pergunta ("o que *é* esta família, e onde ela é
usada?"), e rótulo não responde. Estes dois campos são a resposta, e são texto
livre de propósito: nada aqui é comparado, convertido, ranqueado ou plotado.

**Sem backfill, pelo mesmo motivo do P0-4 e do P1-2:** a informação é nova.
Nenhuma pasta já gravada tem esse texto, e NULL é o valor honesto para todas —
quer dizer "ninguém escreveu", que é diferente de "não se aplica" e diferente de
vazio. A interface renderiza essa ausência com rótulo escrito (D-24), que é o que
impede o NULL de virar um painel vazio que o leitor tem de interpretar.

As duas tabelas mudam juntas porque a assimetria seria pior que a duplicação: o
D-57 deu ao universo de processos a mesma taxonomia que o de materiais
justamente para que os dois respondessem às mesmas perguntas.

Revision ID: a7d51c93e084
Revises: f2b6d0e39c47
Create Date: 2026-09-13T16:05:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7d51c93e084'
down_revision: Union[str, None] = 'f2b6d0e39c47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


#: As duas tabelas e as duas colunas, numa lista só, para a ida e a volta não
#: poderem discordar sobre o que foi acrescentado.
_TABLES = ("material_class", "process_class")
_COLUMNS = ("applications", "characteristics")


def upgrade() -> None:
    for table in _TABLES:
        with op.batch_alter_table(table, schema=None) as batch_op:
            for name in _COLUMNS:
                batch_op.add_column(sa.Column(name, sa.String(length=1000), nullable=True))


def downgrade() -> None:
    for table in reversed(_TABLES):
        with op.batch_alter_table(table, schema=None) as batch_op:
            for name in reversed(_COLUMNS):
                batch_op.drop_column(name)
