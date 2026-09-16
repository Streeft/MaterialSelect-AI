"""O Synthesizer sobre o catálogo real (P3).

As leis estão provadas em ``test_synthesis.py``. O que se prova aqui é o que o
catálogo acrescenta: que a prévia mostra as leis e as ausências **antes** de
gravar, que o registro gravado é declarado sintetizado e pertence a quem o
criou, que cada valor carrega a lei na proveniência, e que um pai que o leitor
não pode ver não vira constituinte de nada.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.material_synthesis import MaterialSynthesis
from app.models.property_definition import PropertyDefinition
from app.models.user import User


def _material_id(db: Session, like: str) -> int:
    return (db.execute(select(Material).where(Material.name.like(like))).scalars().first()).id


def _class_id(db: Session) -> int:
    return (db.execute(select(MaterialClass).limit(1)).scalars().first()).id


def _composite(db: Session, **overrides):
    payload = {
        "kind": "composito",
        "name": "Compósito hipotético A",
        "class_id": _class_id(db),
        "parent_a_id": _material_id(db, "%Alumínio%"),
        "parent_b_id": _material_id(db, "%Polímero%"),
        "volume_fraction": 0.6,
    }
    payload.update(overrides)
    return payload


def _foam(db: Session, **overrides):
    payload = {
        "kind": "espuma",
        "name": "Espuma hipotética A",
        "class_id": _class_id(db),
        "parent_a_id": _material_id(db, "%Alumínio%"),
        "relative_density": 0.1,
    }
    payload.update(overrides)
    return payload


def _sandwich(db: Session, **overrides):
    payload = {
        "kind": "painel_sanduiche",
        "name": "Painel sanduíche hipotético A",
        "class_id": _class_id(db),
        "parent_a_id": _material_id(db, "%Alumínio%"),
        "parent_b_id": _material_id(db, "%Polímero%"),
        "face_thickness_mm": 1.0,
        "core_thickness_mm": 10.0,
    }
    payload.update(overrides)
    return payload


def _by_slug(body):
    return {value["slug"]: value for value in body["values"]}


def _skipped(body):
    return {item["slug"]: item["reason"] for item in body["skipped"]}


# --- o catálogo de leis -----------------------------------------------------


def test_os_tipos_trazem_as_leis_e_as_ausencias_declaradas(client: TestClient) -> None:
    response = client.get("/api/sintetizar/tipos")

    assert response.status_code == 200, response.text
    kinds = {item["kind"]: item for item in response.json()}
    assert set(kinds) == {"composito", "espuma", "painel_sanduiche"}
    assert kinds["composito"]["rules"]["densidade"]["formula"]
    assert "interface" in kinds["composito"]["without_rule"]["limite_escoamento"]
    assert kinds["painel_sanduiche"]["rules"]["modulo_young"]["basis"] == "exato"
    assert "falha" in kinds["painel_sanduiche"]["without_rule"]["limite_escoamento"].lower() or "vão" in kinds["painel_sanduiche"]["without_rule"]["limite_escoamento"].lower()


def test_a_assimetria_entre_os_tipos_aparece_no_catalogo(client: TestClient) -> None:
    """Espuma tem lei de resistência; compósito não — e o motivo vem junto."""
    kinds = {item["kind"]: item for item in client.get("/api/sintetizar/tipos").json()}

    assert "limite_escoamento" in kinds["espuma"]["rules"]
    assert "limite_escoamento" in kinds["composito"]["without_rule"]


def test_cada_lei_declara_a_base_em_que_se_apoia(client: TestClient) -> None:
    """ "Conservação de massa" e "ajuste empírico" não são a mesma afirmação."""
    kinds = {item["kind"]: item for item in client.get("/api/sintetizar/tipos").json()}

    assert kinds["composito"]["rules"]["densidade"]["basis"] == "exato"
    assert kinds["espuma"]["rules"]["modulo_young"]["basis"] == "empirico"
    assert kinds["composito"]["rules"]["modulo_young"]["basis"] == "limites"


# --- a prévia ---------------------------------------------------------------


def test_a_previa_mostra_o_que_sairia_sem_gravar_nada(
    client: TestClient, db_session: Session
) -> None:
    antes = len(db_session.execute(select(Material)).scalars().all())

    response = client.post("/api/sintetizar/previa", json=_composite(db_session))

    assert response.status_code == 200, response.text
    assert response.json()["values"]
    db_session.expire_all()
    assert len(db_session.execute(select(Material)).scalars().all()) == antes


def test_a_previa_nomeia_as_propriedades_pelo_nome_e_nao_pelo_slug(
    client: TestClient, db_session: Session
) -> None:
    body = client.post("/api/sintetizar/previa", json=_composite(db_session)).json()

    assert _by_slug(body)["densidade"]["name"] == "Densidade"
    assert all(item["name"] for item in body["skipped"])


def test_o_modulo_sai_como_par_de_limites_na_previa(
    client: TestClient, db_session: Session
) -> None:
    modulo = _by_slug(client.post("/api/sintetizar/previa", json=_composite(db_session)).json())[
        "modulo_young"
    ]

    assert modulo["value"] is None
    assert modulo["value_min"] < modulo["value_max"]
    assert modulo["rule"]["basis"] == "limites"


def test_a_previa_traz_a_nota_do_tipo(client: TestClient, db_session: Session) -> None:
    body = client.post("/api/sintetizar/previa", json=_composite(db_session)).json()
    assert "direção" in body["kind_note"]


# --- a gravação -------------------------------------------------------------


def test_o_registro_gravado_e_declarado_sintetizado_e_tem_dono(
    client: TestClient, db_session: Session, test_user: User
) -> None:
    response = client.post("/api/sintetizar", json=_composite(db_session))

    assert response.status_code == 201, response.text
    material = db_session.get(Material, response.json()["material_id"])
    assert material.is_synthesized is True
    assert material.owner_id == test_user.id
    assert material.is_demo is False


def test_a_receita_fica_gravada_com_os_pais_e_os_parametros(
    client: TestClient, db_session: Session
) -> None:
    """Sem ela o registro seria um punhado de números sem origem."""
    payload = _composite(db_session)
    body = client.post("/api/sintetizar", json=payload).json()

    recipe = db_session.get(MaterialSynthesis, body["material_id"])
    assert recipe.kind == "composito"
    assert recipe.parent_a_id == payload["parent_a_id"]
    assert recipe.parent_b_id == payload["parent_b_id"]
    assert recipe.parameters == {"fracao_volumetrica": 0.6}


def test_cada_valor_gravado_carrega_a_lei_na_proveniencia(
    client: TestClient, db_session: Session
) -> None:
    """É a lei escrita que separa valor calculado de valor inventado."""
    body = client.post("/api/sintetizar", json=_composite(db_session)).json()

    rows = (
        db_session.execute(
            select(MaterialPropertyValue).where(
                MaterialPropertyValue.material_id == body["material_id"]
            )
        )
        .scalars()
        .all()
    )
    assert rows
    for row in rows:
        assert row.notes
        assert "=" in row.notes or "≤" in row.notes


def test_o_valor_gravado_herda_a_pior_qualidade_dos_pais(
    client: TestClient, db_session: Session
) -> None:
    body = client.post("/api/sintetizar", json=_composite(db_session)).json()

    densidade = (
        db_session.execute(
            select(MaterialPropertyValue)
            .join(PropertyDefinition)
            .where(
                MaterialPropertyValue.material_id == body["material_id"],
                PropertyDefinition.slug == "densidade",
            )
        )
        .scalars()
        .one()
    )
    # O seed inteiro é ESTIMADO, então a pior é ESTIMADO — e o ponto é que ela
    # vem dos pais e não de um padrão do serviço.
    assert densidade.data_quality.value == "ESTIMADO"


def test_o_modulo_gravado_e_um_intervalo_de_verdade(
    client: TestClient, db_session: Session
) -> None:
    body = client.post("/api/sintetizar", json=_composite(db_session)).json()

    modulo = (
        db_session.execute(
            select(MaterialPropertyValue)
            .join(PropertyDefinition)
            .where(
                MaterialPropertyValue.material_id == body["material_id"],
                PropertyDefinition.slug == "modulo_young",
            )
        )
        .scalars()
        .one()
    )
    assert modulo.value_min < modulo.value_max
    assert modulo.normalized_value == pytest.approx((modulo.value_min + modulo.value_max) / 2)


def test_o_registro_derivado_aparece_no_catalogo_de_quem_o_criou(
    client: TestClient, db_session: Session
) -> None:
    """Um registro sintetizado convive com os catalogados — é o ponto do item."""
    body = client.post("/api/sintetizar", json=_composite(db_session)).json()

    listed = {item["id"] for item in client.get("/api/materials").json()}
    assert body["material_id"] in listed


def test_uma_espuma_grava_um_pai_so(client: TestClient, db_session: Session) -> None:
    body = client.post("/api/sintetizar", json=_foam(db_session)).json()

    recipe = db_session.get(MaterialSynthesis, body["material_id"])
    assert recipe.kind == "espuma"
    assert recipe.parent_b_id is None
    assert recipe.parameters == {"densidade_relativa": 0.1}


def test_previa_painel_sanduiche_calcula_valores_e_ausencias(
    client: TestClient, db_session: Session
) -> None:
    body = client.post("/api/sintetizar/previa", json=_sandwich(db_session)).json()

    values = _by_slug(body)
    assert values["densidade"]["rule"]["basis"] == "exato"
    assert values["modulo_young"]["value"] is not None
    assert values["modulo_young"]["rule"]["basis"] == "exato"
    assert "condutividade_termica" in values
    assert values["condutividade_termica"]["rule"]["basis"] == "exato"

    skipped = _skipped(body)
    assert "limite_escoamento" in skipped
    assert "resistencia_tracao" in skipped


def test_gravacao_painel_sanduiche_persiste_receita_e_parametros(
    client: TestClient, db_session: Session, test_user: User
) -> None:
    payload = _sandwich(db_session, name="Painel Sanduíche Teste")
    response = client.post("/api/sintetizar", json=payload)

    assert response.status_code == 201, response.text
    body = response.json()
    material = db_session.get(Material, body["material_id"])
    assert material.is_synthesized is True
    assert material.owner_id == test_user.id

    recipe = db_session.get(MaterialSynthesis, body["material_id"])
    assert recipe.kind == "painel_sanduiche"
    assert recipe.parent_a_id == payload["parent_a_id"]
    assert recipe.parent_b_id == payload["parent_b_id"]
    assert recipe.parameters["espessura_face_mm"] == 1.0
    assert recipe.parameters["espessura_nucleo_mm"] == 10.0
    assert recipe.parameters["espessura_total_mm"] == 12.0


# --- as recusas -------------------------------------------------------------


def test_o_campo_do_outro_tipo_e_recusado_e_nao_ignorado(
    client: TestClient, db_session: Session
) -> None:
    """Ignorado, seria um número que o leitor digitou e a conta não conteve."""
    response = client.post(
        "/api/sintetizar/previa", json=_composite(db_session, relative_density=0.2)
    )

    assert response.status_code == 400
    assert "espuma" in response.json()["detail"]


def test_uma_espuma_com_dois_pais_e_recusada(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/api/sintetizar/previa",
        json=_foam(db_session, parent_b_id=_material_id(db_session, "%Aço%")),
    )

    assert response.status_code == 400
    assert "um sólido só" in response.json()["detail"]


def test_um_composito_do_material_consigo_mesmo_e_recusado(
    client: TestClient, db_session: Session
) -> None:
    alu = _material_id(db_session, "%Alumínio%")
    response = client.post(
        "/api/sintetizar/previa", json=_composite(db_session, parent_a_id=alu, parent_b_id=alu)
    )

    assert response.status_code == 400
    assert "mesmo material" in response.json()["detail"]


def test_um_painel_sanduiche_do_material_consigo_mesmo_e_recusado(
    client: TestClient, db_session: Session
) -> None:
    alu = _material_id(db_session, "%Alumínio%")
    response = client.post(
        "/api/sintetizar/previa", json=_sandwich(db_session, parent_a_id=alu, parent_b_id=alu)
    )

    assert response.status_code == 400
    assert "chapa maciça" in response.json()["detail"]


def test_painel_sanduiche_recusa_campos_cruzados(
    client: TestClient, db_session: Session
) -> None:
    resp1 = client.post(
        "/api/sintetizar/previa", json=_sandwich(db_session, volume_fraction=0.5)
    )
    assert resp1.status_code == 400
    assert "fração volumétrica" in resp1.json()["detail"].lower()

    resp2 = client.post(
        "/api/sintetizar/previa", json=_sandwich(db_session, relative_density=0.1)
    )
    assert resp2.status_code == 400
    assert "densidade relativa" in resp2.json()["detail"].lower()

    resp3 = client.post(
        "/api/sintetizar/previa", json=_composite(db_session, face_thickness_mm=1.0)
    )
    assert resp3.status_code == 400
    assert "painel sanduíche" in resp3.json()["detail"].lower()


def test_fracao_fora_do_intervalo_aberto_e_recusada_pelo_schema(
    client: TestClient, db_session: Session
) -> None:
    assert (
        client.post(
            "/api/sintetizar/previa", json=_composite(db_session, volume_fraction=1.0)
        ).status_code
        == 422
    )


def test_um_nome_ja_usado_e_conflito(client: TestClient, db_session: Session) -> None:
    client.post("/api/sintetizar", json=_composite(db_session))
    response = client.post("/api/sintetizar", json=_composite(db_session))

    assert response.status_code == 409


def test_uma_classe_inexistente_e_404(client: TestClient, db_session: Session) -> None:
    response = client.post("/api/sintetizar", json=_composite(db_session, class_id=9999))
    assert response.status_code == 404


# --- isolamento (P1-4) ------------------------------------------------------
#
# A varredura de `test_my_records_isolation` cobre só rotas GET, então este POST
# precisa do seu par — a lacuna que o D-62 registrou.


def _own_record(db_session: Session, owner: User, name: str) -> Material:
    material_class = db_session.execute(select(MaterialClass).limit(1)).scalars().one()
    material = Material(
        name=name,
        class_id=material_class.id,
        owner_id=owner.id,
        is_active=True,
        is_demo=False,
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


def test_meu_proprio_registro_pode_ser_constituinte(
    client: TestClient, db_session: Session, test_user: User
) -> None:
    """O controle positivo que o D-62 ensinou a não omitir: falha fechada tem de abrir."""
    material = _own_record(db_session, test_user, "Resina propria da sintese")

    response = client.post(
        "/api/sintetizar/previa", json=_composite(db_session, parent_b_id=material.id)
    )

    assert response.status_code == 200, response.text
    assert material.name in response.json()["parents"]


def test_o_registro_de_outra_pessoa_nao_vira_constituinte(
    client: TestClient, db_session: Session, other_user: User
) -> None:
    """404 como em todo lugar: outra resposta diria se ele existe."""
    material = _own_record(db_session, other_user, "Resina alheia da sintese")

    response = client.post(
        "/api/sintetizar/previa", json=_composite(db_session, parent_b_id=material.id)
    )

    assert response.status_code == 404
    assert material.name not in response.text
