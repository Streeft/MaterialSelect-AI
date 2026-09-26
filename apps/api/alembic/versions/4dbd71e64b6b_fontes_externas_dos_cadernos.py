"""Fontes externas dos cadernos (D-97): `notebook_source.meta` e `ai_usage.fetches`.

Duas colunas, aditivas, e nenhuma linha reescrita.

* ``notebook_source.meta`` é JSON anulável: de onde uma fonte externa veio e em
  que termos (URL, licença, atribuição, autoria, revisão…). ``NULL`` é o que
  toda fonte da fase 1 já é — arquivo, texto, ficha, estudo não têm nada a
  atribuir —, então não há backfill.
* ``ai_usage.fetches`` conta as requisições que saíram do servidor atrás de uma
  fonte externa. ``NOT NULL`` com ``server_default '0'``, e o padrão **fica**
  (ao contrário de ``ebf6d9eb737a``, que o retira): o modelo o declara também,
  então a autogeração não acusa diferença, e durante um deploy a máquina que
  ainda roda o código anterior continua inserindo linhas de cota sem conhecer a
  coluna — sem o padrão no banco, essa inserção violaria o ``NOT NULL``.

Os tipos novos de fonte (``site``, ``youtube``, ``artigo``, ``wikipedia``) não
pedem nada aqui: ``notebook_source.kind`` é ``String(16)`` sem ``CHECK``.

``batch_alter_table`` no modo padrão (``auto``): no PostgreSQL vira ``ALTER
TABLE`` simples; no SQLite o ``add_column`` também, e só o ``drop_column`` do
downgrade recria a tabela — sem ``recreate="always"``, que no PostgreSQL seria
``DROP TABLE`` (``docs/CLAUDE.md`` §10).

Revision ID: 4dbd71e64b6b
Revises: 5c753e177520
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4dbd71e64b6b"
down_revision: str | None = "5c753e177520"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("notebook_source", schema=None) as batch_op:
        batch_op.add_column(sa.Column("meta", sa.JSON(), nullable=True))

    with op.batch_alter_table("ai_usage", schema=None) as batch_op:
        batch_op.add_column(sa.Column("fetches", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    with op.batch_alter_table("ai_usage", schema=None) as batch_op:
        batch_op.drop_column("fetches")

    with op.batch_alter_table("notebook_source", schema=None) as batch_op:
        batch_op.drop_column("meta")
