"""``GET /api/exports/materiais/{id}/cae`` (D-104): the route around the renderers.

The renderers are proved in ``test_cae_exporters.py``. This file proves what
only the route can get wrong: visibility (D-62 — another person's record is a
404), the subscription gate, the refusal status, and the file headers.

The three property definitions the demo seed does not carry (Poisson's ratio,
thermal expansion, specific heat) are created here, inside the test
transaction, for a **fictitious** own record — exactly how a curator would add
them to a real catalogue.
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import BetterDirection, PropertyCategory
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition
from app.models.user import User

URL = "/api/exports/materiais/{id}/cae?formato={fmt}&unidades={units}"
NAME = "Liga Fictícia CAE-API (demonstração)"

_EXTRA_PROPERTIES = (
    ("coef_poisson", "Coeficiente de Poisson", "", "dimensionless", PropertyCategory.MECANICA),
    (
        "coef_expansao_termica",
        "Coeficiente de expansão térmica",
        "1 / [temperature]",
        "1/K",
        PropertyCategory.TERMICA,
    ),
    (
        "calor_especifico",
        "Calor específico",
        "[length] ** 2 / [time] ** 2 / [temperature]",
        "J/(kg*K)",
        PropertyCategory.TERMICA,
    ),
)


def _define_extra_properties(db: Session) -> None:
    for slug, name, dimension, unit, category in _EXTRA_PROPERTIES:
        db.add(
            PropertyDefinition(
                slug=slug,
                name=name,
                category=category,
                physical_dimension=dimension,
                canonical_unit=unit,
                accepted_units=[unit],
                is_interval=False,
                better_direction=BetterDirection.NEUTRAL,
            )
        )
    db.flush()


def _metals_id(db: Session) -> int:
    return (
        db.execute(select(MaterialClass).where(MaterialClass.slug == "metais")).scalars().one().id
    )


def _own_full_record(client: TestClient, db: Session, name: str = NAME) -> int:
    _define_extra_properties(db)
    db.commit()
    response = client.post(
        "/api/materials",
        json={
            "name": name,
            "class_id": _metals_id(db),
            "is_own_record": True,
            "values": [
                {"property_slug": "densidade", "kind": "scalar", "value": 7.85, "unit": "g/cm**3"},
                {"property_slug": "modulo_young", "kind": "scalar", "value": 210, "unit": "GPa"},
                {
                    "property_slug": "coef_poisson",
                    "kind": "scalar",
                    "value": 0.3,
                    "unit": "dimensionless",
                },
                {
                    "property_slug": "coef_expansao_termica",
                    "kind": "scalar",
                    "value": 1.2e-5,
                    "unit": "1/K",
                },
            ],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_every_format_downloads_as_an_attachment(client: TestClient, db_session: Session) -> None:
    material_id = _own_full_record(client, db_session)
    for fmt, extension in (
        ("mapdl", "-mapdl.inp"),
        ("abaqus", "-abaqus.inp"),
        ("nastran", "-nastran.bdf"),
        ("lsdyna", "-lsdyna.k"),
        ("matml", "-matml.xml"),
    ):
        response = client.get(URL.format(id=material_id, fmt=fmt, units="mm-t-s"))
        assert response.status_code == 200, (fmt, response.text)
        disposition = response.headers["content-disposition"]
        assert disposition.startswith("attachment;")
        assert extension in disposition
        assert response.headers["x-content-type-options"] == "nosniff"
        assert "Registro pr" in response.text  # own record declared


def test_the_card_is_converted_into_the_chosen_system(
    client: TestClient, db_session: Session
) -> None:
    material_id = _own_full_record(client, db_session)
    mapdl = client.get(URL.format(id=material_id, fmt="mapdl", units="mm-t-s")).text
    assert "MP,EX,MATID,210000.\n" in mapdl
    assert "MP,DENS,MATID,7.85E-09\n" in mapdl
    assert "/UNITS,MPA\n" in mapdl
    # Conductivity and specific heat were never registered for this record.
    assert "MP,KXX" not in mapdl.replace("! MP,KXX", "")
    si = client.get(URL.format(id=material_id, fmt="mapdl", units="m-kg-s")).text
    assert "MP,EX,MATID,210000000000.\n" in si and "MP,DENS,MATID,7850.\n" in si


def test_a_demo_material_without_poisson_is_refused_with_422(
    client: TestClient, db_session: Session
) -> None:
    demo = (
        db_session.execute(
            select(Material).where(Material.is_demo.is_(True), Material.owner_id.is_(None))
        )
        .scalars()
        .first()
    )
    assert demo is not None
    response = client.get(URL.format(id=demo.id, fmt="abaqus", units="m-kg-s"))
    assert response.status_code == 422
    assert "coeficiente de Poisson" in response.json()["detail"]

    # MatML has no minimum beyond one property, and says the data is fictitious.
    matml = client.get(URL.format(id=demo.id, fmt="matml", units="m-kg-s"))
    assert matml.status_code == 200, matml.text
    assert "MATERIAL FICTÍCIO" in matml.text
    assert "Esta ferramenta destina-se a apoio didático" in matml.text


def test_unknown_format_or_system_is_a_400_naming_the_options(
    client: TestClient, db_session: Session
) -> None:
    demo = db_session.execute(select(Material)).scalars().first()
    assert demo is not None
    bad_format = client.get(URL.format(id=demo.id, fmt="step", units="m-kg-s"))
    assert bad_format.status_code == 400 and "lsdyna" in bad_format.json()["detail"]
    bad_units = client.get(URL.format(id=demo.id, fmt="matml", units="cgs"))
    assert bad_units.status_code == 400 and "in-lbf-s" in bad_units.json()["detail"]
    # The system is never defaulted: a solver deck in a guessed system is wrong.
    missing = client.get(f"/api/exports/materiais/{demo.id}/cae?formato=matml")
    assert missing.status_code == 422


def test_another_persons_record_is_not_found(
    client: TestClient, db_session: Session, login_as, other_user: User
) -> None:
    with login_as(other_user):
        material_id = _own_full_record(client, db_session, name="Liga alheia fictícia")
        assert (
            client.get(URL.format(id=material_id, fmt="matml", units="m-kg-s")).status_code == 200
        )
    response = client.get(URL.format(id=material_id, fmt="matml", units="m-kg-s"))
    assert response.status_code == 404
    assert "Liga alheia" not in response.text


def test_a_missing_material_is_not_found(client: TestClient) -> None:
    assert client.get(URL.format(id=999999, fmt="matml", units="m-kg-s")).status_code == 404


def test_the_subscription_gate_applies(
    client_without_subscription: TestClient, db_session: Session
) -> None:
    demo = db_session.execute(select(Material)).scalars().first()
    assert demo is not None
    response = client_without_subscription.get(URL.format(id=demo.id, fmt="matml", units="m-kg-s"))
    assert response.status_code == 403


def test_a_value_declared_missing_never_becomes_zero_on_the_route(
    client: TestClient, db_session: Session
) -> None:
    material_id = _own_full_record(client, db_session)
    density = (
        db_session.execute(select(PropertyDefinition).where(PropertyDefinition.slug == "densidade"))
        .scalars()
        .one()
    )
    row = (
        db_session.execute(
            select(MaterialPropertyValue).where(
                MaterialPropertyValue.material_id == material_id,
                MaterialPropertyValue.property_id == density.id,
            )
        )
        .scalars()
        .one()
    )
    row.is_missing = True
    row.value_scalar = row.normalized_value = None
    db_session.commit()
    text = client.get(URL.format(id=material_id, fmt="mapdl", units="m-kg-s")).text
    assert "MP,DENS" not in text.replace("! MP,DENS", "")
    assert "nao cadastrado (declarado ausente no catalogo)" in text
    lsdyna = client.get(URL.format(id=material_id, fmt="lsdyna", units="m-kg-s"))
    assert lsdyna.status_code == 422 and "densidade" in lsdyna.json()["detail"]
