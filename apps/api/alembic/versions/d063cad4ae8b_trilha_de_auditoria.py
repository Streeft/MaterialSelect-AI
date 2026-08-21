"""trilha de auditoria

Cria ``audit_event`` (M2 em docs/TODO.md): quem mudou o quê e quando, para
materiais, classes, propriedades, índices de desempenho e estudos de seleção
— as entidades que uma pessoa edita à mão pelos serviços de catálogo e
seleção. Materiais criados em lote pela importação não passam por aqui
(``ImportService`` monta ``Material`` diretamente, sem os métodos públicos de
``MaterialService``); o próprio ``ImportJob`` já é a trilha daquele fluxo.

``project_id`` é um retrato do projeto dono do estudo no momento do evento —
só usado quando ``entity_type = SELECTION_STUDY`` (índice e materiais são
catálogo compartilhado, sem dono). Não é uma junção viva: depois que um estudo
é excluído, ``entity_id`` deixa de resolver a qualquer linha, e um filtro de
privacidade por junção quebraria em silêncio bem na hora em que mais importa
— auditar a própria exclusão.

Tabela nova, sem dado a migrar: não havia nenhuma auditoria antes disto.

Revision ID: d063cad4ae8b
Revises: c82422c12c1d
Create Date: 2026-08-21 04:38:27.071052
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "d063cad4ae8b"
down_revision: Union[str, None] = "c82422c12c1d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "audit_event",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("user_email", sa.String(length=320), nullable=False),
        sa.Column(
            "entity_type",
            sa.Enum(
                "MATERIAL",
                "MATERIAL_CLASS",
                "PROPERTY_DEFINITION",
                "PERFORMANCE_INDEX",
                "SELECTION_STUDY",
                name="auditentitytype",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("entity_label", sa.String(length=200), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=True),
        sa.Column(
            "action",
            sa.Enum(
                "CRIADO",
                "ATUALIZADO",
                "EXCLUIDO",
                name="auditaction",
                native_enum=False,
                length=12,
            ),
            nullable=False,
        ),
        sa.Column("changes", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("audit_event", schema=None) as batch_op:
        batch_op.create_index("ix_audit_event_created_at", ["created_at"], unique=False)
        batch_op.create_index("ix_audit_event_entity", ["entity_type", "entity_id"], unique=False)
        batch_op.create_index(
            batch_op.f("ix_audit_event_project_id"), ["project_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_audit_event_user_id"), ["user_id"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("audit_event", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_audit_event_user_id"))
        batch_op.drop_index(batch_op.f("ix_audit_event_project_id"))
        batch_op.drop_index("ix_audit_event_entity")
        batch_op.drop_index("ix_audit_event_created_at")

    op.drop_table("audit_event")
