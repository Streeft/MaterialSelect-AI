"""A migração do Synthesizer, contra um banco que já tem catálogo e usuários.

Mesma razão das seis anteriores: o banco de teste compartilhado é construído por
``Base.metadata.create_all`` e nunca pelas migrações, então ele nunca começa no
estado anterior ao Synthesizer — o estado em que esta coluna é adicionada.

Três coisas a provar, e cada uma corresponde a um jeito diferente de esta
migração quebrar em produção e passar aqui:

* **a coluna nova é NOT NULL numa tabela com linhas.** Sem ``server_default`` o
  ``ALTER TABLE`` falha no PostgreSQL com dados dentro, e o banco de teste —
  vazio e criado por ``create_all`` — nunca encostaria nisso. O default é
  retirado em seguida, então o teste também confere que ele **não ficou** lá:
  um padrão que o modelo não declara é exatamente a divergência que uma
  autogeração futura apontaria;
* **todo material que já existia sai como não sintetizado.** É o que ele sempre
  foi; marcar qualquer um deles seria transformar dado catalogado em hipótese;
* **a restrição chega ao banco nos dois sentidos.** Um registro sintetizado sem
  dono passaria a valer para todo mundo, e um número calculado pareceria medido
  para quem nunca escolheu a receita. O par de testes é positivo e negativo de
  propósito: só o negativo provaria tanto a restrição certa quanto uma que
  recusa tudo.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config

from alembic import command
from app.config import settings

#: A revisão imediatamente anterior — os modais de transporte do Eco Audit.
PRE_SYNTHESIS_REVISION = "9364360c8de0"


def _config(url: str) -> Config:
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    return config


@pytest.fixture()
def migrated_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    """Um banco na revisão anterior, com um usuário e dois materiais."""
    url = f"sqlite:///{tmp_path / 'synthesis_migration.db'}"
    # `alembic/env.py` sobrescreve `sqlalchemy.url` com as settings da aplicação
    # em toda execução, então dirigir o objeto de settings é o único jeito de
    # apontar uma migração para o banco temporário — e é o que torna isto seguro.
    monkeypatch.setattr(settings, "database_url", url)
    command.upgrade(_config(url), PRE_SYNTHESIS_REVISION)

    engine = sa.create_engine(url)
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO user (id, google_sub, email, name, created_at) VALUES"
                " (1, 'sub-ana', 'ana@exemplo.br', 'Ana', '2026-01-01')"
            )
        )
        conn.execute(
            sa.text("INSERT INTO material_class (id, name, slug) VALUES (1, 'Metais', 'metais')")
        )
        conn.execute(
            sa.text(
                "INSERT INTO material"
                " (id, name, class_id, keywords, is_active, is_demo, created_at) VALUES"
                " (1, 'Aço 1020', 1, '[]', 1, 1, '2026-01-01'),"
                " (2, 'Alumínio 6061', 1, '[]', 1, 1, '2026-01-01')"
            )
        )
    engine.dispose()
    yield url


def _upgrade(url: str) -> None:
    command.upgrade(_config(url), "head")


def _rows(url: str, statement: str) -> list[sa.Row]:
    engine = sa.create_engine(url)
    try:
        with engine.connect() as conn:
            return list(conn.execute(sa.text(statement)).all())
    finally:
        engine.dispose()


def _execute(url: str, statement: str) -> None:
    engine = sa.create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(sa.text(statement))
    finally:
        engine.dispose()


def _columns(url: str, table: str) -> dict:
    engine = sa.create_engine(url)
    try:
        return {c["name"]: c for c in sa.inspect(engine).get_columns(table)}
    finally:
        engine.dispose()


def test_a_coluna_entra_numa_tabela_com_linhas(migrated_url: str) -> None:
    """NOT NULL sobre dados existentes: é aqui que falta de default quebra."""
    _upgrade(migrated_url)

    column = _columns(migrated_url, "material")["is_synthesized"]
    assert column["nullable"] is False


def test_o_padrao_de_servidor_nao_fica_no_banco(migrated_url: str) -> None:
    """Ele existe só para o ALTER TABLE passar, e sai logo depois.

    Um padrão que o modelo não declara é divergência de schema, e é ela que uma
    autogeração futura apontaria como se fosse mudança de alguém.
    """
    _upgrade(migrated_url)

    assert _columns(migrated_url, "material")["is_synthesized"]["default"] is None


def test_todo_material_que_ja_existia_sai_como_nao_sintetizado(migrated_url: str) -> None:
    """É o que eles sempre foram: catálogo, não hipótese."""
    _upgrade(migrated_url)

    rows = _rows(migrated_url, "SELECT id, is_synthesized FROM material ORDER BY id")
    assert [row.id for row in rows] == [1, 2]
    assert all(not row.is_synthesized for row in rows)


def test_um_registro_sintetizado_com_dono_e_aceito(migrated_url: str) -> None:
    """O controle positivo: uma restrição que recusa tudo também passaria no negativo."""
    _upgrade(migrated_url)

    _execute(
        migrated_url,
        "INSERT INTO material (id, name, class_id, keywords, is_active, is_demo,"
        " is_synthesized, owner_id, created_at)"
        " VALUES (3, 'Compósito hipotético', 1, '[]', 1, 0, 1, 1, '2026-01-01')",
    )

    assert _rows(migrated_url, "SELECT id FROM material WHERE is_synthesized")[0].id == 3


def test_um_registro_sintetizado_sem_dono_e_recusado_pelo_banco(migrated_url: str) -> None:
    """Sem dono ele valeria para todo mundo, e o número calculado pareceria medido."""
    _upgrade(migrated_url)

    with pytest.raises(sa.exc.IntegrityError):
        _execute(
            migrated_url,
            "INSERT INTO material (id, name, class_id, keywords, is_active, is_demo,"
            " is_synthesized, created_at)"
            " VALUES (4, 'Compósito órfão', 1, '[]', 1, 0, 1, '2026-01-01')",
        )


def test_um_material_comum_continua_podendo_nao_ter_dono(migrated_url: str) -> None:
    """NULL é o catálogo compartilhado (D-42), e a restrição não pode atrapalhar isso."""
    _upgrade(migrated_url)

    _execute(
        migrated_url,
        "INSERT INTO material (id, name, class_id, keywords, is_active, is_demo,"
        " is_synthesized, created_at)"
        " VALUES (5, 'Titânio Grau 2', 1, '[]', 1, 1, 0, '2026-01-01')",
    )

    assert _rows(migrated_url, "SELECT owner_id FROM material WHERE id = 5")[0].owner_id is None


def test_a_receita_guarda_os_dois_pais_com_chave_estrangeira(migrated_url: str) -> None:
    """Ids em JSON não teriam chave nenhuma — a razão do D-62 para duas colunas."""
    _upgrade(migrated_url)
    _execute(
        migrated_url,
        "INSERT INTO material (id, name, class_id, keywords, is_active, is_demo,"
        " is_synthesized, owner_id, created_at)"
        " VALUES (3, 'Compósito hipotético', 1, '[]', 1, 0, 1, 1, '2026-01-01')",
    )
    _execute(
        migrated_url,
        "INSERT INTO material_synthesis (material_id, kind, parent_a_id, parent_b_id, parameters)"
        " VALUES (3, 'composito', 1, 2, '{\"fracao_volumetrica\": 0.6}')",
    )

    row = _rows(migrated_url, "SELECT * FROM material_synthesis WHERE material_id = 3")[0]
    assert (row.kind, row.parent_a_id, row.parent_b_id) == ("composito", 1, 2)

    keys = {
        fk["constrained_columns"][0]
        for fk in sa.inspect(sa.create_engine(migrated_url)).get_foreign_keys("material_synthesis")
    }
    assert {"material_id", "parent_a_id", "parent_b_id"} <= keys


def test_a_espuma_guarda_um_pai_so(migrated_url: str) -> None:
    """O segundo pai é anulável porque uma espuma tem um sólido e mais nada."""
    _upgrade(migrated_url)
    _execute(
        migrated_url,
        "INSERT INTO material (id, name, class_id, keywords, is_active, is_demo,"
        " is_synthesized, owner_id, created_at)"
        " VALUES (3, 'Espuma hipotética', 1, '[]', 1, 0, 1, 1, '2026-01-01')",
    )
    _execute(
        migrated_url,
        "INSERT INTO material_synthesis (material_id, kind, parent_a_id, parameters)"
        " VALUES (3, 'espuma', 1, '{\"densidade_relativa\": 0.1}')",
    )

    row = _rows(migrated_url, "SELECT * FROM material_synthesis WHERE material_id = 3")[0]
    assert row.parent_b_id is None


def test_a_migracao_volta_atras_sem_levar_o_catalogo(migrated_url: str) -> None:
    """Ida e volta com dados dentro, como as seis anteriores."""
    _upgrade(migrated_url)
    command.downgrade(_config(migrated_url), PRE_SYNTHESIS_REVISION)

    assert "is_synthesized" not in _columns(migrated_url, "material")
    assert [row.id for row in _rows(migrated_url, "SELECT id FROM material ORDER BY id")] == [1, 2]
