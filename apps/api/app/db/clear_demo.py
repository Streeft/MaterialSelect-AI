"""Delete every fictional/demo catalogue record in one action.

⚠️  Irreversível. Roda contra o banco que `DATABASE_URL` apontar.

A regra de corte é a própria coluna `is_demo`: material, processo e modal de
transporte fictícios são removidos independentemente do módulo que os criou.
Taxonomias, definições de propriedades/atributos e fontes permanecem porque são
metadados reutilizáveis pelo catálogo oficial.

A cascata é explícita em Python. Produção usa PostgreSQL com FKs, mas a suíte
também roda em SQLite sem depender de `PRAGMA foreign_keys=ON`; por isso este
módulo remove filhos na ordem correta em vez de confiar somente em `ON DELETE`.

Materiais reais, processos reais e modais reais nunca são apagados por este
comando. O hard delete continua sendo uma exceção estreita para registros que já
se declaram fictícios.

Run with::

    python -m app.db.clear_demo

Ver `docs/15-dados-demonstrativos.md` para o procedimento operacional.
"""

from __future__ import annotations

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.db.base import SessionLocal
from app.models.material import Material
from app.models.material_keyword import MaterialKeyword
from app.models.material_property_value import MaterialPropertyValue
from app.models.material_synthesis import MaterialSynthesis
from app.models.my_records import Favorite, RecentRecord
from app.models.process import MaterialProcess, Process
from app.models.process_attribute import ProcessAttributeValue
from app.models.transport_mode import TransportMode


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


def clear_demo_data(db: Session) -> dict[str, int]:
    """Remove all demo catalogue records and return per-universe counts.

    Order matters: material↔process links are removed from either side before
    processes disappear. Running the function again is idempotent.
    """
    materials = clear_demo_materials(db)
    processes = clear_demo_processes(db)
    transport_modes = clear_demo_transport_modes(db)
    return {
        "materials": materials,
        "processes": processes,
        "transport_modes": transport_modes,
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
