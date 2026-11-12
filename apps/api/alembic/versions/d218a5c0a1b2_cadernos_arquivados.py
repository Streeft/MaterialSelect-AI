"""cadernos arquivados

Revision ID: d218a5c0a1b2
Revises: 4947c5b5057d
Create Date: 2026-11-12 14:37:20.835563
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "d218a5c0a1b2"
down_revision: Union[str, None] = "4947c5b5057d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:

    with op.batch_alter_table("notebook", schema=None) as batch_op:
        batch_op.add_column(sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:

    with op.batch_alter_table("notebook", schema=None) as batch_op:
        batch_op.drop_column("archived_at")
