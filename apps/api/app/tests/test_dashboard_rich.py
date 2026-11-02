"""The rich panel (D-193): filters, composition, processes, sources, histogram,
top N, correlation, activity and CSV.

Fixture: the five seeded demo materials (see ``test_dashboard_api.py`` for the
full hand count). The numbers below are worked out by hand from the seed:

  Material                 classe      subclasse        ρ (kg/m³)  E (GPa)
  Liga Alumínio Demo A     metais      Liga leve          2700       69
  Aço Demo B               metais      Aço estrutural     7850      210
  Polímero Demo C          polimeros   Termoplástico      1050        2,5
  Cerâmica Demo D          ceramicas   Óxido técnico      3900      380
  Compósito Demo E         compositos  Laminado           1600      120

Spearman(ρ, E): ranks ρ = (3,5,1,4,2), E = (2,4,1,5,3); Σd² = 4, so
ρ_s = 1 − 6·4 / (5·24) = 0,8.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.audit import AuditEvent
from app.models.enums import AuditAction, AuditEntityType
from app.models.notebook import AIUsage

BASE = "/api/dashboard"


def _get(client: TestClient, path: str, **params) -> dict:
    response = client.get(f"{BASE}{path}", params=params)
    assert response.status_code == 200, response.text
    return response.json()


class TestFilters:
    def test_class_filter_narrows_every_count(self, client: TestClient) -> None:
        data = _get(client, "/overview", classe="metais")
        assert data["materials"] == 2
        assert data["filters"] == {
            "class_slug": "metais",
            "subclass": None,
            "level": 3,
            "demo": "todos",
            "materials": 2,
        }
        # Only the kept class is listed once a filter narrows the materials.
        assert [c["slug"] for c in data["by_class"]] == ["metais"]

    def test_subclass_filter_is_exact(self, client: TestClient) -> None:
        assert _get(client, "/overview", subclasse="Laminado")["materials"] == 1
        assert _get(client, "/overview", subclasse="Lamin")["materials"] == 0

    def test_demo_filter(self, client: TestClient) -> None:
        assert _get(client, "/overview", demo="demo")["materials"] == 5
        reais = _get(client, "/overview", demo="reais")
        assert reais["materials"] == 0
        # Nothing to cover: no percentage, never 0 % (D-24).
        assert reais["coverage"]["filled_pct"] is None

    def test_level_hides_properties_not_materials(self, client: TestClient) -> None:
        full = _get(client, "/overview")
        level1 = _get(client, "/overview", nivel=1)
        assert level1["materials"] == full["materials"] == 5
        assert level1["properties"] < full["properties"] == 48
        slugs = {p["slug"] for p in level1["by_property"]}
        assert "densidade" in slugs and "coef_poisson" not in slugs
        assert level1["coverage"]["slots"] == 5 * level1["properties"]

    def test_unknown_class_gives_an_empty_panel_not_everything(self, client: TestClient) -> None:
        assert _get(client, "/overview", classe="nao-existe")["materials"] == 0

    def test_invalid_level_is_refused(self, client: TestClient) -> None:
        assert client.get(f"{BASE}/overview", params={"nivel": 4}).status_code == 422


class TestComposition:
    def test_counts_and_treemap_tile_the_box(self, client: TestClient) -> None:
        data = _get(client, "/composition")
        classes = [c for c in data["cells"] if c["depth"] == 0]
        assert {c["class_slug"]: c["count"] for c in classes} == {
            "metais": 2,
            "polimeros": 1,
            "ceramicas": 1,
            "compositos": 1,
        }
        # Largest first.
        assert classes[0]["class_slug"] == "metais"
        area = sum((c["x1"] - c["x0"]) * (c["y1"] - c["y0"]) for c in classes)
        assert area == pytest.approx(data["width"] * data["height"], rel=1e-3)
        # Areas are proportional to counts: metais holds 2/5 of the box.
        metais = classes[0]
        assert (metais["x1"] - metais["x0"]) * (metais["y1"] - metais["y0"]) == pytest.approx(
            0.4 * data["width"] * data["height"], rel=1e-3
        )

    def test_subclasses_sit_inside_their_class(self, client: TestClient) -> None:
        cells = _get(client, "/composition")["cells"]
        metais = next(c for c in cells if c["depth"] == 0 and c["class_slug"] == "metais")
        subs = [c for c in cells if c["depth"] == 1 and c["class_slug"] == "metais"]
        assert {s["subclass"] for s in subs} == {"Liga leve", "Aço estrutural"}
        for s in subs:
            assert metais["x0"] - 1e-6 <= s["x0"] <= s["x1"] <= metais["x1"] + 1e-6
            assert metais["y0"] - 1e-6 <= s["y0"] <= s["y1"] <= metais["y1"] + 1e-6


class TestProcesses:
    def test_processes_per_family_and_materials_per_process(self, client: TestClient) -> None:
        data = _get(client, "/processes")
        assert data["processes"] == 13
        by_slug = {p["slug"]: p for p in data["by_process"]}
        assert len(by_slug) == 13
        assert by_slug["usinagem-convencional"]["materials"] == 3
        assert by_slug["usinagem-convencional"]["share_pct"] == 60.0
        # Sorted by reach, most-used first.
        assert data["by_process"][0]["materials"] == 3
        families = {f["slug"]: f for f in data["families"]}
        assert families["conformacao-solido"]["processes"] == 3
        assert families["conformacao-solido"]["root_slug"] == "conformacao"
        assert data["materials_with_process"] + data["materials_without_process"] == 5

    def test_filter_reaches_the_process_counts(self, client: TestClient) -> None:
        data = _get(client, "/processes", classe="polimeros")
        reached = {p["slug"]: p["materials"] for p in data["by_process"] if p["materials"]}
        assert all(count == 1 for count in reached.values())
        # Every active process still listed: a zero here is a real count of links.
        assert len(data["by_process"]) == 13


class TestSources:
    def test_quality_per_source(self, client: TestClient) -> None:
        data = _get(client, "/sources")
        assert data["values"] == 53
        (source,) = data["sources"]
        assert source["label"] == "Dataset Demo MaterialSelect"
        assert source["estimado"] == 53
        assert source["declared_missing"] == 5
        assert source["materials"] == 5
        assert source["share_pct"] == 100.0


class TestPropertyStats:
    def test_histogram_and_summary_in_reading_unit(self, client: TestClient) -> None:
        data = _get(client, "/property/densidade")
        assert data["display_unit"] == "g/cm**3"
        assert data["count"] == 5
        assert data["median"] == pytest.approx(2.7)
        assert data["minimum"] == pytest.approx(1.05)
        assert data["maximum"] == pytest.approx(7.85)
        assert data["mean"] == pytest.approx((2.7 + 7.85 + 1.05 + 3.9 + 1.6) / 5)
        assert sum(b["count"] for b in data["bins"]) == 5
        assert data["bins"][0]["lower"] == pytest.approx(1.05)
        assert data["bins"][-1]["upper"] == pytest.approx(7.85)

    def test_property_without_values_has_no_statistics(self, client: TestClient) -> None:
        # resistencia_fadiga is one of the 33 extended properties nobody seeded here.
        data = _get(client, "/property/resistencia_fadiga")
        assert data["count"] == 0
        assert data["bins"] == []
        for key in ("minimum", "median", "maximum", "mean"):
            assert data[key] is None
        assert data["not_recorded"] == 5

    def test_unknown_property_is_404(self, client: TestClient) -> None:
        assert client.get(f"{BASE}/property/nao_existe").status_code == 404


class TestTop:
    def test_best_follows_better_direction(self, client: TestClient) -> None:
        data = _get(client, "/top", propriedade="densidade", n=2)
        assert data["direction"] == "menor"
        assert [i["name"] for i in data["items"]] == ["Polímero Demo C", "Compósito Demo E"]
        assert data["items"][0]["value"] == pytest.approx(1.05)
        assert data["ranked"] == 5 and data["without_value"] == 0

    def test_worst(self, client: TestClient) -> None:
        data = _get(client, "/top", propriedade="densidade", n=1, ordem="pior")
        assert data["items"][0]["name"] == "Aço Demo B"

    def test_missing_values_are_counted_not_ranked(self, client: TestClient) -> None:
        data = _get(client, "/top", propriedade="custo_massa", n=10)
        assert data["ranked"] == 2
        assert data["without_value"] == 3
        assert len(data["items"]) == 2

    def test_index(self, client: TestClient) -> None:
        data = _get(client, "/top", indice="rigidez-especifica", n=5)
        assert data["kind"] == "index"
        assert [i["name"] for i in data["items"]] == [
            "Cerâmica Demo D",
            "Compósito Demo E",
            "Aço Demo B",
            "Liga Alumínio Demo A",
            "Polímero Demo C",
        ]

    def test_property_and_index_together_is_refused(self, client: TestClient) -> None:
        response = client.get(
            f"{BASE}/top", params={"propriedade": "densidade", "indice": "rigidez-especifica"}
        )
        assert response.status_code == 400


class TestCorrelation:
    def test_spearman_hand_worked(self, client: TestClient) -> None:
        data = _get(client, "/correlation", propriedades="densidade,modulo_young")
        cells = {(c["x"], c["y"]): c for c in data["cells"]}
        assert cells[("densidade", "modulo_young")]["rho"] == pytest.approx(0.8)
        assert cells[("modulo_young", "densidade")]["rho"] == pytest.approx(0.8)
        assert cells[("densidade", "densidade")]["rho"] == 1.0
        assert cells[("densidade", "modulo_young")]["pairs"] == 5

    def test_too_few_pairs_is_null_never_zero(self, client: TestClient) -> None:
        data = _get(client, "/correlation", propriedades="densidade,custo_massa")
        cell = next(c for c in data["cells"] if c["x"] == "densidade" and c["y"] == "custo_massa")
        assert cell["pairs"] == 2
        assert cell["rho"] is None

    def test_default_matrix_is_square(self, client: TestClient) -> None:
        data = _get(client, "/correlation", nivel=1)
        n = len(data["properties"])
        assert 0 < n <= 12
        assert len(data["cells"]) == n * n

    def test_unknown_property_is_404(self, client: TestClient) -> None:
        response = client.get(f"{BASE}/correlation", params={"propriedades": "densidade,xyz"})
        assert response.status_code == 404


class TestActivity:
    def test_only_my_numbers(
        self, client: TestClient, db_session: Session, test_user, other_user
    ) -> None:
        today = datetime.now(UTC).date()
        db_session.add(AIUsage(user_id=test_user.id, day=today, requests=3, artifacts=1))
        db_session.add(AIUsage(user_id=other_user.id, day=today, requests=40, artifacts=9))
        for user in (test_user, other_user):
            db_session.add(
                AuditEvent(
                    user_id=user.id,
                    user_email=user.email,
                    entity_type=AuditEntityType.MATERIAL,
                    entity_id=1,
                    entity_label=f"Material de {user.name}",
                    action=AuditAction.ATUALIZADO,
                )
            )
        db_session.commit()

        data = _get(client, "/activity")
        assert data["ai"]["today"]["requests"] == 3
        assert data["ai"]["today"]["artifacts"] == 1
        assert len(data["ai"]["days"]) == 14
        assert data["actions"] == {"ATUALIZADO": 1}
        assert [e["entity_label"] for e in data["recent"]] == ["Material de Usuário de teste"]
        assert len(data["months"]) == 12

    def test_a_study_counts_in_its_month(self, client: TestClient) -> None:
        response = client.post("/api/selection/studies", json={"name": "Estudo do painel"})
        assert response.status_code in (200, 201), response.text
        data = _get(client, "/activity")
        assert data["studies"] == 1
        assert data["months"][-1]["studies"] == 1


class TestExport:
    @pytest.mark.parametrize(
        "secao", ["visao", "propriedades", "processos", "qualidade", "atividade"]
    )
    def test_csv_per_tab(self, client: TestClient, secao: str) -> None:
        response = client.get(f"{BASE}/export.csv", params={"secao": secao, "classe": "metais"})
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/csv")
        assert f"painel-{secao}.csv" in response.headers["content-disposition"]
        assert "classe=metais" in response.text

    def test_absent_percentage_is_written_in_words(self, client: TestClient) -> None:
        response = client.get(
            f"{BASE}/export.csv", params={"secao": "propriedades", "demo": "reais"}
        )
        assert response.status_code == 200
        # No material passes the filter: every coverage is "sem pares", not 0.
        assert "sem pares" in response.text
        assert ",0.0\r\n" not in response.text

    def test_unknown_section_is_422(self, client: TestClient) -> None:
        assert client.get(f"{BASE}/export.csv", params={"secao": "x"}).status_code == 422
