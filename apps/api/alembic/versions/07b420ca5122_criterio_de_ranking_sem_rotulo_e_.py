"""criterio de ranking sem rotulo e direcao fabricados

Um critério salvo sem rótulo e sem direção guardava a chave e ``"max"`` no lugar
deles. Os dois viravam dado de verdade na reexecução e passavam à frente da
fonte que deveriam apenas substituir:

- o rótulo fabricado imprimia ``__index__`` ou ``modulo_young`` no relatório,
  onde o nome do índice ou da propriedade deveria aparecer;
- a direção fabricada é pior, porque muda número: um critério salvo como
  "automático" sobre densidade — em que menor é melhor — voltava como
  maximizar e **invertia o ranking** do estudo reexecutado.

``NULL`` passa a significar "o usuário não disse", e a execução deriva a resposta
da propriedade ou do índice, como já fazia para um estudo não salvo.

O rótulo igual à chave é reposto para ``NULL``: a chave continua na coluna
``key``, então nada se perde — só se remove a cópia que atrapalhava. A direção
**não** é tocada. Não há como distinguir um ``"max"`` fabricado de um ``"max"``
escolhido, e reescrever os dois mudaria em silêncio o resultado de estudos já
salvos, que é justamente o defeito que esta migration existe para acabar. Quem
quiser a direção automática num estudo antigo pode salvá-lo de novo.

Revision ID: 07b420ca5122
Revises: bfeee728d230
Create Date: 2026-08-05 01:33:04.163218
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '07b420ca5122'
down_revision: Union[str, None] = 'bfeee728d230'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Rótulo que só repete a chave é a marca do preenchimento automático antigo.
_DROP_ECHOED_LABELS = sa.text(
    "UPDATE ranking_criterion SET label = NULL WHERE label = key"
)

# O caminho de volta recria a fabricação, porque é o que a coluna NOT NULL exige.
_REFILL_LABELS = sa.text(
    "UPDATE ranking_criterion SET label = key WHERE label IS NULL"
)
_REFILL_DIRECTIONS = sa.text(
    "UPDATE ranking_criterion SET direction = 'max' WHERE direction IS NULL"
)


def upgrade() -> None:
    with op.batch_alter_table('ranking_criterion', schema=None) as batch_op:
        batch_op.alter_column('label',
               existing_type=sa.VARCHAR(length=200),
               nullable=True)
        batch_op.alter_column('direction',
               existing_type=sa.VARCHAR(length=3),
               nullable=True)

    op.get_bind().execute(_DROP_ECHOED_LABELS)


def downgrade() -> None:
    op.get_bind().execute(_REFILL_LABELS)
    op.get_bind().execute(_REFILL_DIRECTIONS)

    with op.batch_alter_table('ranking_criterion', schema=None) as batch_op:
        batch_op.alter_column('direction',
               existing_type=sa.VARCHAR(length=3),
               nullable=False)
        batch_op.alter_column('label',
               existing_type=sa.VARCHAR(length=200),
               nullable=False)
