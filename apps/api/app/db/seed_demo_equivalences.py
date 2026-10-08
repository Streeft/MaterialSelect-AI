"""Equivalências declaradas fictícias entre designações demo (D-115, TM1).

⚠️  Dados exclusivamente demonstrativos. Não utilizar em projetos reais.

Existe para a seção "Equivalências" da ficha ter o que mostrar enquanto não há
fonte aprovada que publique equivalências (``docs/catalogo/fontes.md``). Cada
grupo liga designações que **já existem** como demo (``DEMO-…``), tem tipo e
fonte, e é gravado com ``is_demo=True`` — e a fonte também é a fonte demo, então
nenhuma linha daqui pode ser lida como afirmação de uma norma real.

O que estes grupos **não** são: uma tabela de correspondência de ligas. Os
códigos são inventados e a correspondência entre eles também; nenhum grupo
afirma que um material demo *é* a liga que o nome lembra. Dois materiais demo
que compartilham um código parecido nem por isso estão em grupo — só entram
os que estão listados aqui, de propósito.

Chamado por ``python -m app.db.seed_extended``, o módulo que ``semear_demo`` e
``scripts/seed.ps1`` executam (docs/15). ``clear_demo`` apaga os grupos pela
própria coluna ``is_demo``. Idempotente por (fonte, citação) do grupo.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.designation import designation_key, resolve_system
from app.models.enums import EquivalenceKind
from app.models.equivalence import EquivalenceGroup, EquivalenceMember
from app.models.material import Material
from app.models.material_designation import MaterialDesignation
from app.models.source import Source

DEMO_SOURCE_LABEL = "Dataset Demo MaterialSelect"
CITATION_PREFIX = "Tabela fictícia de equivalências"

#: (tipo, citação, observação, [(material, "NORMA:código"), …])
DEMO_GROUPS: tuple[tuple[EquivalenceKind, str, str | None, tuple[tuple[str, str], ...]], ...] = (
    (
        EquivalenceKind.EQUIVALENTE,
        f"{CITATION_PREFIX}, linha 1",
        None,
        (
            ("Aço Inoxidável 316L", "AISI_SAE:DEMO-316L"),
            ("Aço Inoxidável 316L", "UNS:DEMO-S31603"),
            ("Aço Inoxidável 316L", "EN:DEMO-1.4404"),
        ),
    ),
    (
        EquivalenceKind.EQUIVALENTE,
        f"{CITATION_PREFIX}, linha 2",
        None,
        (
            ("Aço Demo B", "AISI_SAE:DEMO-304"),
            ("Aço Demo B", "UNS:DEMO-S001"),
        ),
    ),
    (
        EquivalenceKind.APROXIMADA,
        f"{CITATION_PREFIX}, linha 3",
        "Faixas de composição fictícias que não coincidem por inteiro.",
        (
            ("Liga Alumínio Demo A", "ABNT:DEMO-AL-61"),
            ("Liga de Alumínio 6061-T6", "ABNT:DEMO-6061-T6"),
        ),
    ),
    (
        EquivalenceKind.SIMILAR,
        f"{CITATION_PREFIX}, linha 4",
        "Mesma família de uso; a fonte fictícia não declara equivalência.",
        (
            ("Aço Carbono 1045", "AISI_SAE:DEMO-1045"),
            ("Aço Estrutural A36", "ASTM:DEMO-A36"),
        ),
    ),
    (
        EquivalenceKind.EQUIVALENTE,
        f"{CITATION_PREFIX}, linha 5",
        None,
        (
            ("Ferro Fundido Cinzento FC250", "ISO:DEMO-250"),
            ("Ferro Fundido Cinzento FC250", "ABNT:DEMO-FC250"),
        ),
    ),
)


def _find_designation(db: Session, material_name: str, spec: str) -> MaterialDesignation:
    system_name, _, code = spec.partition(":")
    row = (
        db.execute(
            select(MaterialDesignation)
            .join(Material, Material.id == MaterialDesignation.material_id)
            .where(Material.name == material_name)
            .where(MaterialDesignation.system == resolve_system(system_name))
            .where(MaterialDesignation.code_key == designation_key(code))
        )
        .scalars()
        .one_or_none()
    )
    if row is None:
        raise RuntimeError(
            f"Designação demo ausente para a equivalência: {material_name} / {spec}. "
            "Rode antes `python -m app.db.seed` e o início de `app.db.seed_extended`."
        )
    return row


def seed_demo_equivalences(db: Session, source: Source | None = None) -> dict[str, int]:
    """Create the demo equivalence groups. Idempotent; returns ``equivalence_groups_created``."""
    if source is None:
        source = db.execute(select(Source).where(Source.label == DEMO_SOURCE_LABEL)).scalar_one()
    created = 0
    for kind, citation, note, members in DEMO_GROUPS:
        exists = db.execute(
            select(EquivalenceGroup.id).where(
                EquivalenceGroup.source_id == source.id, EquivalenceGroup.citation == citation
            )
        ).first()
        if exists:
            continue
        designations = [_find_designation(db, material, spec) for material, spec in members]
        db.add(
            EquivalenceGroup(
                kind=kind,
                source_id=source.id,
                citation=citation,
                note=note,
                is_demo=True,
                members=[EquivalenceMember(designation_id=d.id) for d in designations],
            )
        )
        created += 1
    db.flush()
    return {"equivalence_groups_created": created}
