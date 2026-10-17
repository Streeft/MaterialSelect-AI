"""``POST /api/sintetizar/varredura`` sobre o catálogo real (D-144).

A conta está provada em ``test_family_sweep.py``. Aqui se prova o que a rota
acrescenta: que nada é gravado, que a entrada inválida é recusada pelo schema
(422) antes de qualquer síntese, que as recusas de domínio são as mesmas da
prévia, e que um pai que o leitor não pode ver não vira constituinte de nada.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.calculations.family_sweep import MAX_STEPS
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.material_synthesis import MaterialSynthesis
from app.models.property_definition import PropertyDefinition
from app.models.user import User

_URL = "/api/sintetizar/varredura"


def _material_id(db: Session, like: str) -> int:
    return (db.execute(select(Material).where(Material.name.like(like))).scalars().first()).id


def _panel(db: Session, **overrides):
    payload = {
        "kind": "painel",
        "parent_a_id": _material_id(db, "%Alumínio%"),
        "parent_b_id": _material_id(db, "%Polímero%"),
        "start": 2.0,
        "stop": 40.0,
        "steps": 8,
        "spacing": "linear",
        "index": {"expression": "cbrt(modulo_young) / densidade", "goal": "maximize"},
    }
    payload.update(overrides)
    return payload


def _composite(db: Session, **overrides):
    payload = {
        "kind": "composito",
        "parent_a_id": _material_id(db, "%Alumínio%"),
        "parent_b_id": _material_id(db, "%Polímero%"),
        "start": 0.1,
        "stop": 0.9,
        "steps": 5,
        "index": {"name": "Rigidez específica", "expression": "modulo_young / densidade"},
    }
    payload.update(overrides)
    return payload


def _own_record(db_session: Session, owner: User, name: str) -> Material:
    material_class = db_session.execute(select(MaterialClass).limit(1)).scalars().one()
    material = Material(
        name=name, class_id=material_class.id, owner_id=owner.id, is_active=True, is_demo=False
    )
    db_session.add(material)
    db_session.flush()
    for slug, value in (("densidade", 1500.0), ("modulo_young", 5.0e9)):
        definition = (
            db_session.execute(select(PropertyDefinition).where(PropertyDefinition.slug == slug))
            .scalars()
            .one()
        )
        db_session.add(
            MaterialPropertyValue(
                material_id=material.id,
                property_id=definition.id,
                value_scalar=value,
                original_unit=definition.canonical_unit,
                normalized_value=value,
                canonical_unit=definition.canonical_unit,
                is_missing=False,
            )
        )
    db_session.flush()
    return material


# --- a família --------------------------------------------------------------


def test_a_varredura_do_painel_devolve_um_passo_por_ponto_da_grade(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(_URL, json=_panel(db_session))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["kind"] == "painel"
    assert body["variable"] == "razao_nucleo_face"
    assert len(body["grid"]) == 8
    assert body["grid"][0] == 2.0 and body["grid"][-1] == 40.0
    positions = sorted(
        [step["position"] for step in body["steps"]]
        + [item["position"] for item in body["skipped"]]
    )
    assert positions == list(range(8))
    assert body["index"]["dimension"]
    assert "espessura" in body["note"]


def test_cada_passo_traz_os_valores_sintetizados_e_a_lei_vem_uma_vez(
    client: TestClient, db_session: Session
) -> None:
    body = client.post(_URL, json=_panel(db_session)).json()

    properties = {item["slug"]: item for item in body["properties"]}
    assert properties["modulo_young"]["rule"]["key"] == "flexao-sanduiche"
    assert properties["modulo_young"]["name"] != "modulo_young"
    for step in body["steps"]:
        slugs = {value["slug"] for value in step["values"]}
        assert {"modulo_young", "densidade"} <= slugs
        assert step["index_value"] is not None
        assert step["quality"]


def test_a_varredura_nao_grava_nada(client: TestClient, db_session: Session) -> None:
    before = (
        db_session.scalar(select(func.count(Material.id))),
        db_session.scalar(select(func.count(MaterialSynthesis.material_id))),
    )

    assert client.post(_URL, json=_panel(db_session)).status_code == 200
    assert client.post(_URL, json=_composite(db_session)).status_code == 200

    after = (
        db_session.scalar(select(func.count(Material.id))),
        db_session.scalar(select(func.count(MaterialSynthesis.material_id))),
    )
    assert after == before


def test_e_deterministica_pela_rota(client: TestClient, db_session: Session) -> None:
    first = client.post(_URL, json=_panel(db_session, spacing="log")).json()
    second = client.post(_URL, json=_panel(db_session, spacing="log")).json()

    assert first == second


def test_painel_sem_resistencia_exclui_o_indice_e_diz_por_que(
    client: TestClient, db_session: Session
) -> None:
    payload = _panel(db_session, index={"expression": "limite_escoamento / densidade"})
    response = client.post(_URL, json=payload)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["steps"] == []
    assert len(body["skipped"]) == 8
    assert all("modos de falha" in item["reason"] for item in body["skipped"])
    absent = {item["slug"]: item["reason"] for item in body["absent"]}
    assert "modos de falha" in absent["limite_escoamento"]


def test_o_composito_devolve_o_indice_como_par_de_limites(
    client: TestClient, db_session: Session
) -> None:
    body = client.post(_URL, json=_composite(db_session)).json()

    assert body["variable"] == "fracao_volumetrica"
    assert body["index"]["name"] == "Rigidez específica"
    for step in body["steps"]:
        assert step["index_value"] is None
        assert step["index_min"] < step["index_max"]


# --- recusas ----------------------------------------------------------------


@pytest.mark.parametrize(
    "overrides",
    [
        {"steps": MAX_STEPS + 1},
        {"steps": 1},
        {"start": 0.0},
        {"start": -1.0},
        {"start": 40.0, "stop": 2.0},
        {"start": 5.0, "stop": 5.0},
        {"spacing": "quadratico"},
        {"kind": "espuma"},
        {"index": None},
        {"index": {"expression": ""}},
        {"parent_b_id": None},
    ],
)
def test_entrada_invalida_e_422(client: TestClient, db_session: Session, overrides) -> None:
    response = client.post(_URL, json=_panel(db_session, **overrides))

    assert response.status_code == 422, response.text


def test_fracao_ate_um_e_422(client: TestClient, db_session: Session) -> None:
    response = client.post(_URL, json=_composite(db_session, stop=1.0))

    assert response.status_code == 422, response.text
    assert "entre 0 e 1" in response.text


def test_face_e_nucleo_iguais_sao_recusados_como_na_previa(
    client: TestClient, db_session: Session
) -> None:
    aluminio = _material_id(db_session, "%Alumínio%")
    response = client.post(
        _URL, json=_panel(db_session, parent_a_id=aluminio, parent_b_id=aluminio)
    )

    assert response.status_code == 400, response.text
    assert "mesmo material" in response.text


def test_indice_com_variavel_desconhecida_e_recusado(
    client: TestClient, db_session: Session
) -> None:
    payload = _panel(db_session, index={"expression": "nao_existe / densidade"})
    response = client.post(_URL, json=payload)

    assert response.status_code == 400, response.text
    assert "desconhecidas" in response.text


# --- isolamento (P1-4) ------------------------------------------------------


def test_meu_proprio_registro_pode_ser_nucleo(
    client: TestClient, db_session: Session, test_user: User
) -> None:
    material = _own_record(db_session, test_user, "Núcleo próprio da varredura")

    response = client.post(_URL, json=_panel(db_session, parent_b_id=material.id))

    assert response.status_code == 200, response.text
    assert material.name in response.json()["parents"]


def test_o_registro_de_outra_pessoa_nao_entra_na_varredura(
    client: TestClient, db_session: Session, other_user: User
) -> None:
    material = _own_record(db_session, other_user, "Núcleo alheio da varredura")

    response = client.post(_URL, json=_panel(db_session, parent_b_id=material.id))

    assert response.status_code == 404
    assert material.name not in response.text
