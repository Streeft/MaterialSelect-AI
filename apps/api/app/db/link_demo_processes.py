"""Vínculos material ↔ processo plausíveis, por subclasse (D-192).

Dois pontos de entrada, com contratos diferentes:

* :func:`link_demo_processes` — **só acrescenta**. Liga a qualquer material
  (inclusive um criado pelo usuário) os processos que a tabela de
  compatibilidade dá para a sua classe e subclasse. Nunca apaga nada. Serve à
  CLI e a quem quiser dar processos a um material novo.
* :func:`sync_demo_process_links` — **acerta o catálogo demo**. Para material
  demo do catálogo (``is_demo`` e sem dono): acrescenta os vínculos com processo
  demo que faltam e **remove só os vínculos demo implausíveis** — material demo
  com processo demo fora da tabela. Material real, material de usuário e
  processo real nunca são tocados. É o que o ``semear_demo`` roda, e o que
  conserta em produção as combinações que a migração ``b7d219fa82de`` gravou
  ligando só por classe (vidro com sinterização, concreto com moldagem por
  compressão…). A migração fica intocada.

A tabela é ``app.db.demo_process_compat``; os processos novos,
``app.db.process_catalog_ashby``. Idempotente: rodar duas vezes cria e remove
zero na segunda.

Execução manual::

    python -m app.db.link_demo_processes
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from sqlalchemy import delete, select, tuple_
from sqlalchemy.orm import Session

from app.db.base import Base, SessionLocal, engine
from app.db.demo_process_compat import compatible_process_slugs
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.process import MaterialProcess, Process


def link_demo_processes(
    db: Session,
    *,
    material_ids: list[int] | None = None,
    only_active: bool = True,
) -> dict[str, int]:
    """Acrescenta a cada material os processos compatíveis com a sua subclasse.

    Args:
        db: Sessão SQLAlchemy ativa.
        material_ids: Opcional. Lista restrita de IDs de materiais a vincular.
                      Se None, aplica a todos os materiais correspondentes.
        only_active: Se True, considera apenas materiais com is_active=True.

    Returns:
        ``materials_evaluated``, ``links_created`` e ``links_skipped``.
    """
    proc_by_slug = {
        p.slug: p for p in db.execute(select(Process).where(Process.is_active.is_(True))).scalars()
    }

    stmt = select(Material, MaterialClass.slug).join(
        MaterialClass, Material.class_id == MaterialClass.id
    )
    if only_active:
        stmt = stmt.where(Material.is_active.is_(True))
    if material_ids is not None:
        stmt = stmt.where(Material.id.in_(material_ids))
    materials_with_class = db.execute(stmt).all()

    existing = set(
        db.execute(select(MaterialProcess.material_id, MaterialProcess.process_id)).all()
    )

    created = 0
    skipped = 0
    for material, class_slug in materials_with_class:
        for slug in compatible_process_slugs(class_slug, material.subclass, material.name):
            process = proc_by_slug.get(slug)
            if process is None:
                continue
            pair = (material.id, process.id)
            if pair in existing:
                skipped += 1
                continue
            db.add(MaterialProcess(material_id=material.id, process_id=process.id))
            existing.add(pair)
            created += 1

    db.flush()
    return {
        "materials_evaluated": len(materials_with_class),
        "links_created": created,
        "links_skipped": skipped,
    }


def sync_demo_process_links(
    db: Session,
    *,
    material_ids: Sequence[int] | None = None,
    curated: Mapping[str, Sequence[str]] | None = None,
) -> dict[str, int]:
    """Acerta os vínculos demo do catálogo demo: acrescenta os plausíveis, tira os implausíveis.

    Escopo, sempre: material ``is_demo`` sem dono **e** processo ``is_demo``.
    ``material_ids`` restringe ainda mais (o catálogo do TCC passa os seus).

    ``curated`` é o ``MATERIAL_PROCESS_LINKS`` do seed: os cinco materiais de
    base têm um conjunto escolhido a dedo, com ausências deliberadas que a
    suíte testa ("Cerâmica Demo D" sem processo de união). Para eles nada se
    acrescenta além do escolhido; remove-se só o que não está nem no escolhido
    nem na tabela — a anodização que a migração deu ao "Aço Demo B", por
    exemplo.
    """
    if curated is None:
        from app.db.seed import MATERIAL_PROCESS_LINKS  # local: seed imports this module

        curated = MATERIAL_PROCESS_LINKS

    proc_by_slug = {
        p.slug: p
        for p in db.execute(
            select(Process).where(Process.is_demo.is_(True), Process.is_active.is_(True))
        ).scalars()
    }
    demo_process_ids = set(
        db.execute(select(Process.id).where(Process.is_demo.is_(True))).scalars()
    )
    slug_by_id = {p.id: s for s, p in proc_by_slug.items()}

    stmt = (
        select(Material.id, Material.name, Material.subclass, MaterialClass.slug)
        .join(MaterialClass, Material.class_id == MaterialClass.id)
        .where(Material.is_demo.is_(True), Material.owner_id.is_(None))
    )
    if material_ids is not None:
        stmt = stmt.where(Material.id.in_(list(material_ids)))
    materials = db.execute(stmt).all()

    current: dict[int, set[int]] = {}
    for material_id, process_id in db.execute(
        select(MaterialProcess.material_id, MaterialProcess.process_id).where(
            MaterialProcess.material_id.in_([m.id for m in materials])
        )
    ).all():
        current.setdefault(material_id, set()).add(process_id)

    created = 0
    to_remove: list[tuple[int, int]] = []
    for material_id, name, subclass, class_slug in materials:
        compatible = compatible_process_slugs(class_slug, subclass, name)
        chosen = list(curated[name]) if name in curated else compatible
        allowed = set(compatible) | set(curated.get(name, ()))
        linked = current.get(material_id, set())

        for slug in chosen:
            process = proc_by_slug.get(slug)
            if process is None or process.id in linked:
                continue
            db.add(MaterialProcess(material_id=material_id, process_id=process.id))
            linked.add(process.id)
            created += 1

        for process_id in sorted(linked & demo_process_ids):
            slug = slug_by_id.get(process_id)
            if slug is not None and slug not in allowed:
                to_remove.append((material_id, process_id))

    if to_remove:
        db.execute(
            delete(MaterialProcess).where(
                tuple_(MaterialProcess.material_id, MaterialProcess.process_id).in_(to_remove)
            )
        )
    db.flush()
    return {
        "demo_materials_evaluated": len(materials),
        "demo_process_links_created": created,
        "demo_process_links_removed": len(to_remove),
    }


def main() -> None:
    """CLI: acerta o catálogo demo (acrescenta e remove só vínculo demo implausível)."""
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        stats = sync_demo_process_links(db)
        db.commit()

    print("[link_demo_processes] Vínculos demo material ↔ processo acertados:")
    print(f"  Materiais demo avaliados: {stats['demo_materials_evaluated']}")
    print(f"  Vínculos criados: {stats['demo_process_links_created']}")
    print(f"  Vínculos implausíveis removidos: {stats['demo_process_links_removed']}")


if __name__ == "__main__":
    main()
