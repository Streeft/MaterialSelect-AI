"""Script e migração para vincular processos demo aos materiais de teste.

Vincula automaticamente processos de conformação e fabricação aos materiais
de acordo com a classe de material (metais, polímeros, cerâmicas, compósitos,
elastômeros), garantindo que todo material — seja ele do seed estendido,
criado pelo usuário ou importado — disponha de processos compatíveis com
propriedades completas para uso imediato no Eco Audit e no Dimensionador de Custo.

Idempotente: pares (material_id, process_id) já existentes não são duplicados.

Execução manual::

    python -m app.db.link_demo_processes
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import Base, SessionLocal, engine
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.process import MaterialProcess, Process

#: Mapeamento padrão de classe de material para slugs de processos compatíveis.
#: Prioriza processos com dados ambientais completos (energia-processo, co2-processo,
#: fracao-refugo) para viabilizar diretamente o Eco Audit.
DEFAULT_CLASS_PROCESS_MAP: dict[str, list[str]] = {
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


def link_demo_processes(
    db: Session,
    *,
    material_ids: list[int] | None = None,
    only_active: bool = True,
) -> dict[str, int]:
    """Vincula processos compatíveis aos materiais baseando-se em suas classes.

    Args:
        db: Sessão SQLAlchemy ativa.
        material_ids: Opcional. Lista restrita de IDs de materiais a vincular.
                      Se None, aplica a todos os materiais correspondentes.
        only_active: Se True, considera apenas materiais com is_active=True.

    Returns:
        Um dicionário com métricas da execução:
        - materials_evaluated: quantidade de materiais avaliados.
        - links_created: quantidade de novos vínculos criados.
        - links_skipped: quantidade de vínculos já existentes ignorados.
    """
    # 1. Mapear processos ativos indexados por slug
    stmt_proc = select(Process).where(Process.is_active.is_(True))
    all_procs = db.execute(stmt_proc).scalars().all()
    proc_by_slug: dict[str, Process] = {p.slug: p for p in all_procs}

    # 2. Consultar materiais com suas respectivas classes
    stmt_mat = select(Material, MaterialClass.slug).join(
        MaterialClass, Material.class_id == MaterialClass.id
    )
    if only_active:
        stmt_mat = stmt_mat.where(Material.is_active.is_(True))
    if material_ids is not None:
        stmt_mat = stmt_mat.where(Material.id.in_(material_ids))

    materials_with_class = db.execute(stmt_mat).all()

    # 3. Conjunto de vínculos existentes para checagem rápida em memória
    existing_links_set = set(
        db.execute(select(MaterialProcess.material_id, MaterialProcess.process_id)).all()
    )

    created_count = 0
    skipped_count = 0

    for material, class_slug in materials_with_class:
        target_slugs = DEFAULT_CLASS_PROCESS_MAP.get(class_slug, [])
        for p_slug in target_slugs:
            process = proc_by_slug.get(p_slug)
            if process is None:
                continue

            pair = (material.id, process.id)
            if pair in existing_links_set:
                skipped_count += 1
                continue

            db.add(MaterialProcess(material_id=material.id, process_id=process.id))
            existing_links_set.add(pair)
            created_count += 1

    db.flush()
    return {
        "materials_evaluated": len(materials_with_class),
        "links_created": created_count,
        "links_skipped": skipped_count,
    }


def main() -> None:
    """CLI entry point: executa a vinculação idempotente."""
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        stats = link_demo_processes(db)
        db.commit()

    print("[link_demo_processes] Vinculação de processos aos materiais concluída:")
    print(f"  Materiais avaliados: {stats['materials_evaluated']}")
    print(f"  Novos vínculos criados: {stats['links_created']}")
    print(f"  Vínculos já existentes (preservados): {stats['links_skipped']}")


if __name__ == "__main__":
    main()
