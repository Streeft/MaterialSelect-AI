"""Delete every fictional/demo catalogue record in one action.

⚠️  Irreversível. Roda contra o banco que `DATABASE_URL` apontar.

A regra de corte é a própria coluna `is_demo`: material, processo, modal de
transporte, química de bateria, índice de desempenho, fonte, designação e linha de
composição (D-105) fictícios são removidos independentemente do módulo que os
criou. Taxonomias e definições de
propriedades/atributos permanecem porque são metadados reutilizáveis pelo
catálogo oficial.

A cascata é explícita em Python. Produção usa PostgreSQL com FKs, mas a suíte
também roda em SQLite sem depender de `PRAGMA foreign_keys=ON`; por isso este
módulo remove filhos na ordem correta em vez de confiar somente em `ON DELETE`.

Registros reais nunca são apagados por este comando. O hard delete continua
sendo uma exceção estreita para linhas que já se declaram fictícias. Uma fonte
demo só é removida quando não restar nenhuma linha real apontando para ela; se
restar, a limpeza falha fechada em vez de destruir proveniência.

Run with::

    python -m app.db.clear_demo

Ver `docs/15-dados-demonstrativos.md` para o procedimento operacional.
"""

from __future__ import annotations

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.db.base import SessionLocal
from app.models.battery_chemistry import BatteryChemistry
from app.models.material import Material
from app.models.material_composition import MaterialCompositionEntry
from app.models.material_designation import MaterialDesignation
from app.models.material_keyword import MaterialKeyword
from app.models.material_property_value import MaterialPropertyValue
from app.models.material_synthesis import MaterialSynthesis
from app.models.my_records import Favorite, RecentRecord
from app.models.performance_index import PerformanceIndex
from app.models.process import MaterialProcess, Process
from app.models.process_attribute import ProcessAttributeValue
from app.models.source import Source
from app.models.transport_mode import TransportMode


def clear_demo_identity(db: Session) -> dict[str, int]:
    """Delete demo designations and composition rows (D-105).

    Two ways a row is fictitious, and both go: it declares ``is_demo`` itself
    (a demo row attached to a real material), or it belongs to a demo material.
    Run before the materials so the counts say what was removed here; the
    material pass repeats the cascade defensively.
    """
    demo_materials = select(Material.id).where(Material.is_demo.is_(True))
    removed = {}
    for key, model in (
        ("designations", MaterialDesignation),
        ("composition_entries", MaterialCompositionEntry),
    ):
        condition = model.is_demo.is_(True) | model.material_id.in_(demo_materials)
        removed[key] = db.scalar(select(func.count(model.id)).where(condition)) or 0
        db.execute(delete(model).where(condition))
    return removed


def clear_demo_materials(db: Session) -> int:
    """Delete every `Material` with `is_demo=True`; return the count removed."""
    demo_ids = list(db.execute(select(Material.id).where(Material.is_demo.is_(True))).scalars())
    if not demo_ids:
        return 0

    # A real synthesized record may have used a demo material as a parent.
    # Preserve the real record and mirror the schema's SET NULL semantics.
    db.execute(
        update(MaterialSynthesis)
        .where(MaterialSynthesis.parent_a_id.in_(demo_ids))
        .values(parent_a_id=None)
    )
    db.execute(
        update(MaterialSynthesis)
        .where(MaterialSynthesis.parent_b_id.in_(demo_ids))
        .values(parent_b_id=None)
    )

    db.execute(delete(MaterialSynthesis).where(MaterialSynthesis.material_id.in_(demo_ids)))
    db.execute(delete(Favorite).where(Favorite.material_id.in_(demo_ids)))
    db.execute(delete(RecentRecord).where(RecentRecord.material_id.in_(demo_ids)))
    db.execute(delete(MaterialProcess).where(MaterialProcess.material_id.in_(demo_ids)))
    db.execute(delete(MaterialPropertyValue).where(MaterialPropertyValue.material_id.in_(demo_ids)))
    db.execute(delete(MaterialKeyword).where(MaterialKeyword.material_id.in_(demo_ids)))
    db.execute(delete(MaterialDesignation).where(MaterialDesignation.material_id.in_(demo_ids)))
    db.execute(
        delete(MaterialCompositionEntry).where(MaterialCompositionEntry.material_id.in_(demo_ids))
    )
    db.execute(delete(Material).where(Material.id.in_(demo_ids)))
    return len(demo_ids)


def clear_demo_processes(db: Session) -> int:
    """Delete every demo process and children without touching real processes."""
    demo_ids = list(db.execute(select(Process.id).where(Process.is_demo.is_(True))).scalars())
    if not demo_ids:
        return 0

    db.execute(delete(Favorite).where(Favorite.process_id.in_(demo_ids)))
    db.execute(delete(RecentRecord).where(RecentRecord.process_id.in_(demo_ids)))
    db.execute(delete(MaterialProcess).where(MaterialProcess.process_id.in_(demo_ids)))
    db.execute(delete(ProcessAttributeValue).where(ProcessAttributeValue.process_id.in_(demo_ids)))
    db.execute(delete(Process).where(Process.id.in_(demo_ids)))
    return len(demo_ids)


def clear_demo_transport_modes(db: Session) -> int:
    """Delete seeded fictitious transport modes; preserve every real mode."""
    demo_ids = list(
        db.execute(select(TransportMode.id).where(TransportMode.is_demo.is_(True))).scalars()
    )
    if not demo_ids:
        return 0
    db.execute(delete(TransportMode).where(TransportMode.id.in_(demo_ids)))
    return len(demo_ids)


def clear_demo_battery_chemistries(db: Session) -> int:
    """Delete only battery chemistry rows explicitly marked as demo."""
    demo_ids = list(
        db.execute(select(BatteryChemistry.id).where(BatteryChemistry.is_demo.is_(True))).scalars()
    )
    if not demo_ids:
        return 0
    db.execute(delete(BatteryChemistry).where(BatteryChemistry.id.in_(demo_ids)))
    return len(demo_ids)


def clear_demo_performance_indices(db: Session) -> int:
    """Delete demo merit indices; reference indices are re-seeded as real data."""
    demo_ids = list(
        db.execute(select(PerformanceIndex.id).where(PerformanceIndex.is_demo.is_(True))).scalars()
    )
    if not demo_ids:
        return 0
    db.execute(delete(PerformanceIndex).where(PerformanceIndex.id.in_(demo_ids)))
    return len(demo_ids)


def clear_demo_sources(db: Session) -> int:
    """Delete demo sources only after proving no real record still cites them."""
    demo_ids = list(db.execute(select(Source.id).where(Source.is_demo.is_(True))).scalars())
    if not demo_ids:
        return 0

    remaining_refs = {
        "material_property_values": db.scalar(
            select(func.count(MaterialPropertyValue.id)).where(
                MaterialPropertyValue.source_id.in_(demo_ids)
            )
        )
        or 0,
        "process_attribute_values": db.scalar(
            select(func.count(ProcessAttributeValue.id)).where(
                ProcessAttributeValue.source_id.in_(demo_ids)
            )
        )
        or 0,
        "transport_modes": db.scalar(
            select(func.count(TransportMode.id)).where(TransportMode.source_id.in_(demo_ids))
        )
        or 0,
        "battery_chemistries": db.scalar(
            select(func.count(BatteryChemistry.id)).where(BatteryChemistry.source_id.in_(demo_ids))
        )
        or 0,
        # D-105: a real designation or composition row citing a demo source.
        "material_designations": db.scalar(
            select(func.count(MaterialDesignation.id)).where(
                MaterialDesignation.source_id.in_(demo_ids)
            )
        )
        or 0,
        "material_composition": db.scalar(
            select(func.count(MaterialCompositionEntry.id)).where(
                MaterialCompositionEntry.source_id.in_(demo_ids)
            )
        )
        or 0,
    }
    if any(remaining_refs.values()):
        raise RuntimeError(
            "Fonte demo ainda é citada por registro remanescente; "
            f"limpeza recusada para preservar proveniência: {remaining_refs}"
        )

    db.execute(delete(Source).where(Source.id.in_(demo_ids)))
    return len(demo_ids)


def clear_demo_data(db: Session) -> dict[str, int]:
    """Remove all demo catalogue records and return per-universe counts.

    Order matters: material↔process links are removed from either side before
    processes disappear. Running the function again is idempotent.
    """
    identity = clear_demo_identity(db)
    materials = clear_demo_materials(db)
    processes = clear_demo_processes(db)
    transport_modes = clear_demo_transport_modes(db)
    battery_chemistries = clear_demo_battery_chemistries(db)
    performance_indices = clear_demo_performance_indices(db)
    sources = clear_demo_sources(db)
    return {
        "materials": materials,
        "processes": processes,
        "transport_modes": transport_modes,
        "battery_chemistries": battery_chemistries,
        "performance_indices": performance_indices,
        "sources": sources,
        **identity,
    }


def main() -> None:
    """CLI entry point used by the Administração do banco workflow."""
    with SessionLocal() as db:
        removed = clear_demo_data(db)
        db.commit()

    print(f"[clear_demo] removidos: {removed}")
    if not any(removed.values()):
        print("[clear_demo] Nada a fazer — nenhum registro com is_demo=True.")


if __name__ == "__main__":
    main()
