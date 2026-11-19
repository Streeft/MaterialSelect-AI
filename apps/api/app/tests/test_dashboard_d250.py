"""Painel, parte 8 (D-250): várias subclasses, correlação por classe e o
histórico do catálogo por release.

Fixture: os cinco materiais demo do seed base (ver ``test_dashboard_rich.py``)
e, onde dito, as duas releases fictícias do D-108 (``seed_demo_releases``).
Contas das releases, à mão, a partir de ``DEMO_RELEASES``:

  R1: 5 materiais, 3 classes (metais, polímeros, cerâmicas), 7 valores com
      número + 1 ausência declarada, 2 propriedades com número.
  R2: 5 materiais, 3 classes (metais, polímeros, compósitos), 10 valores com
      número, nenhuma ausência, 4 propriedades com número.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.calculations.correlation_matrix import correlation_cells
from app.catalog.release_counts import record_release_counts
from app.db.clear_demo import clear_demo_data
from app.db.seed_demo_releases import seed_demo_releases
from app.domain.dashboard_filters import MAX_SUBCLASSES, normalize_subclasses
from app.domain.errors import ValidationError
from app.domain.release_history import ReleaseEntry, ReleaseTally, build_history
from app.models.catalog import CatalogDataset, CatalogReleaseCount
from app.repositories.release_count_repository import ReleaseCountRepository

BASE = "/api/dashboard"
R1, R2 = "catalogo-demo-r1", "catalogo-demo-r2"


def _get(client: TestClient, path: str, **params) -> dict:
    response = client.get(f"{BASE}{path}", params=params)
    assert response.status_code == 200, response.text
    return response.json()


# --- Várias subclasses (D-250) ------------------------------------------------


class TestManySubclasses:
    def test_two_subclasses_are_a_union(self, client: TestClient) -> None:
        both = _get(client, "/overview", subclasse=["Laminado", "Liga leve"])
        assert both["materials"] == 2
        assert both["filters"]["subclasses"] == ["Laminado", "Liga leve"]
        # Each alone, for the hand count.
        assert _get(client, "/overview", subclasse="Laminado")["materials"] == 1
        assert _get(client, "/overview", subclasse="Liga leve")["materials"] == 1

    def test_order_and_repeats_do_not_change_the_answer(self, client: TestClient) -> None:
        a = _get(client, "/overview", subclasse=["Liga leve", "Laminado"])
        b = _get(client, "/overview", subclasse=["Laminado", "Liga leve", "Laminado", " "])
        assert a["materials"] == b["materials"] == 2
        assert a["coverage"] == b["coverage"]
        assert b["filters"]["subclasses"] == ["Laminado", "Liga leve"]

    def test_no_subclass_echoes_an_empty_list(self, client: TestClient) -> None:
        assert _get(client, "/overview")["filters"]["subclasses"] == []

    def test_every_route_honours_the_list(self, client: TestClient) -> None:
        params = {"subclasse": ["Laminado", "Liga leve"]}
        assert _get(client, "/composition", **params)["filters"]["materials"] == 2
        top = _get(client, "/top", propriedade="densidade", **params)
        assert {i["name"] for i in top["items"]} == {"Compósito Demo E", "Liga Alumínio Demo A"}

    def test_too_many_subclasses_is_refused(self, client: TestClient) -> None:
        names = [f"Sub {i}" for i in range(MAX_SUBCLASSES + 1)]
        response = client.get(f"{BASE}/overview", params={"subclasse": names})
        assert response.status_code == 400

    def test_the_csv_names_every_subclass(self, client: TestClient) -> None:
        response = client.get(
            f"{BASE}/export.csv", params={"secao": "visao", "subclasse": ["Laminado", "Liga leve"]}
        )
        assert response.status_code == 200
        assert "subclasse=Laminado | Liga leve" in response.text

    def test_normalize_is_pure(self) -> None:
        assert normalize_subclasses(None) == ()
        assert normalize_subclasses([" A ", "B", "A", ""]) == ("A", "B")
        with pytest.raises(ValidationError):
            normalize_subclasses(["x" * 201])


# --- Correlação por classe (D-250) --------------------------------------------


class TestCorrelationCells:
    def test_absent_values_are_absent_not_zero(self) -> None:
        # Five materials carry x; y misses material 5. A zero in its place
        # would change the coefficient; absence only drops the pair.
        columns = {
            "x": {1: 1.0, 2: 2.0, 3: 3.0, 4: 4.0, 5: 5.0},
            "y": {1: 10.0, 2: 20.0, 3: 30.0, 4: 40.0},
        }
        cells = {(c.x, c.y): c for c in correlation_cells(columns, ["x", "y"])}
        assert cells[("x", "y")].pairs == 4
        assert cells[("x", "y")].rho is None  # 4 < MIN_PAIRS: undefined, never 0
        assert cells[("y", "y")].rho is None
        assert cells[("x", "x")].rho == 1.0

    def test_deterministic_whatever_the_row_order(self) -> None:
        a = {
            "x": {1: 3.0, 2: 1.0, 3: 2.0, 4: 5.0, 5: 4.0},
            "y": {5: 1.0, 4: 2.0, 3: 3.0, 2: 4.0, 1: 5.0},
        }
        b = {"x": dict(reversed(list(a["x"].items()))), "y": dict(sorted(a["y"].items()))}
        assert correlation_cells(a, ["x", "y"]) == correlation_cells(b, ["x", "y"])

    def test_no_variance_is_none(self) -> None:
        columns = {"x": {i: 1.0 for i in range(1, 7)}, "y": {i: float(i) for i in range(1, 7)}}
        cell = next(c for c in correlation_cells(columns, ["x", "y"]) if (c.x, c.y) == ("x", "y"))
        assert cell.pairs == 6 and cell.rho is None


class TestCorrelationByClass:
    def test_one_panel_per_class_largest_first(self, client: TestClient) -> None:
        data = _get(client, "/correlation/by-class", propriedades="densidade,modulo_young")
        assert [p["class_slug"] for p in data["panels"]][0] == "metais"
        assert {p["class_slug"]: p["materials"] for p in data["panels"]} == {
            "metais": 2,
            "polimeros": 1,
            "ceramicas": 1,
            "compositos": 1,
        }
        assert data["omitted_classes"] == 0
        assert data["min_pairs"] == 5
        assert [p["slug"] for p in data["properties"]] == ["densidade", "modulo_young"]
        # Overall count: every material carrying the property, over all panels.
        assert data["properties"][0]["count"] == 5

    def test_a_small_class_has_no_coefficient_never_zero(self, client: TestClient) -> None:
        data = _get(client, "/correlation/by-class", propriedades="densidade,modulo_young")
        metais = next(p for p in data["panels"] if p["class_slug"] == "metais")
        assert metais["counts"] == {"densidade": 2, "modulo_young": 2}
        assert len(metais["cells"]) == 4
        for cell in metais["cells"]:
            assert cell["rho"] is None
            assert cell["rho"] != 0

    def test_a_panel_is_the_class_filtered_matrix(
        self, client: TestClient, db_session: Session
    ) -> None:
        seed_demo_releases(db_session)  # metais: 8 materials, 6 with E
        db_session.flush()
        props = "densidade,modulo_young"
        panel = next(
            p
            for p in _get(client, "/correlation/by-class", propriedades=props)["panels"]
            if p["class_slug"] == "metais"
        )
        alone = _get(client, "/correlation", propriedades=props, classe="metais")
        assert panel["cells"] == alone["cells"]
        assert panel["materials"] == alone["filters"]["materials"] == 8
        cross = next(c for c in panel["cells"] if (c["x"], c["y"]) == ("densidade", "modulo_young"))
        assert cross["pairs"] == 6 and cross["rho"] is not None

    def test_same_answer_twice(self, client: TestClient) -> None:
        first = _get(client, "/correlation/by-class")
        second = _get(client, "/correlation/by-class")
        assert first == second
        n = len(first["properties"])
        assert 0 < n <= 6
        assert all(len(p["cells"]) == n * n for p in first["panels"])

    def test_filters_narrow_the_panels(self, client: TestClient) -> None:
        data = _get(client, "/correlation/by-class", classe="metais")
        assert [p["class_slug"] for p in data["panels"]] == ["metais"]
        assert _get(client, "/correlation/by-class", demo="reais")["panels"] == []

    def test_unknown_property_is_404(self, client: TestClient) -> None:
        response = client.get(f"{BASE}/correlation/by-class", params={"propriedades": "xyz"})
        assert response.status_code == 404


# --- Histórico do catálogo por release (D-250) --------------------------------


def _tally(**kw: int) -> ReleaseTally:
    base = dict(
        materials=0,
        classes=0,
        properties=0,
        values_filled=0,
        values_declared_missing=0,
        processes=0,
    )
    base.update(kw)
    return ReleaseTally(**base)


class TestBuildHistory:
    def test_change_is_against_the_previous_of_the_same_lineage(self) -> None:
        points = build_history(
            [
                ReleaseEntry("a1", "A", _tally(materials=5, values_filled=8)),
                ReleaseEntry("b1", "B", _tally(materials=2)),
                ReleaseEntry("a2", "A", _tally(materials=7, values_filled=6)),
            ]
        )
        assert [p.previous_key for p in points] == [None, None, "a1"]
        assert points[0].change is None  # the first of a lineage: no change, never "+5"
        assert points[2].change == _tally(materials=2, values_filled=-2)

    def test_no_lineage_is_comparable_with_nothing(self) -> None:
        points = build_history(
            [ReleaseEntry("x", None, _tally(materials=1)), ReleaseEntry("y", None, _tally())]
        )
        assert [p.change for p in points] == [None, None]

    def test_share_is_none_without_values(self) -> None:
        (point,) = build_history([ReleaseEntry("x", "L", _tally(materials=3))])
        assert point.filled_share_pct is None
        (point,) = build_history(
            [ReleaseEntry("x", "L", _tally(values_filled=3, values_declared_missing=1))]
        )
        assert point.filled_share_pct == 75.0


class TestReleaseHistory:
    def test_empty_catalogue_history(self, client: TestClient) -> None:
        assert _get(client, "/releases") == {"demo": "todos", "points": []}

    def test_the_demo_seed_keeps_each_release_counts(
        self, client: TestClient, db_session: Session
    ) -> None:
        seed_demo_releases(db_session)
        db_session.flush()
        data = _get(client, "/releases")
        assert [p["slug"] for p in data["points"]] == [R1, R2]
        r1, r2 = data["points"]
        assert r1["counts"] == {
            "materials": 5,
            "classes": 3,
            "properties": 2,
            "values_filled": 7,
            "values_declared_missing": 1,
            "processes": 0,
        }
        assert r1["filled_share_pct"] == 87.5
        assert r1["change"] is None and r1["previous_slug"] is None
        assert r2["counts"]["values_filled"] == 10
        assert r2["counts"]["properties"] == 4
        assert r2["filled_share_pct"] == 100.0
        assert r2["previous_slug"] == R1
        assert r2["change"] == {
            "materials": 0,
            "classes": 0,
            "properties": 2,
            "values_filled": 3,
            "values_declared_missing": -1,
            "processes": 0,
        }
        assert r1["origin"] == "import" and r1["is_demo"] is True

    def test_only_the_demo_filter_applies(self, client: TestClient, db_session: Session) -> None:
        seed_demo_releases(db_session)
        db_session.flush()
        assert _get(client, "/releases", demo="reais")["points"] == []
        assert len(_get(client, "/releases", demo="demo")["points"]) == 2
        # A class filter cannot narrow whole-release counts.
        assert len(_get(client, "/releases", classe="metais")["points"]) == 2

    def test_a_rerun_recounts_one_row_per_release(self, db_session: Session) -> None:
        seed_demo_releases(db_session)
        seed_demo_releases(db_session)
        db_session.flush()
        assert db_session.scalar(select(func.count(CatalogReleaseCount.id))) == 2

    def test_measure_matches_the_rows(self, db_session: Session) -> None:
        seed_demo_releases(db_session)
        db_session.flush()
        r1 = db_session.scalar(select(CatalogDataset).where(CatalogDataset.slug == R1))
        assert r1 is not None
        tally = ReleaseCountRepository(db_session).measure(r1.id)
        assert tally == _tally(
            materials=5, classes=3, properties=2, values_filled=7, values_declared_missing=1
        )

    def test_unknown_origin_is_refused(self, db_session: Session) -> None:
        seed_demo_releases(db_session)
        db_session.flush()
        r1 = db_session.scalar(select(CatalogDataset).where(CatalogDataset.slug == R1))
        assert r1 is not None
        with pytest.raises(ValueError):
            record_release_counts(db_session, r1, origin="manual")

    def test_clear_demo_takes_the_counts_with_the_release(self, db_session: Session) -> None:
        seed_demo_releases(db_session)
        db_session.flush()
        clear_demo_data(db_session)
        db_session.flush()
        assert db_session.scalar(select(func.count(CatalogReleaseCount.id))) == 0
