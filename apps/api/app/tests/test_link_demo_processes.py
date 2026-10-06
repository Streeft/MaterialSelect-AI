"""Testes unitários para link_demo_processes.

Verifica a vinculação automática e idempotente de processos de conformação e
manufatura aos materiais de teste de acordo com sua classe, viabilizando o
Eco Audit e o Dimensionador de Custo.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.link_demo_processes import link_demo_processes
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.process import MaterialProcess, Process


def test_link_demo_processes_creates_links_and_is_idempotent(db_session: Session) -> None:
    # 1. Primeira execução: deve criar vínculos para todos os materiais demo existentes
    # que ainda não possuam todas as associações de sua classe.
    stats1 = link_demo_processes(db_session)
    assert stats1["materials_evaluated"] >= 5
    assert stats1["links_created"] >= 0
    assert stats1["links_skipped"] >= 0

    # 2. Segunda execução imediata: todos os pares já existem, 0 links criados
    stats2 = link_demo_processes(db_session)
    assert stats2["links_created"] == 0
    assert stats2["links_skipped"] >= stats1["links_created"]


def test_link_demo_processes_for_new_user_material(db_session: Session) -> None:
    # Cria um material de teste sem nenhum processo vinculado
    metais_class = db_session.execute(
        select(MaterialClass).where(MaterialClass.slug == "metais")
    ).scalar_one()

    custom_mat = Material(
        name="Liga Customizada de Teste do Usuário",
        class_id=metais_class.id,
        is_demo=False,
        is_active=True,
    )
    db_session.add(custom_mat)
    db_session.flush()

    # Confirma que não tem nenhum processo associado inicialmente
    initial_links = db_session.execute(
        select(MaterialProcess).where(MaterialProcess.material_id == custom_mat.id)
    ).all()
    assert len(initial_links) == 0

    # Executa link_demo_processes especificamente para este material
    stats = link_demo_processes(db_session, material_ids=[custom_mat.id])
    assert stats["materials_evaluated"] == 1
    assert stats["links_created"] > 0

    # Verifica se os processos de metais (ex.: fundição, forjamento, usinagem) foram associados
    linked_proc_ids = [
        row[0]
        for row in db_session.execute(
            select(MaterialProcess.process_id).where(MaterialProcess.material_id == custom_mat.id)
        ).all()
    ]
    assert len(linked_proc_ids) > 0

    linked_slugs = [
        row[0]
        for row in db_session.execute(
            select(Process.slug).where(Process.id.in_(linked_proc_ids))
        ).all()
    ]
    assert "fundicao-areia" in linked_slugs
    assert "forjamento" in linked_slugs
    assert "usinagem-convencional" in linked_slugs


def test_link_demo_processes_respects_only_active_flag(db_session: Session) -> None:
    metais_class = db_session.execute(
        select(MaterialClass).where(MaterialClass.slug == "metais")
    ).scalar_one()

    inactive_mat = Material(
        name="Material Inativo Sem Processos",
        class_id=metais_class.id,
        is_demo=False,
        is_active=False,
    )
    db_session.add(inactive_mat)
    db_session.flush()

    stats = link_demo_processes(
        db_session,
        material_ids=[inactive_mat.id],
        only_active=True,
    )
    assert stats["materials_evaluated"] == 0
    assert stats["links_created"] == 0
