"""The report of a project (D-263): the page and the trial as one document."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.material import Material
from app.models.user import User
from app.services.assembly_report_service import NOT_STORED_NOTICE, AssemblyReportService

LIGHT = {"operator": "lte", "property_slug": "densidade", "value": 5, "unit": "g/cm**3"}
TIE = {"key": "tirante-rigidez", "inputs": {"comprimento": 1.0, "rigidez": 1.0e6}}


def _material(db: Session, like: str) -> Material:
    return db.execute(select(Material).where(Material.name.like(like))).scalars().first()


def _post(client, path: str, body: dict) -> dict:
    resp = client.post(path, json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.fixture
def table(client, db_session) -> dict:
    """A table: a top that passes, a leg that fails its limit, a tie with a load and a nail with nothing."""
    aluminium = _material(db_session, "%Alumínio%")
    steel = _material(db_session, "Aço%")
    study = _post(client, "/api/selection/studies", {"name": "Leve", "constraints": [LIGHT]})
    project = _post(client, "/api/assemblies", {"name": "Mesa <b>de</b> jantar"})
    base = f"/api/assemblies/{project['id']}/parts"
    _post(
        client,
        base,
        {"name": "Tampo", "material_id": aluminium.id, "study_id": study["id"], "unit_mass": 10},
    )
    _post(
        client,
        base,
        {"name": "Perna", "quantity": 4, "material_id": steel.id, "study_id": study["id"]},
    )
    _post(
        client,
        base,
        {"name": "Tirante", "material_id": aluminium.id, "unit_mass": 0.001, "load_case": TIE},
    )
    _post(client, base, {"name": "Prego", "role": "fixacao"})
    return {"id": project["id"], "aluminium": aluminium, "steel": steel}


def _report(db_session, project_id: int):
    user = db_session.execute(select(User)).scalars().first()
    from app.models.project import Project

    owner = db_session.execute(select(Project)).scalars().first()
    return AssemblyReportService(db_session, owner.id, user).report(
        project_id, today=date(2026, 11, 20)
    )


def test_the_report_says_what_the_page_and_the_trial_say(client, db_session, table):
    page = client.get(f"/api/assemblies/{table['id']}").json()
    trial = client.get(f"/api/assemblies/{table['id']}/trial").json()
    report = _report(db_session, table["id"])

    assert report.title == "Laudo do projeto Mesa <b>de</b> jantar"
    assert (
        report.subtitle
        == f"{trial['verdict_label']}. {trial['summary']} Gerado em 20 de novembro de 2026."
    )
    assert [sheet.name for sheet in report.sheets] == [
        "Resumo",
        "Peças",
        "Números por peça",
        "Soma do projeto",
        "Ensaio",
        "Casos de carga declarados",
    ]
    for notice in (
        page["scope_note"],
        page["monetary_unit_note"],
        trial["method_note"],
        NOT_STORED_NOTICE,
    ):
        assert notice in report.notices

    summary = dict(report.sheet("Resumo").rows)
    assert summary["Peças"] == 4
    assert summary["Resultado do ensaio"] == "Ainda não solucionado"
    assert (summary["Peças que passam"], summary["Peças que não passam"]) == (
        trial["passed_count"],
        trial["failed_count"],
    )
    assert summary["Descrição"] == "não informado"

    # What each part is, and then its figures: the page's own numbers, in the page's order.
    top = report.sheet("Peças").rows[0]
    assert top == [
        "Tampo",
        "Estrutural",
        1,
        10.0,
        table["aluminium"].name,
        page["parts"][0]["material"]["class_name"],
        "Leve",
        "nenhum",
    ]
    figures = report.sheet("Números por peça")
    assert figures.header == [
        "Peça",
        "Massa (kg)",
        "Custo do material",
        "Energia incorporada (MJ)",
        "CO₂ da produção (kg de CO₂)",
    ]
    assert figures.rows[0] == [
        "Tampo",
        *(
            page["parts"][0][key]["value"]
            for key in ("mass", "material_cost", "embodied_energy", "carbon")
        ),
    ]


def test_an_absent_figure_is_written_as_its_reason(client, db_session, table):
    page = client.get(f"/api/assemblies/{table['id']}").json()
    report = _report(db_session, table["id"])
    leg, nail = report.sheet("Peças").rows[1], report.sheet("Peças").rows[3]
    # The leg has no declared mass: every figure carries the server's sentence, never a blank or a zero.
    assert leg[3] == "não informado"
    figures = report.sheet("Números por peça").rows[1]
    assert figures[1] == page["parts"][1]["mass"]["reason"]
    assert all(isinstance(cell, str) and cell for cell in figures[1:])
    assert nail[4:8] == ["não escolhido", "não informado", "nenhum", "nenhum"]
    assert nail[1] == "Fixação"

    # A sum that a part blocks is refused in the total's column and explained beside it.
    mass = report.sheet("Soma do projeto").rows[0]
    assert mass[:3] == ["Massa", "sem total", "kg"]
    assert "Falta dado em: Perna, Prego." in mass[3]
    assert "Soma parcial, de 2 peças: 10.001." in mass[3]
    # The cost keeps the server's own words for its unit: no currency is declared.
    cost = report.sheet("Soma do projeto").rows[1]
    assert cost[2] == page["totals"]["material_cost"]["unit"]


def test_the_trial_table_has_one_line_per_requirement(client, db_session, table):
    trial = client.get(f"/api/assemblies/{table['id']}/trial").json()
    rows = report_rows = _report(db_session, table["id"]).sheet("Ensaio").rows
    assert [row[0] for row in rows] == ["Tampo", "Perna", "Tirante", "Prego"]
    top, leg, tie, nail = report_rows
    assert top[3:] == ["Limite do estudo", "não se aplica", "não se aplica", "Passa", ""]
    assert leg[6] == "Não passa"
    # The load case carries the two masses the trial compared.
    required = trial["parts"][2]["requirements"][0]["required_value"]
    assert tie[2].startswith("Caso de carga: ")
    assert tie[3:7] == ["Caso de carga", pytest.approx(required), 0.001, "Não passa"]
    # A part that could not be tried says why, on its own line.
    assert nail[1:] == [
        "não informado",
        "nenhum requisito ensaiado",
        "não informado",
        "não informado",
        "não informado",
        "Sem material",
        "Escolha um material para a peça.",
    ]


def test_the_load_case_numbers_are_listed_to_be_redone_by_hand(client, db_session, table):
    rows = _report(db_session, table["id"]).sheet("Casos de carga declarados").rows
    assert [(row[0], row[2], row[3], row[4]) for row in rows] == [
        ("Tirante", "Comprimento", 1.0, "m"),
        ("Tirante", rows[1][2], 1.0e6, "N/m"),
    ]


def test_an_empty_project_still_reports(client, db_session):
    project = _post(client, "/api/assemblies", {"name": "Vazio"})
    report = _report(db_session, project["id"])
    assert report.sheet("Peças").notes == ["O projeto ainda não tem peças."]
    assert report.sheet("Casos de carga declarados").notes == [
        "Nenhuma peça declara um caso de carga."
    ]
    assert report.sheet("Soma do projeto").rows[0][3] == "O projeto ainda não tem peças."


@pytest.mark.parametrize("fmt", ["html", "csv", "xlsx", "docx"])
def test_the_report_downloads_in_each_format(client, table, fmt):
    resp = client.get(f"/api/exports/projetos/{table['id']}/laudo.{fmt}")
    assert resp.status_code == 200, resp.text
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert f"laudo-do-projeto-mesa-b-de-b-jantar.{fmt}" in resp.headers["content-disposition"]
    assert len(resp.content) > 500


def test_the_html_escapes_what_the_reader_typed_and_carries_no_script(client, table):
    resp = client.get(f"/api/exports/projetos/{table['id']}/laudo.html")
    assert (
        resp.headers["content-security-policy"] == "default-src 'none'; style-src 'unsafe-inline'"
    )
    assert resp.headers["content-disposition"].startswith("inline")
    body = resp.text
    assert "Mesa &lt;b&gt;de&lt;/b&gt; jantar" in body
    assert "<b>de</b>" not in body
    assert "<script" not in body.lower()
    for said in (
        "Ainda não solucionado",
        "Tampo",
        "Massa mínima (kg)",
        "Escolha um material para a peça.",
    ):
        assert said in body


def test_an_unknown_format_and_another_readers_project_are_refused(client, table):
    assert client.get(f"/api/exports/projetos/{table['id']}/laudo.pptx").status_code == 400
    assert client.get("/api/exports/projetos/999999/laudo.html").status_code == 404
