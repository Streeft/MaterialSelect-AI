"""Monkey-patch do seed original para incluir materiais estendidos.

Este módulo é importado pelo conftest.py e pelo __main__ do seed para
registrar os 70 materiais adicionais sem modificar o arquivo original
de 95 KB.

Uso:
    import app.db.seed_patch  # noqa: F401  — efeito colateral: decora seed()
    from app.db.seed import seed
    seed(db)  # agora semeia os 5 originais + 70 estendidos
"""

from __future__ import annotations

import functools

from sqlalchemy.orm import Session

import app.db.seed as _seed_mod
from app.db.seed_extended import seed_extended_materials

_original_seed = _seed_mod.seed


@functools.wraps(_original_seed)
def _patched_seed(db: Session) -> dict[str, int]:
    """Executa o seed original e depois semeia os materiais estendidos."""
    summary = _original_seed(db)

    # O seed original faz commit() no final; os materiais estendidos
    # precisam da mesma fonte demo para manter consistência.
    from sqlalchemy import select

    from app.models.source import Source

    demo_source = (
        db.execute(
            select(Source).where(
                Source.label == _seed_mod.SOURCES[0]["label"]
            )
        )
        .scalars()
        .one_or_none()
    )
    if demo_source is None:
        return summary

    extended_created = seed_extended_materials(db, demo_source)
    db.commit()

    summary["extended_materials_created"] = extended_created
    return summary


# Aplica o patch
_seed_mod.seed = _patched_seed
