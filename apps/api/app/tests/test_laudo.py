"""The visual engineering report and its issued versions (D-241, revising D-41).

The laudo now opens with a cover and an executive summary, puts one section per
tool that had data, and keeps every audit table in the annex. Issuing freezes
it: stored HTML, inputs and the SHA-256 that a public route verifies.
"""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.exporters.laudo import DRAFT_MARK, SEAL_CLOSE, SEAL_OPEN, laudo_digest, short_code
from app.models.issued_report import IssuedReport
from app.models.material_property_value import MaterialPropertyValue

ENGINEER = {
    "engineer_name": "Ana Souza",
    "engineer_title": "Engenheira mecânica",
    "engineer_registration": "CREA-SP 5069999999",
    "art_number": "28027230241234567",
    "city": "São Carlos",
    "issue_date": "2026-11-16",
    "client_name": "Cliente Sigiloso Ltda.",
    "client_project": "Projeto X",
}


def _study(client: TestClient, **overrides) -> int:
    payload = {
        "name": "Estudo do laudo",
        "description": "Suporte leve e rígido.",
        "constraints": [
            {"operator": "gt", "property_slug": "modulo_young", "value": 1.0, "unit": "GPa"}
        ],
        "index": {
            "name": "Viga leve",
            "expression": "sqrt(modulo_young) / densidade",
            "goal": "maximize",
        },
        "criteria": [
            {"key": "__index__", "weight": 2.0},
            {"key": "densidade", "weight": 1.0},
            {"key": "modulo_young", "weight": 1.0},
        ],
    }
    payload.update(overrides)
    response = client.post("/api/selection/studies", json=payload)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _preview(client: TestClient, study_id: int, **params) -> str:
    response = client.get(f"/api/exports/estudos/{study_id}/laudo.html", params=params)
    assert response.status_code == 200, response.text
    return response.text


class TestStructure:
    def test_the_document_reads_cover_summary_sections_then_annex(self, client) -> None:
        text = _preview(client, _study(client))
        order = [
            "<h1>Laudo de engenharia — Estudo do laudo",
            'id="resumo"',
            "Por que este material",
            'id="comparacao"',
            'id="custo"',
            'id="eco"',
            'id="fabricacao"',
            'id="interpretacao"',
            'id="assinatura"',
            "Anexo técnico</h2>",
            "Proveniência",
        ]
        positions = [text.index(marker) for marker in order]
        assert positions == sorted(positions)

    def test_the_summary_names_the_recommended_material(self, client) -> None:
        text = _preview(client, _study(client))
        assert "Material recomendado" in text
        assert "1º de " in text and "classificados por soma ponderada" in text

    def test_a_preview_carries_the_draft_watermark_and_no_code(self, client) -> None:
        text = _preview(client, _study(client))
        assert 'class="watermark"' in text and DRAFT_MARK in text
        assert "Código de verificação" not in text

    def test_charts_are_the_backend_svg(self, client) -> None:
        text = _preview(client, _study(client))
        assert "Requisitos e verificações" in text
        assert "Verificações atendidas" in text  # the donut
        assert "Desempenho normalizado por critério" in text  # radar: three criteria
        assert "Mapa de seleção" in text

    def test_without_part_mass_cost_and_eco_are_not_evaluated(self, client) -> None:
        text = _preview(client, _study(client))
        assert text.count("Não avaliado.</strong>") >= 2
        assert "Informe a massa da peça" in text
        assert "Custo por peça conforme o lote" not in text

    def test_with_part_mass_cost_comes_from_the_estimator(self, client) -> None:
        text = _preview(client, _study(client), massa=1.5, lote=2000)
        assert "Custo por peça no lote de 2.000 peças" in text
        assert "Custo por peça conforme o lote" in text
        assert "Premissas do estimador" in text

    def test_absent_data_is_a_word_never_a_zero(self, client) -> None:
        text = _preview(client, _study(client))
        # The cost and CO₂ cards say "não avaliado", not 0.
        assert "não avaliado" in text
        assert '<div class="value">0<span class="unit">u.m.' not in text
        assert '<div class="value">0<span class="unit">kg CO₂' not in text

    def test_a_study_without_objective_recommends_nothing_and_says_why(self, client) -> None:
        study_id = _study(client, name="Só limites", index=None, criteria=[])
        text = _preview(client, study_id)
        assert "O estudo não tem índice nem critérios de classificação" in text
        assert "Sem material recomendado, não há processo a indicar." in text

    def test_the_annex_keeps_every_audit_table(self, client) -> None:
        text = _preview(client, _study(client))
        annex = text[text.index("Anexo técnico") :]
        for expected in (
            "Problema",
            "Limites e funil",
            "Candidatos",
            "Contribuições",
            "Excluídos por dado ausente",
            "Sensibilidade",
            "Proveniência",
        ):
            assert expected in annex

    def test_declared_fields_are_escaped(self, client) -> None:
        text = _preview(client, _study(client), cliente="<img src=x onerror=alert(1)>")
        assert "<img src=x" not in text
        assert "&lt;img src=x" in text

    def test_docx_and_pptx_still_export(self, client) -> None:
        study_id = _study(client)
        for fmt in ("docx", "pptx"):
            response = client.get(f"/api/exports/estudos/{study_id}/laudo.{fmt}")
            assert response.status_code == 200, response.text
            assert response.headers["content-disposition"].startswith("attachment")


class TestIssue:
    def _issue(self, client: TestClient, study_id: int, **extra) -> dict:
        response = client.post(
            f"/api/exports/estudos/{study_id}/laudo/emitir", json={**ENGINEER, **extra}
        )
        assert response.status_code == 201, response.text
        return response.json()

    def test_issuing_freezes_a_version_with_its_code(self, client, db_session: Session) -> None:
        study_id = _study(client)
        issued = self._issue(client, study_id)
        assert issued["version"] == 1
        assert len(issued["content_sha256"]) == 64
        assert issued["short_code"] == short_code(issued["content_sha256"])
        assert issued["verify_url"].endswith(issued["content_sha256"])

        stored = db_session.execute(select(IssuedReport)).scalars().one()
        assert laudo_digest(stored.html) == stored.content_sha256
        assert stored.inputs["engineer_name"] == "Ana Souza"
        assert DRAFT_MARK not in stored.html
        assert issued["short_code"] in stored.html
        assert 'aria-label="QR code de verificação do laudo"' in stored.html

    def test_the_digest_covers_the_content_not_the_seal(self) -> None:
        body = f"<p>a</p>{SEAL_OPEN}{SEAL_CLOSE}<p>b</p>"
        sealed = body.replace(SEAL_OPEN + SEAL_CLOSE, f"{SEAL_OPEN}<svg>qr</svg>{SEAL_CLOSE}")
        assert laudo_digest(body) == laudo_digest(sealed)
        assert laudo_digest(body) != laudo_digest(body.replace("<p>b</p>", "<p>c</p>"))

    def test_the_same_inputs_render_the_same_bytes(self, client) -> None:
        study_id = _study(client)
        assert _preview(client, study_id, responsavel="Ana") == _preview(
            client, study_id, responsavel="Ana"
        )

    def test_versions_increment_and_each_has_its_own_code(self, client) -> None:
        study_id = _study(client)
        first = self._issue(client, study_id)
        second = self._issue(client, study_id)
        assert (first["version"], second["version"]) == (1, 2)
        assert first["content_sha256"] != second["content_sha256"]
        listed = client.get(f"/api/exports/estudos/{study_id}/laudo/versoes").json()
        assert [v["version"] for v in listed] == [2, 1]

    def test_an_issued_version_never_changes(self, client, db_session: Session) -> None:
        study_id = _study(client)
        self._issue(client, study_id)
        url = f"/api/exports/estudos/{study_id}/laudo/versoes/1.html"
        before = client.get(url)
        assert before.status_code == 200
        assert before.headers["content-security-policy"].startswith("default-src 'none'")

        # The catalogue moves on: every Young's modulus doubles.
        for value in db_session.execute(select(MaterialPropertyValue)).scalars():
            if value.property_definition.slug == "modulo_young" and value.normalized_value:
                value.normalized_value = value.normalized_value * 2
        db_session.commit()

        assert client.get(url).text == before.text

    def test_issuing_requires_who_where_and_when(self, client) -> None:
        study_id = _study(client)
        response = client.post(
            f"/api/exports/estudos/{study_id}/laudo/emitir", json={"engineer_name": "Ana"}
        )
        assert response.status_code == 400
        detail = response.json()["detail"]
        assert "título profissional" in detail and "data de emissão" in detail

    def test_only_the_owner_issues_or_reads(self, client, other_user, login_as) -> None:
        study_id = _study(client)
        self._issue(client, study_id)
        with login_as(other_user):
            refused = client.post(f"/api/exports/estudos/{study_id}/laudo/emitir", json=ENGINEER)
            assert refused.status_code == 404
            assert client.get(f"/api/exports/estudos/{study_id}/laudo/versoes").status_code == 404
            assert (
                client.get(f"/api/exports/estudos/{study_id}/laudo/versoes/1.html").status_code
                == 404
            )

    def test_an_unknown_version_is_404(self, client) -> None:
        study_id = _study(client)
        assert (
            client.get(f"/api/exports/estudos/{study_id}/laudo/versoes/9.html").status_code == 404
        )


class TestVerification:
    def test_the_public_check_shows_only_what_is_public(self, client, anon_client) -> None:
        study_id = _study(client)
        issued = client.post(f"/api/exports/estudos/{study_id}/laudo/emitir", json=ENGINEER).json()
        response = anon_client.get(f"/api/laudos/verificar/{issued['content_sha256']}")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["valid"] is True
        assert body["study_name"] == "Estudo do laudo"
        assert body["version"] == 1
        assert body["engineer_name"] == "Ana Souza"
        assert body["issue_date"] == date(2026, 11, 16).isoformat()
        assert "Cliente Sigiloso" not in response.text
        assert "html" not in body and "inputs" not in body

    def test_the_printed_short_code_verifies_too(self, client, anon_client) -> None:
        study_id = _study(client)
        issued = client.post(f"/api/exports/estudos/{study_id}/laudo/emitir", json=ENGINEER).json()
        response = anon_client.get(f"/api/laudos/verificar/{issued['short_code']}")
        assert response.status_code == 200
        assert response.json()["content_sha256"] == issued["content_sha256"]

    def test_a_browser_gets_a_page(self, client, anon_client) -> None:
        study_id = _study(client)
        issued = client.post(f"/api/exports/estudos/{study_id}/laudo/emitir", json=ENGINEER).json()
        response = anon_client.get(
            f"/api/laudos/verificar/{issued['content_sha256']}",
            headers={"Accept": "text/html,application/xhtml+xml"},
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/html")
        assert "Laudo emitido e registrado" in response.text
        assert "Cliente Sigiloso" not in response.text

    def test_an_unknown_or_malformed_code_is_404(self, anon_client) -> None:
        assert anon_client.get("/api/laudos/verificar/" + "0" * 64).status_code == 404
        assert anon_client.get("/api/laudos/verificar/abc").status_code == 404
        assert anon_client.get("/api/laudos/verificar/zzzzzzzzzzzzzz").status_code == 404
