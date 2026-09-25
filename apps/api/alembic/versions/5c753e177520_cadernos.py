"""Cadernos (D-90): cadernos privados, fontes, trechos, conversa, notas e cota.

Oito tabelas novas e nenhuma coluna tocada nas existentes. Os trechos dos
cadernos ficam **fora** de `knowledge_chunk` de propósito: a busca do Cérebro
não tem dono, e um trecho privado ali apareceria na resposta de outra pessoa.

O autogenerate também propôs as duas mudanças não relacionadas de sempre (a
unicidade de `ix_subscription_user_id` e a reexpressão do índice único de
`battery_chemistry.slug`), deixadas de fora como no `e093efe5e1c8`.

Revision ID: 5c753e177520
Revises: e093efe5e1c8
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5c753e177520"
down_revision: str | None = "e093efe5e1c8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ai_usage",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("requests", sa.Integer(), nullable=False),
        sa.Column("artifacts", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "day", name="uq_ai_usage_user_day"),
    )
    with op.batch_alter_table("ai_usage", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_ai_usage_user_id"), ["user_id"], unique=False)

    op.create_table(
        "notebook",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("emoji", sa.String(length=16), nullable=False),
        sa.Column("summary", sa.JSON(), nullable=True),
        sa.Column("suggested_questions", sa.JSON(), nullable=True),
        sa.Column("chat_goal", sa.String(length=16), nullable=False),
        sa.Column("chat_instructions", sa.Text(), nullable=True),
        sa.Column("response_length", sa.String(length=8), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("notebook", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_notebook_owner_id"), ["owner_id"], unique=False)

    op.create_table(
        "notebook_message",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("notebook_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=12), nullable=False),
        sa.Column("content", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["notebook_id"], ["notebook.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("notebook_message", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_notebook_message_notebook_id"), ["notebook_id"], unique=False
        )

    op.create_table(
        "notebook_note",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("notebook_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("origin", sa.String(length=12), nullable=False),
        sa.Column("citations", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["notebook_id"], ["notebook.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("notebook_note", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_notebook_note_notebook_id"), ["notebook_id"], unique=False
        )

    op.create_table(
        "notebook_source",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("notebook_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("origin", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("error", sa.String(length=500), nullable=True),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column("char_count", sa.Integer(), nullable=False),
        sa.Column("page_count", sa.Integer(), nullable=True),
        sa.Column("selected", sa.Boolean(), nullable=False),
        sa.Column("truncated", sa.Boolean(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["notebook_id"], ["notebook.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("notebook_source", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_notebook_source_notebook_id"), ["notebook_id"], unique=False
        )

    op.create_table(
        "studio_artifact",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("notebook_id", sa.Integer(), nullable=False),
        sa.Column("tool", sa.String(length=32), nullable=False),
        sa.Column("format", sa.String(length=32), nullable=True),
        sa.Column("template", sa.String(length=64), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("options", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("content", sa.JSON(), nullable=True),
        sa.Column("source_ids", sa.JSON(), nullable=True),
        sa.Column("error", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["notebook_id"], ["notebook.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("studio_artifact", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_studio_artifact_notebook_id"), ["notebook_id"], unique=False
        )

    op.create_table(
        "notebook_chunk",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("page_start", sa.Integer(), nullable=True),
        sa.Column("page_end", sa.Integer(), nullable=True),
        sa.Column("heading", sa.String(length=300), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("search_text", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["source_id"], ["notebook_source.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_id", "ordinal", name="uq_notebook_chunk_position"),
    )
    with op.batch_alter_table("notebook_chunk", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_notebook_chunk_source_id"), ["source_id"], unique=False
        )

    op.create_table(
        "notebook_embedding",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("chunk_id", sa.Integer(), nullable=False),
        sa.Column("model", sa.String(length=120), nullable=False),
        sa.Column("dimensions", sa.Integer(), nullable=False),
        sa.Column("vector", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["chunk_id"], ["notebook_chunk.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("chunk_id"),
    )


def downgrade() -> None:
    op.drop_table("notebook_embedding")
    with op.batch_alter_table("notebook_chunk", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_notebook_chunk_source_id"))

    op.drop_table("notebook_chunk")
    with op.batch_alter_table("studio_artifact", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_studio_artifact_notebook_id"))

    op.drop_table("studio_artifact")
    with op.batch_alter_table("notebook_source", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_notebook_source_notebook_id"))

    op.drop_table("notebook_source")
    with op.batch_alter_table("notebook_note", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_notebook_note_notebook_id"))

    op.drop_table("notebook_note")
    with op.batch_alter_table("notebook_message", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_notebook_message_notebook_id"))

    op.drop_table("notebook_message")
    with op.batch_alter_table("notebook", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_notebook_owner_id"))

    op.drop_table("notebook")
    with op.batch_alter_table("ai_usage", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_ai_usage_user_id"))

    op.drop_table("ai_usage")
