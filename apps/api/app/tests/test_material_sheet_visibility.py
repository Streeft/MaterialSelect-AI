"""The complete material sheet (HTML for "Salvar como PDF") for every record a
user can see, and for nothing else (D-125).

Production showed ``{"detail": "Not Found"}`` at ``/api/exports/materiais/133.html``:
the web app (published by Vercel on merge) linked to a route the deployed API
did not have yet. These tests pin the route the button builds, the four kinds of
record a reader can open (demo, own, shared catalogue, official licensed), the
two that must stay invisible (missing, someone else's), and the written pt-BR
404 that replaces Starlette's bare one.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.exporters.report import REPRODUCIBILITY_NOTICE
from app.main import app
from app.models.catalog import CatalogDataset, CatalogRecordRef
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.user import User
from app.routers.exports import HTML_CSP
from app.tests.removed_notices import assert_no_removed_notice

ROUTE = "/api/exports/materiais/{material_id}.{fmt}"


def _class_id(db) -> int:
    return db.execute(select(MaterialClass.id).where(MaterialClass.slug == "metais")).scalar_one()


def _material(db, name: str, *, owner: User | None = None, demo: bool = False) -> int:
    material = Material(
        name=name,
        class_id=_class_id(db),
        keywords=[],
        owner_id=owner.id if owner else None,
        is_demo=demo,
    )
    db.add(material)
    db.flush()
    return material.id


def _official(db) -> int:
    mid = _material(db, "Liga Oficial da Ficha")
    dataset = CatalogDataset(
        slug="oficial-ficha",
        name="Oficial",
        source_sha256="0" * 64,
        license_label="Licença de teste",
        created_at=datetime.now(UTC),
    )
    db.add(dataset)
    db.flush()
    db.add(
        CatalogRecordRef(
            dataset_id=dataset.id,
            external_table="t",
            external_record_id="ficha-1",
            raw_record_sha256="0" * 64,
            material_id=mid,
        )
    )
    db.commit()
    return mid


def _assert_printable_sheet(response, name: str) -> str:
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["content-disposition"].startswith("inline")
    assert response.headers["content-security-policy"] == HTML_CSP
    text = response.text
    assert f"Ficha técnica — {name}" in text
    assert REPRODUCIBILITY_NOTICE in text
    assert_no_removed_notice(text)
    assert "@page" in text  # the print stylesheet that makes "Salvar como PDF" work
    return text


def test_the_route_the_button_builds_is_mounted() -> None:
    """apps/web/lib/api.ts materialExportUrl builds exactly this path."""
    assert ROUTE in app.openapi()["paths"]


def test_demo_material_sheet(client, db_session) -> None:
    mid = db_session.execute(select(Material.id).where(Material.name == "Aço Demo B")).scalar_one()
    text = _assert_printable_sheet(
        client.get(ROUTE.format(material_id=mid, fmt="html")), "Aço Demo B"
    )
    # D-138: a demo record prints no demo warning nor a "Dados demonstrativos" row.
    assert "dados demonstrativos" not in text.lower()


def test_own_material_sheet(client, db_session, test_user) -> None:
    mid = _material(db_session, "Meu Registro da Ficha", owner=test_user)
    db_session.commit()
    _assert_printable_sheet(
        client.get(ROUTE.format(material_id=mid, fmt="html")), "Meu Registro da Ficha"
    )


def test_shared_catalogue_material_sheet(client, db_session) -> None:
    mid = _material(db_session, "Registro do Catálogo da Ficha")
    db_session.commit()
    _assert_printable_sheet(
        client.get(ROUTE.format(material_id=mid, fmt="html")), "Registro do Catálogo da Ficha"
    )


def test_official_licensed_material_sheet(client, db_session) -> None:
    mid = _official(db_session)
    text = _assert_printable_sheet(
        client.get(ROUTE.format(material_id=mid, fmt="html")), "Liga Oficial da Ficha"
    )
    assert re.search(
        r"Registro oficial</td>\s*<td[^>]*>Sim<", text
    ), "faltou 'Registro oficial: Sim'"


@pytest.mark.parametrize("fmt", ["csv", "xlsx"])
def test_official_material_sheet_in_spreadsheets(client, db_session, fmt: str) -> None:
    mid = _official(db_session)
    assert client.get(ROUTE.format(material_id=mid, fmt=fmt)).status_code == 200


def test_missing_material_is_a_written_404(client) -> None:
    response = client.get(ROUTE.format(material_id=999_999, fmt="html"))
    assert response.status_code == 404
    detail = response.json()["detail"]
    assert detail != "Not Found"
    assert "não encontrado" in detail.lower()


def test_another_persons_material_is_the_same_written_404(client, db_session, other_user) -> None:
    mid = _material(db_session, "Registro Alheio da Ficha", owner=other_user)
    db_session.commit()
    response = client.get(ROUTE.format(material_id=mid, fmt="html"))
    assert response.status_code == 404
    assert "Registro Alheio da Ficha" not in response.text
    assert response.json()["detail"] != "Not Found"


def test_an_unknown_route_answers_in_portuguese(client) -> None:
    """What production showed before the API was deployed: a route that does
    not exist. It must say so in pt-BR, not as Starlette's bare "Not Found"."""
    response = client.get("/api/exports/rota-que-nao-existe/1.html")
    assert response.status_code == 404
    detail = response.json()["detail"]
    assert detail != "Not Found"
    assert "Endereço não encontrado na API" in detail
    assert "/api/exports/rota-que-nao-existe/1.html" in detail
