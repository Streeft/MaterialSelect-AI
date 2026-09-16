"""busca na base de conhecimento

Duas mudancas, uma por via de recuperacao.

`knowledge_chunk.search_text` guarda o texto dobrado (minusculas, sem
diacriticos) para a via lexica: o lower() do SQLite nao mexe em acento, entao
sem essa coluna uma busca por "resistencia" nao alcancaria "resistencia" com
acento sem ler o corpus inteiro para dentro do Python. Vem com backfill: uma
coluna nova preenchida com string vazia deixaria todo trecho ja indexado
invisivel a busca sem que nada dissesse isso.

A funcao que dobra o texto esta *copiada* aqui de proposito, e nao importada de
`app/knowledge/lexical.py`. Uma migration descreve o banco num ponto do tempo;
se ela chamasse o codigo da aplicacao, mudar a regra de dobra amanha mudaria o
que esta revisao fez ontem.

`knowledge_embedding` guarda o vetor de cada trecho para a via semantica, em
tabela separada porque vetor e opcional e tem ciclo de vida proprio — trocar o
modelo invalida todo vetor sem invalidar nenhum trecho.

O autogenerate tambem detectou de novo a mudanca de indice em `subscription`
(unique=False -> True), vinda de trabalho de cobranca ainda nao commitado.
Removida daqui pelo mesmo motivo da revisao anterior: nao e desta migration.

Revision ID: f6482f1969e3
Revises: 84eee98176f8
Create Date: 2026-08-23 20:26:20.387667
"""
from __future__ import annotations

import unicodedata
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6482f1969e3'
down_revision: Union[str, None] = '84eee98176f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

#: Linhas por lote no backfill. Um livro-texto rende milhares de trechos de ~1
#: KB; ler todos de uma vez colocaria o corpus inteiro na memoria da migration.
_BATCH = 500


def _fold(text: str) -> str:
    """Minusculas sem diacriticos — copia congelada de app.knowledge.lexical."""
    decomposed = unicodedata.normalize("NFKD", text.lower())
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def upgrade() -> None:
    op.create_table('knowledge_embedding',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('chunk_id', sa.Integer(), nullable=False),
    sa.Column('model', sa.String(length=120), nullable=False),
    sa.Column('dimensions', sa.Integer(), nullable=False),
    sa.Column('vector', sa.LargeBinary(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['chunk_id'], ['knowledge_chunk.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('chunk_id')
    )

    # server_default para que as linhas existentes tenham valor no momento em
    # que a coluna passa a ser NOT NULL; retirado logo abaixo, para que o padrao
    # continue sendo o do modelo e o autogenerate nao volte a acusar diferenca.
    with op.batch_alter_table('knowledge_chunk', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('search_text', sa.Text(), nullable=False, server_default='')
        )

    _backfill_search_text()

    with op.batch_alter_table('knowledge_chunk', schema=None) as batch_op:
        batch_op.alter_column('search_text', server_default=None)


def _backfill_search_text() -> None:
    """Preenche `search_text` a partir de `text`, em lotes."""
    connection = op.get_bind()
    chunk = sa.table(
        'knowledge_chunk',
        sa.column('id', sa.Integer),
        sa.column('text', sa.Text),
        sa.column('search_text', sa.Text),
    )

    last_id = 0
    while True:
        rows = connection.execute(
            sa.select(chunk.c.id, chunk.c.text)
            .where(chunk.c.id > last_id)
            .order_by(chunk.c.id)
            .limit(_BATCH)
        ).all()
        if not rows:
            break
        for row in rows:
            connection.execute(
                chunk.update().where(chunk.c.id == row.id).values(search_text=_fold(row.text or ''))
            )
        last_id = rows[-1].id


def downgrade() -> None:
    with op.batch_alter_table('knowledge_chunk', schema=None) as batch_op:
        batch_op.drop_column('search_text')

    op.drop_table('knowledge_embedding')
