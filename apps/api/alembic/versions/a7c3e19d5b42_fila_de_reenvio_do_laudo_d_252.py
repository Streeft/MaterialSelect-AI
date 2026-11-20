"""fila de reenvio do laudo por e-mail (D-252)

Três colunas em ``report_delivery`` para o envio que falhou por um motivo passageiro e
espera a próxima tentativa: ``attempts`` (quantas vezes o servidor tentou entregar a
mensagem), ``next_attempt_at`` (quando a fila tenta de novo; só tem valor com status
``na_fila``) e ``reply_to`` (o ``Reply-To`` pedido, para a nova tentativa escrever o mesmo
cabeçalho). Aditiva: as linhas existentes ficam com ``attempts = 1`` (todas foram uma
tentativa só) e os outros dois campos vazios. Descer apaga só as colunas novas.

Revision ID: a7c3e19d5b42
Revises: e62aba5c6884
Create Date: 2026-11-19 17:10:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "a7c3e19d5b42"
down_revision: Union[str, None] = "e62aba5c6884"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("report_delivery", schema=None) as batch_op:
        batch_op.add_column(sa.Column("attempts", sa.Integer(), server_default="1", nullable=False))
        batch_op.add_column(sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("reply_to", sa.String(length=320), nullable=True))
        batch_op.create_index(
            batch_op.f("ix_report_delivery_next_attempt_at"), ["next_attempt_at"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("report_delivery", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_report_delivery_next_attempt_at"))
        batch_op.drop_column("reply_to")
        batch_op.drop_column("next_attempt_at")
        batch_op.drop_column("attempts")
