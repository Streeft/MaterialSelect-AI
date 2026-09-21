"""The comparison table against a reference, and when a percentage exists (P2).

The interesting half of this feature is everything that is *not* a number. A
percentage difference has five distinct ways of not existing, they look
identical as a blank cell, and they mean nothing alike — so each comes back
named (D-24).
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition


def _two_materials(db_session: Session) -> tuple[int, int]:
    rows = db_session.execute(select(Material.id).order_by(Material.id).limit(2)).scalars().all()
    return rows[0], rows[1]


def _compare(client: TestClient, **overrides: object):
    payload: dict[str, object] = {"property_slugs": ["densidade"]}
    payload.update(overrides)
    return client.post("/api/charts/compare", json=payload)


def _cell(body: dict, material_id: int, slug: str = "densidade") -> dict:
    row = next(m for m in body["materials"] if m["material_id"] == material_id)
    return next(c for c in row["cells"] if c["property_slug"] == slug)


def test_without_a_reference_every_cell_says_so(client: TestClient, db_session: Session) -> None:
    """Not a blank and not a zero: "no reference chosen" is a state of the
    question, and the table has to say which state it is in."""
    first, second = _two_materials(db_session)

    body = _compare(client, material_ids=[first, second]).json()

    assert _cell(body, second)["difference_state"] == "sem_referencia"
    assert _cell(body, second)["difference_pct"] is None


def test_the_reference_row_is_named_rather_than_printed_as_zero(
    client: TestClient, db_session: Session
) -> None:
    """Zero by definition — and "this is the reference" is more use to a reader
    than a 0 % that invites the question."""
    first, second = _two_materials(db_session)

    body = _compare(client, material_ids=[first, second], reference_id=first).json()

    assert _cell(body, first)["difference_state"] == "referencia"
    assert _cell(body, first)["difference_pct"] is None


def test_a_percentage_is_computed_against_the_reference(
    client: TestClient, db_session: Session
) -> None:
    klass = (
        db_session.execute(select(MaterialClass).where(MaterialClass.slug == "metais"))
        .scalars()
        .one()
    )
    density = (
        db_session.execute(select(PropertyDefinition).where(PropertyDefinition.slug == "densidade"))
        .scalars()
        .one()
    )
    made = []
    for name, value in (("Base de referência", 1000.0), ("Metade mais densa", 1500.0)):
        material = Material(name=name, class_id=klass.id, keywords=[])
        db_session.add(material)
        db_session.flush()
        db_session.add(
            MaterialPropertyValue(
                material_id=material.id,
                property_id=density.id,
                value_scalar=value,
                normalized_value=value,
                canonical_unit="kg/m**3",
                original_unit="kg/m**3",
                is_missing=False,
            )
        )
        made.append(material.id)
    db_session.flush()

    body = _compare(client, material_ids=made, reference_id=made[0]).json()

    cell = _cell(body, made[1])
    assert cell["difference_state"] == "calculada"
    assert cell["difference_pct"] == 50.0


def test_a_reference_outside_the_table_is_refused(client: TestClient, db_session: Session) -> None:
    """Measuring the rows against something the reader cannot see would make
    every percentage uncheckable."""
    first, second = _two_materials(db_session)

    response = _compare(client, material_ids=[first], reference_id=second)

    assert response.status_code == 400
    assert str(second) in response.text


def test_a_cell_with_no_value_says_the_value_is_missing(
    client: TestClient, db_session: Session
) -> None:
    klass = (
        db_session.execute(select(MaterialClass).where(MaterialClass.slug == "metais"))
        .scalars()
        .one()
    )
    density = (
        db_session.execute(select(PropertyDefinition).where(PropertyDefinition.slug == "densidade"))
        .scalars()
        .one()
    )
    reference = Material(name="Tem densidade", class_id=klass.id, keywords=[])
    barren = Material(name="Não tem densidade", class_id=klass.id, keywords=[])
    db_session.add_all([reference, barren])
    db_session.flush()
    db_session.add(
        MaterialPropertyValue(
            material_id=reference.id,
            property_id=density.id,
            value_scalar=1000.0,
            normalized_value=1000.0,
            canonical_unit="kg/m**3",
            original_unit="kg/m**3",
            is_missing=False,
        )
    )
    db_session.flush()

    body = _compare(
        client, material_ids=[reference.id, barren.id], reference_id=reference.id
    ).json()

    assert _cell(body, barren.id)["difference_state"] == "valor_ausente"


def test_a_reference_with_no_value_says_so_instead_of_blaming_the_row(
    client: TestClient, db_session: Session
) -> None:
    """A distinction that matters: the row is fine, the reference is the one
    that cannot answer, and telling the reader the opposite would send them to
    fix the wrong record."""
    klass = (
        db_session.execute(select(MaterialClass).where(MaterialClass.slug == "metais"))
        .scalars()
        .one()
    )
    density = (
        db_session.execute(select(PropertyDefinition).where(PropertyDefinition.slug == "densidade"))
        .scalars()
        .one()
    )
    barren = Material(name="Referência sem densidade", class_id=klass.id, keywords=[])
    complete = Material(name="Linha completa", class_id=klass.id, keywords=[])
    db_session.add_all([barren, complete])
    db_session.flush()
    db_session.add(
        MaterialPropertyValue(
            material_id=complete.id,
            property_id=density.id,
            value_scalar=1000.0,
            normalized_value=1000.0,
            canonical_unit="kg/m**3",
            original_unit="kg/m**3",
            is_missing=False,
        )
    )
    db_session.flush()

    body = _compare(client, material_ids=[barren.id, complete.id], reference_id=barren.id).json()

    assert _cell(body, complete.id)["difference_state"] == "referencia_ausente"


def test_a_zero_reference_has_no_ratio_and_says_which(
    client: TestClient, db_session: Session
) -> None:
    """Not an exception and not infinity: there is simply no ratio to a zero,
    and the cell reports that rather than the division."""
    klass = (
        db_session.execute(select(MaterialClass).where(MaterialClass.slug == "metais"))
        .scalars()
        .one()
    )
    density = (
        db_session.execute(select(PropertyDefinition).where(PropertyDefinition.slug == "densidade"))
        .scalars()
        .one()
    )
    made = []
    for name, value in (("Densidade zero", 0.0), ("Densidade normal", 1000.0)):
        material = Material(name=name, class_id=klass.id, keywords=[])
        db_session.add(material)
        db_session.flush()
        db_session.add(
            MaterialPropertyValue(
                material_id=material.id,
                property_id=density.id,
                value_scalar=value,
                normalized_value=value,
                canonical_unit="kg/m**3",
                original_unit="kg/m**3",
                is_missing=False,
            )
        )
        made.append(material.id)
    db_session.flush()

    body = _compare(client, material_ids=made, reference_id=made[0]).json()

    assert _cell(body, made[1])["difference_state"] == "referencia_zero"


def test_a_unit_without_a_true_zero_refuses_the_percentage_and_notes_why(
    client: TestClient, db_session: Session
) -> None:
    """The defensive case, and the reason ``is_ratio_scale`` exists: 20 °C is
    not twice 10 °C, so "+100%" there would be false with the full authority of
    a computed number. No catalogue property is in °C today — an operator can
    register one tomorrow."""
    klass = (
        db_session.execute(select(MaterialClass).where(MaterialClass.slug == "metais"))
        .scalars()
        .one()
    )
    celsius = PropertyDefinition(
        name="Temperatura de ensaio",
        slug="temp_ensaio_celsius",
        category="TERMICA",
        physical_dimension="[temperature]",
        canonical_unit="degC",
        accepted_units=["degC"],
    )
    db_session.add(celsius)
    db_session.flush()
    made = []
    for name, value in (("Ensaio a 10", 10.0), ("Ensaio a 20", 20.0)):
        material = Material(name=name, class_id=klass.id, keywords=[])
        db_session.add(material)
        db_session.flush()
        db_session.add(
            MaterialPropertyValue(
                material_id=material.id,
                property_id=celsius.id,
                value_scalar=value,
                normalized_value=value,
                canonical_unit="degC",
                original_unit="degC",
                is_missing=False,
            )
        )
        made.append(material.id)
    db_session.flush()

    body = _compare(
        client,
        material_ids=made,
        property_slugs=["temp_ensaio_celsius"],
        reference_id=made[0],
    ).json()

    cell = _cell(body, made[1], slug="temp_ensaio_celsius")
    assert cell["difference_state"] == "escala_sem_zero"
    assert cell["difference_pct"] is None
    assert any("zero verdadeiro" in note for note in body["notes"])


def test_when_both_sides_lack_the_value_the_reference_is_blamed(
    client: TestClient, db_session: Session
) -> None:
    """The guard order is a choice, not an accident, so it is pinned here.

    "The reference cannot answer" is the more actionable of the two: fixing the
    reference fixes the whole column, while fixing one row fixes one cell. A
    reader told "this row is missing a value" would go and fill in the row and
    find the cell still blank.
    """
    klass = (
        db_session.execute(select(MaterialClass).where(MaterialClass.slug == "metais"))
        .scalars()
        .one()
    )
    barren_reference = Material(name="Referência vazia", class_id=klass.id, keywords=[])
    barren_row = Material(name="Linha vazia", class_id=klass.id, keywords=[])
    db_session.add_all([barren_reference, barren_row])
    db_session.flush()

    body = _compare(
        client,
        material_ids=[barren_reference.id, barren_row.id],
        reference_id=barren_reference.id,
    ).json()

    assert _cell(body, barren_row.id)["difference_state"] == "referencia_ausente"


# --- A unidade de leitura não toca a diferença percentual (D-70) ------------


def test_a_leitura_sai_ao_lado_e_o_registro_nao_se_move(client: TestClient, db_session: Session):
    """A célula responde às duas perguntas, e nenhuma apaga a outra."""
    first, second = _two_materials(db_session)
    resp = _compare(
        client, material_ids=[first, second], property_slugs=["densidade"], reference_id=first
    )
    assert resp.status_code == 200
    cell = resp.json()["materials"][0]["cells"][0]

    # Densidade se lê em g/cm³, e o registro continua em kg/m³.
    assert cell["display_unit"] == "g/cm**3"
    if not cell["is_missing"]:
        assert cell["display_value"] is not None
        assert cell["value"] is not None
        # Três ordens de grandeza separam as duas leituras do mesmo número.
        assert cell["display_value"] < cell["value"]


def test_trocar_a_unidade_de_leitura_nao_move_a_diferenca_percentual(
    client: TestClient, db_session: Session
):
    """O teste que fixa a decisão central do D-70.

    Um percentual só significa algo em escala de razão, e `is_ratio_scale` é
    perguntado à unidade **canônica**. Se a escolha de leitura chegasse a essa
    pergunta, pedir °C para `temp_max_servico` ligaria uma coluna que não pode
    existir — "o dobro da temperatura" é falso numa escala sem zero verdadeiro —,
    e o número sairia com toda a autoridade de um valor calculado.

    Então a asserção é de invariância: a mesma comparação, lida em duas unidades
    diferentes, tem de devolver exatamente a mesma coluna de diferença.
    """
    first, second = _two_materials(db_session)

    pedido = {
        "material_ids": [first, second],
        "property_slugs": ["densidade", "modulo_young"],
        "reference_id": first,
    }
    canonica = client.post("/api/charts/compare", json=pedido).json()
    lida = client.post(
        "/api/charts/compare",
        json=pedido,
        params={"unidades": "modulo_young:MPa,densidade:kg/m**3"},
    ).json()

    for linha_a, linha_b in zip(canonica["materials"], lida["materials"], strict=True):
        assert linha_a["material_id"] == linha_b["material_id"]
        for cell_a, cell_b in zip(linha_a["cells"], linha_b["cells"], strict=True):
            assert cell_a["difference_pct"] == cell_b["difference_pct"]
            assert cell_a["difference_state"] == cell_b["difference_state"]
            # E o registro canônico também não se move — só a leitura muda.
            assert cell_a["value"] == cell_b["value"]

    # Prova de que a leitura de fato mudou, senão o teste acima passaria por
    # não ter acontecido nada.
    modulo_canonico = canonica["materials"][0]["cells"][1]
    modulo_lido = lida["materials"][0]["cells"][1]
    assert modulo_canonico["display_unit"] == "GPa"
    assert modulo_lido["display_unit"] == "MPa"
