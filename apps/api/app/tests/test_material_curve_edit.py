"""Writing curves by API (TM4-d, D-106): same permission rule as TM2-a, same audit."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.config import settings
from app.models.catalog import CatalogDataset, CatalogRecordRef
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_curve import MaterialCurve

STEEL = "Aço Demo B"


def _material_id(db_session, name: str = STEEL) -> int:
    return db_session.execute(select(Material.id).where(Material.name == name)).scalar_one()


def _curve(**overrides) -> dict:
    body = {
        "kind": "TENSAO_DEFORMACAO",
        "title": "Ensaio de tração (mão)",
        "x_quantity": "deformacao",
        "x_unit": "%",
        "y_quantity": "tensao",
        "y_unit": "MPa",
        "source_label": "Relatório de ensaio Z",
        "series": [
            {
                "points": [
                    {"x": 0, "y": 0},
                    {"x": 0.2, "y": 400},
                    {"x": 1.5, "y": 520, "y_min": 500, "y_max": 540},
                ]
            }
        ],
    }
    body.update(overrides)
    return body


def _own_record(client, db_session) -> int:
    class_id = db_session.execute(
        select(MaterialClass.id).where(MaterialClass.slug == "metais")
    ).scalar_one()
    response = client.post(
        "/api/materials",
        json={"name": "Liga própria", "class_id": class_id, "values": [], "is_own_record": True},
    )
    return response.json()["id"]


def _count(db_session, mid: int) -> int:
    db_session.expire_all()
    return len(
        db_session.execute(select(MaterialCurve.id).where(MaterialCurve.material_id == mid)).all()
    )


class TestKinds:
    def test_the_form_vocabulary_is_the_builders_table(self, client) -> None:
        body = client.get("/api/materials/curvas-tipos").json()
        by_kind = {k["kind"]: k for k in body}
        assert set(by_kind) == {
            "TENSAO_DEFORMACAO", "TEMPERATURA", "TAXA", "FADIGA", "FLUENCIA",
        }  # fmt: skip
        fatigue = by_kind["FADIGA"]
        assert [q["key"] for q in fatigue["x_quantities"]] == ["ciclos"]
        assert {q["key"] for q in fatigue["parameter_quantities"]} == {
            "razao_tensao",
            "temperatura",
        }


class TestCreate:
    def test_a_curve_is_stored_converted_and_drawable(self, client, db_session) -> None:
        mid = _material_id(db_session)
        before = _count(db_session, mid)
        response = client.post(f"/api/materials/{mid}/curvas", json=_curve())
        assert response.status_code == 201, response.text
        assert response.json()["point_count"] == 3
        assert _count(db_session, mid) == before + 1
        drawn = client.get(f"/api/materials/{mid}/curvas/{response.json()['id']}")
        assert drawn.status_code == 200
        (series,) = drawn.json()["series"]
        # The source's own numbers are kept next to the converted ones.
        assert series["points"][1]["x_original"] == 0.2
        assert series["points"][1]["y_original"] == 400
        assert drawn.json()["x_axis"]["original_unit"] == "%"

    def test_it_is_audited(self, client, db_session) -> None:
        mid = _material_id(db_session)
        client.post(f"/api/materials/{mid}/curvas", json=_curve())
        events = client.get("/api/audit", params={"entity_id": mid}).json()
        assert any("curva Ensaio de tração (mão)" in e["changes"] for e in events)

    @pytest.mark.parametrize(
        "patch",
        [
            {"x_quantity": "temperatura"},  # the kind does not admit it
            {"y_unit": "kg"},  # wrong dimension
            {"series": []},
            {"series": [{"points": [{"x": 0, "y": 0}]}]},  # one point is a scalar
            {"series": [{"points": [{"x": 1, "y": 0}, {"x": 1, "y": 5}]}]},  # x not increasing
            {"series": [{"points": [{"x": 0, "y": 0}, {"x": 1, "y": 5, "y_min": 1}]}]},
            {"series": [{"points": [{"x": 0, "y": 0}, {"x": 1, "y": 5, "y_min": 6, "y_max": 7}]}]},
            {"parameter_quantity": "temperatura"},  # family without per-series values
        ],
    )
    def test_invalid_curves_are_refused_and_nothing_is_stored(
        self, client, db_session, patch
    ) -> None:
        mid = _material_id(db_session)
        before = _count(db_session, mid)
        response = client.post(f"/api/materials/{mid}/curvas", json=_curve(**patch))
        assert response.status_code == 400, response.text
        assert _count(db_session, mid) == before

    def test_a_source_is_required(self, client, db_session) -> None:
        body = _curve()
        del body["source_label"]
        assert (
            client.post(f"/api/materials/{_material_id(db_session)}/curvas", json=body).status_code
            == 422
        )

    def test_a_family_keeps_its_parameter_trail(self, client, db_session) -> None:
        mid = _material_id(db_session)
        body = _curve(
            parameter_quantity="temperatura",
            series=[
                {
                    "parameter": 20,
                    "parameter_unit": "degC",
                    "points": [{"x": 0, "y": 0}, {"x": 1, "y": 300}],
                },
                {
                    "parameter": 200,
                    "parameter_unit": "degC",
                    "points": [{"x": 0, "y": 0}, {"x": 1, "y": 250}],
                },
            ],
        )
        response = client.post(f"/api/materials/{mid}/curvas", json=body)
        assert response.status_code == 201, response.text
        drawn = client.get(f"/api/materials/{mid}/curvas/{response.json()['id']}").json()
        assert [s["parameter_original"] for s in drawn["series"]] == [20, 200]


class TestReplaceAndDelete:
    def _create(self, client, mid) -> int:
        return client.post(f"/api/materials/{mid}/curvas", json=_curve()).json()["id"]

    def test_replace_keeps_the_id_and_swaps_the_series(self, client, db_session) -> None:
        mid = _material_id(db_session)
        cid = self._create(client, mid)
        new = _curve(
            title="Ensaio revisado",
            series=[{"points": [{"x": 0, "y": 0}, {"x": 2, "y": 450}]}],
        )
        response = client.put(f"/api/materials/{mid}/curvas/{cid}", json=new)
        assert response.status_code == 200, response.text
        assert (response.json()["id"], response.json()["title"], response.json()["point_count"]) == (
            cid, "Ensaio revisado", 2,
        )  # fmt: skip
        events = client.get("/api/audit", params={"entity_id": mid}).json()
        assert any("curva Ensaio revisado" in e["changes"] for e in events)

    def test_a_refused_replace_leaves_the_curve_intact(self, client, db_session) -> None:
        mid = _material_id(db_session)
        cid = self._create(client, mid)
        bad = _curve(series=[{"points": [{"x": 1, "y": 0}, {"x": 0, "y": 5}]}])
        assert client.put(f"/api/materials/{mid}/curvas/{cid}", json=bad).status_code == 400
        assert client.get(f"/api/materials/{mid}/curvas/{cid}").json()["title"] == (
            "Ensaio de tração (mão)"
        )

    def test_delete_removes_it_and_is_audited(self, client, db_session) -> None:
        mid = _material_id(db_session)
        before = _count(db_session, mid)
        cid = self._create(client, mid)
        assert client.delete(f"/api/materials/{mid}/curvas/{cid}").status_code == 204
        assert _count(db_session, mid) == before
        assert client.get(f"/api/materials/{mid}/curvas/{cid}").status_code == 404

    def test_a_curve_of_another_material_is_a_404(self, client, db_session) -> None:
        mid = _material_id(db_session)
        cid = self._create(client, mid)
        other = _material_id(db_session, "Polímero Demo C")
        assert client.put(f"/api/materials/{other}/curvas/{cid}", json=_curve()).status_code == 404
        assert client.delete(f"/api/materials/{other}/curvas/{cid}").status_code == 404

    def test_an_official_curve_is_not_edited(self, client, db_session) -> None:
        mid = _material_id(db_session)
        cid = self._create(client, mid)
        dataset = CatalogDataset(
            slug="oficial-curvas", name="Oficial", source_sha256="0" * 64,
            license_label="Licença de teste", created_at=datetime.now(UTC),
        )  # fmt: skip
        db_session.add(dataset)
        db_session.flush()
        curve = db_session.get(MaterialCurve, cid)
        curve.dataset_id, curve.external_id, curve.raw_sha256 = dataset.id, "c1", "0" * 64
        db_session.commit()
        assert client.put(f"/api/materials/{mid}/curvas/{cid}", json=_curve()).status_code == 409
        assert client.delete(f"/api/materials/{mid}/curvas/{cid}").status_code == 409


class TestPermission:
    def test_the_shared_catalogue_needs_a_curator(self, client, db_session, monkeypatch) -> None:
        monkeypatch.setattr(settings, "access_mode", "open")
        mid = _material_id(db_session)
        assert client.post(f"/api/materials/{mid}/curvas", json=_curve()).status_code == 403

    def test_an_own_record_belongs_to_its_owner(self, client, db_session, monkeypatch) -> None:
        monkeypatch.setattr(settings, "access_mode", "open")
        own = _own_record(client, db_session)
        assert client.post(f"/api/materials/{own}/curvas", json=_curve()).status_code == 201

    def test_someone_elses_record_is_a_404(self, client, db_session, other_user) -> None:
        from app.dependencies import get_current_user
        from app.main import app

        own = _own_record(client, db_session)
        app.dependency_overrides[get_current_user] = lambda: other_user
        assert client.post(f"/api/materials/{own}/curvas", json=_curve()).status_code == 404

    def test_an_official_material_is_not_edited(self, client, db_session) -> None:
        mid = _material_id(db_session)
        dataset = CatalogDataset(
            slug="oficial-mat", name="Oficial", source_sha256="0" * 64,
            license_label="Licença de teste", created_at=datetime.now(UTC),
        )  # fmt: skip
        db_session.add(dataset)
        db_session.flush()
        db_session.add(
            CatalogRecordRef(
                dataset_id=dataset.id, external_table="t", external_record_id="1",
                raw_record_sha256="0" * 64, material_id=mid,
            )
        )  # fmt: skip
        db_session.commit()
        assert client.post(f"/api/materials/{mid}/curvas", json=_curve()).status_code == 409
