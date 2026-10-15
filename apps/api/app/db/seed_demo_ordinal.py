"""Propriedades ordinais fictícias e seus níveis nos materiais demo (D-126).

⚠️  Dados exclusivamente demonstrativos. Não utilizar em projetos reais.

Existe para o critério "nível mínimo aceito" da Seleção (exercício 8, passo 2)
ter o que filtrar enquanto nenhuma fonte aprovada publica durabilidade por agente
(``docs/catalogo/fontes.md``). Duas definições **fictícias** — o próprio nome diz
"(demo)" — com uma escala genérica de cinco níveis, e um nível por material demo.

O que estes níveis **não** são: uma afirmação sobre a durabilidade de qualquer
material real. Saem de um hash estável do nome do material (sem regra por
família, sem RNG), citam a fonte demo e a nota "Valor fictício de
demonstração". Um a cada sete pares fica **registrado como ausente** de
propósito, para a tela mostrar o quarto estado (D-24) e o funil mostrar que
ausência não passa.

Só escreve em material ``is_demo=True``; definição e valor também se declaram
``is_demo`` na própria linha, e ``clear_demo`` apaga os dois. Chamado por
``python -m app.db.seed_extended`` (o comando de ``semear_demo`` e de
``scripts/seed.ps1``, docs/15). Idempotente pelo slug e pelo par
(material, definição).
"""

from __future__ import annotations

import hashlib

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.ordinal import validate_scale
from app.models.enums import DataQuality
from app.models.material import Material
from app.models.ordinal_property import (
    MaterialOrdinalValue,
    OrdinalPropertyDefinition,
    OrdinalScaleLevel,
)
from app.models.source import Source

DEMO_NOTE = "Valor fictício de demonstração"

#: Escala genérica, pior primeiro. É estrutura, não dado: não diz nada de material.
DEMO_SCALE = ("Muito pobre", "Pobre", "Aceitável", "Bom", "Excelente")

#: (slug, nome, descrição)
DEMO_DEFINITIONS: tuple[tuple[str, str, str], ...] = (
    (
        "durabilidade-agua-doce-demo",
        "Durabilidade em água doce (demo)",
        "Propriedade ordinal fictícia de demonstração (D-126): nível de resistência "
        "ao agente, numa escala de cinco níveis. Nenhum valor é real.",
    ),
    (
        "durabilidade-radiacao-uv-demo",
        "Durabilidade à radiação UV (demo)",
        "Propriedade ordinal fictícia de demonstração (D-126): nível de resistência "
        "ao agente, numa escala de cinco níveis. Nenhum valor é real.",
    ),
)

#: Um em ``MISSING_EVERY`` pares é gravado como ausente — o quarto estado.
MISSING_EVERY = 7


def demo_level(material_name: str, slug: str) -> int | None:
    """Rank fictício e determinístico para o par, ou None (registrado ausente)."""
    digest = int(hashlib.sha256(f"{slug}|{material_name}".encode()).hexdigest(), 16)
    if digest % MISSING_EVERY == 0:
        return None
    return (digest // MISSING_EVERY) % len(DEMO_SCALE)


def _ensure_definition(db: Session, slug: str, name: str, description: str):
    existing = db.execute(
        select(OrdinalPropertyDefinition).where(OrdinalPropertyDefinition.slug == slug)
    ).scalar_one_or_none()
    if existing is not None:
        return existing, False
    definition = OrdinalPropertyDefinition(
        slug=slug, name=name, description=description, is_demo=True
    )
    definition.levels = [
        OrdinalScaleLevel(rank=rank, label=label)
        for rank, label in enumerate(validate_scale(DEMO_SCALE))
    ]
    db.add(definition)
    db.flush()
    return definition, True


def seed_demo_ordinals(db: Session, source: Source) -> dict[str, int]:
    """Cria as definições demo e um nível (ou ausência) por material demo."""
    counts = {"ordinal_definitions_created": 0, "ordinal_values_created": 0}
    materials = list(
        db.execute(select(Material).where(Material.is_demo.is_(True)).order_by(Material.name))
        .scalars()
        .all()
    )
    for slug, name, description in DEMO_DEFINITIONS:
        definition, created = _ensure_definition(db, slug, name, description)
        counts["ordinal_definitions_created"] += int(created)
        by_rank = {level.rank: level for level in definition.levels}
        already = set(
            db.execute(
                select(MaterialOrdinalValue.material_id).where(
                    MaterialOrdinalValue.definition_id == definition.id
                )
            ).scalars()
        )
        for material in materials:
            if material.id in already:
                continue
            rank = demo_level(material.name, slug)
            db.add(
                MaterialOrdinalValue(
                    material_id=material.id,
                    definition_id=definition.id,
                    level_id=None if rank is None else by_rank[rank].id,
                    is_missing=rank is None,
                    source_id=source.id,
                    data_quality=DataQuality.ESTIMADO,
                    notes=DEMO_NOTE,
                    is_demo=True,
                )
            )
            counts["ordinal_values_created"] += 1
    db.flush()
    return counts
