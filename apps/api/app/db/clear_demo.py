"""Delete every fictional/demo material, in one action.

⚠️  Irreversível. Roda contra o banco que `DATABASE_URL` apontar.

Remove todo `Material` com `is_demo=True` — os 5 de `app.db.seed`, os 70 de
`app.db.seed_extended`, e qualquer outro que um seed futuro venha a marcar
assim, **não importa em qual arquivo ele foi definido**. Um material
fictício se reconhece por essa coluna, não pelo módulo que o criou (D-72):
dois arquivos de seed existem por uma razão de teste (ver D-71), mas
"apagar todo dado de demonstração" é uma pergunta só, e a resposta mora
inteira aqui.

**A cascata é explícita em Python, não só declarada no schema.** Todo
`ForeignKey` para `material.id` já é `ondelete="CASCADE"` ou
`ondelete="SET NULL"` — o Postgres de produção cumpriria isso sozinho — mas
o SQLite dos testes só aplica `ondelete` com `PRAGMA foreign_keys=ON`, que
`apps/api/app/tests/conftest.py` não liga (mudar isso teria alcance sobre
toda a suíte, não só este módulo — fora do escopo de uma limpeza de dado
demo). Confiar no schema teria deixado este módulo correto em produção e
inverificável em teste — exatamente a armadilha que `docs/CLAUDE.md` §10 já
registra para migração ("só foi exercitada em SQLite"). Por isso cada tabela
filha é apagada aqui, na ordem que suas próprias chaves estrangeiras exigem:
`material_property_value`, `material_keyword`, `material_process`,
`favorite`, `recent_record`, `material_synthesis` (pelo `material_id` —
a receita de um sintetizado, que nunca é `is_demo`, ver abaixo) e por fim
`material_synthesis.parent_a_id`/`parent_b_id` postos em `NULL` quando um
material fictício foi insumo de uma mistura real — o mesmo `SET NULL` que o
schema declara, só que executado por este módulo e não pelo banco.

**Isto é uma exceção deliberada e estreita à regra geral do catálogo — não
uma mudança dela.** `material_synthesis.py` documenta por que um material
normalmente é **desativado, nunca excluído**
(`DELETE /api/materiais/{id}` faz `is_active=False`, nunca um `DELETE` de
verdade): um material real carrega história — receita de síntese, estudo
salvo, evento de auditoria — que apagar destruiria. Este módulo não
contradiz essa regra; ele responde a uma pergunta diferente, que só existe
porque a linha nunca foi real: `is_demo=True` já é a declaração de que o
valor é fictício (Princípio 6), então **para esta linha especificamente**
"excluir de verdade" não destrói história nenhuma — não existe história
real para proteger. Nenhum caminho deste módulo toca `Material.is_demo=False`.

`AuditEvent` nunca bloqueia: `entity_id` é retrato (`Integer`, não
`ForeignKey` — D-43), então um evento de auditoria sobre um material
apagado continua legível depois, com o nome que o material tinha no
momento — exatamente o ponto do retrato.

O que este módulo **não** apaga, de propósito: `MaterialClass` (taxonomia,
reutilizável por material oficial futuro sob a mesma família), `Source`
"Dataset Demo MaterialSelect" (fica órfã sem custo — um seed futuro a
recria via `get_or_create`, se precisar), `BatteryChemistry` e
`TransportMode` (dado real de literatura pública, `is_demo=False`, não
fictício — D-66/D-69). Só material fictício é apagado, porque só material
fictício foi pedido.

Run with::

    python -m app.db.clear_demo

Ver `docs/15-dados-demonstrativos.md` para quando rodar isto.
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
from app.models.process import MaterialProcess


def clear_demo_materials(db: Session) -> int:
    """Delete every ``Material`` with ``is_demo=True``. Returns the count removed.

    Idempotent in effect: running it again with no demo material left
    returns 0 and touches nothing.
    """
    demo_ids = list(db.execute(select(Material.id).where(Material.is_demo.is_(True))).scalars())
    if not demo_ids:
        return 0

    # A demo material is never itself synthesized (a synthesized record
    # always has an owner, D-59's constraint; every demo row is shared,
    # owner_id NULL), but it can have been used as an input to someone
    # else's real mixture — set that reference NULL, same as the schema
    # would, before the parent disappears.
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


def main() -> None:
    """CLI entry point: delete every demo material and report the count."""
    with SessionLocal() as db:
        removed = clear_demo_materials(db)
        db.commit()

    print(f"[clear_demo] {removed} materiais fictícios removidos.")
    if removed == 0:
        print("[clear_demo] Nada a fazer — nenhum material com is_demo=True.")


if __name__ == "__main__":
    main()
