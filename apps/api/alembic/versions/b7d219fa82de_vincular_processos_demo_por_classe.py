"""vincular processos demo aos materiais por classe

Revision ID: b7d219fa82de
Revises: 4dbd71e64b6b
Create Date: 2026-10-06 19:35:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7d219fa82de"
down_revision: str | None = "4dbd71e64b6b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Mapeamento de classe de material para processos de conformação e manufatura compatíveis
CLASS_PROCESS_MAP = {
    "metais": [
        "fundicao-areia",
        "forjamento",
        "extrusao",
        "usinagem-convencional",
        "solda-mig",
        "anodizacao",
        "parafusamento",
        "pintura",
    ],
    "polimeros": [
        "moldagem-injecao",
        "extrusao",
        "adesivagem",
        "pintura",
    ],
    "ceramicas": [
        "prensagem-sinterizacao",
        "retificacao",
    ],
    "compositos": [
        "moldagem-compressao",
        "usinagem-convencional",
        "adesivagem",
        "pintura",
    ],
    "elastomeros": [
        "moldagem-compressao",
        "moldagem-injecao",
        "extrusao",
        "adesivagem",
    ],
}


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Buscar processos por slug
    processes = conn.execute(
        sa.text("SELECT id, slug FROM process WHERE is_active = true OR is_active = 1")
    ).fetchall()
    proc_by_slug = {row[1]: row[0] for row in processes}

    # 2. Buscar materiais com os slugs de suas classes
    materials = conn.execute(
        sa.text(
            """
            SELECT m.id, c.slug
            FROM material m
            JOIN material_class c ON m.class_id = c.id
            WHERE m.is_active = true OR m.is_active = 1
            """
        )
    ).fetchall()

    # 3. Vínculos já existentes
    existing_links = conn.execute(
        sa.text("SELECT material_id, process_id FROM material_process")
    ).fetchall()
    existing_set = set(existing_links)

    # 4. Inserir vínculos que faltam
    for mat_id, class_slug in materials:
        target_slugs = CLASS_PROCESS_MAP.get(class_slug, [])
        for p_slug in target_slugs:
            proc_id = proc_by_slug.get(p_slug)
            if proc_id is None:
                continue
            pair = (mat_id, proc_id)
            if pair not in existing_set:
                conn.execute(
                    sa.text(
                        "INSERT INTO material_process (material_id, process_id) VALUES (:m, :p)"
                    ),
                    {"m": mat_id, "p": proc_id},
                )
                existing_set.add(pair)


def downgrade() -> None:
    # A vinculação é aditiva de dados relacionais; o downgrade não apaga associações
    # para não quebrar referências ou auditorias existentes.
    pass
