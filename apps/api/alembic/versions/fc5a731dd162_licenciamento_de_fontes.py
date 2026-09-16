"""licenciamento de fontes

Cria a procedência/licença de cada ``Source`` (M1 em docs/TODO.md):
``license_label``, ``license_url``, a sinalização explícita de conteúdo
possivelmente de terceiro (``contains_third_party_data``) e quem registrou a
fonte e quando (``reviewed_by_user_id``/``reviewed_at``) — a decisão humana
que o item do backlog exige, carimbada uma vez, no momento em que a fonte é
registrada pela primeira vez (ver ``app/importers/service.py``).

``contains_third_party_data`` ganha ``server_default=false`` porque a coluna
é NOT NULL sobre uma tabela que já pode ter linhas (a fonte de demonstração do
seed, por exemplo) — sem o default no próprio banco, o ALTER TABLE falharia
contra qualquer linha existente. O backfill de ``license_label`` da fonte de
demonstração do seed fica aqui também, para um banco de desenvolvimento já
semeado antes desta migration não ficar com a única fonte sem licença
registrada — `app/db/seed.py` já grava o rótulo certo para um banco novo.

Revision ID: fc5a731dd162
Revises: d063cad4ae8b
Create Date: 2026-08-21 12:59:25.438718
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "fc5a731dd162"
down_revision: Union[str, None] = "d063cad4ae8b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_DEMO_SOURCE_LABEL = "Dataset Demo MaterialSelect"
_DEMO_LICENSE_LABEL = "Dado fictício de demonstração — não é conteúdo de terceiro"


def upgrade() -> None:
    with op.batch_alter_table("source", schema=None) as batch_op:
        batch_op.add_column(sa.Column("license_label", sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column("license_url", sa.String(length=500), nullable=True))
        batch_op.add_column(
            sa.Column(
                "contains_third_party_data",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
        batch_op.add_column(sa.Column("reviewed_by_user_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.create_foreign_key(
            "fk_source_reviewed_by_user_id_user",
            "user",
            ["reviewed_by_user_id"],
            ["id"],
            ondelete="SET NULL",
        )

    source = sa.table(
        "source", sa.column("label", sa.String()), sa.column("license_label", sa.String())
    )
    op.execute(
        source.update()
        .where(source.c.label == _DEMO_SOURCE_LABEL)
        .values(license_label=_DEMO_LICENSE_LABEL)
    )


def downgrade() -> None:
    with op.batch_alter_table("source", schema=None) as batch_op:
        batch_op.drop_constraint("fk_source_reviewed_by_user_id_user", type_="foreignkey")
        batch_op.drop_column("reviewed_at")
        batch_op.drop_column("reviewed_by_user_id")
        batch_op.drop_column("contains_third_party_data")
        batch_op.drop_column("license_url")
        batch_op.drop_column("license_label")
