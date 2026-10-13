"""Editing composition and designations by API (TM2-a, D-105).

Permission follows the material: an own record belongs to its owner, the shared
catalogue to a curator (D-83), and a record of the licensed official catalogue
(D-102) to nobody from here.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.config import settings
from app.models.catalog import CatalogDataset, CatalogRecordRef
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_composition import MaterialCompositionEntry

STEEL = "Aço Demo B"
POLYMER = "Polímero Demo C"


def _material_id(db_session, name: str) -> int:
    return db_session.execute(select(Material.id).where(Material.name == name)).scalar_one()


def _entry(element: str, **kw) -> dict:
    return {"element": element, "source_label": "Folha de especificação X", **kw}


def _put(client, material_id: int, entries: list[dict]):
    return client.put(f"/api/materials/{material_id}/composicao", json={"entries": entries})


def _own_record(client, db_session) -> int:
    class_id = db_session.execute(
        select(MaterialClass.id).where(MaterialClass.slug == "metais")
    ).scalar_one()
    response = client.post(
        "/api/materials",
        json={"name": "Liga própria", "class_id": class_id, "values": [], "is_own_record": True},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


class TestComposition:
    def test_a_material_without_composition_receives_one(self, client, db_session) -> None:
        mid = _material_id(db_session, POLYMER)
        response = _put(
            client,
            mid,
            [
                _entry("C", state="faixa", value_max=0.08, unit="%"),
                _entry("Cr", value_min=16, value_max=18, unit="%"),
                _entry("Fe", state="resto"),
                _entry("Mo", state="ausente"),
            ],
        )
        assert response.status_code == 200, response.text
        by_element = {e["element"]: e for e in response.json()["composition"]}
        assert by_element["Cr"]["normalized_min"] == 16
        assert by_element["C"]["normalized_min"] is None  # a maximum has no minimum, not 0
        assert by_element["Fe"]["state"] == "resto"
        assert by_element["Fe"]["normalized_min"] is None
        assert by_element["Mo"]["state"] == "ausente"
        assert by_element["Cr"]["source_label"] == "Folha de especificação X"

    def test_the_unit_is_converted_and_the_original_kept(self, client, db_session) -> None:
        mid = _material_id(db_session, POLYMER)
        body = _put(client, mid, [_entry("Cu", value_min=500, value_max=800, unit="ppm")]).json()
        (cu,) = body["composition"]
        assert (cu["value_min"], cu["original_unit"]) == (500, "ppm")
        assert cu["normalized_max"] == pytest.approx(0.08)
        assert cu["canonical_unit"] == "percent"

    def test_the_new_composition_is_searchable(self, client, db_session) -> None:
        mid = _material_id(db_session, POLYMER)
        _put(client, mid, [_entry("Cr", value_min=16, value_max=18, unit="%")])
        found = client.get("/api/materials/busca", params={"q": "comp:Cr>=17"}).json()["items"]
        assert POLYMER in [i["name"] for i in found]

    def test_replacing_removes_what_is_not_listed(self, client, db_session) -> None:
        mid = _material_id(db_session, STEEL)
        body = _put(client, mid, [_entry("Cr", value_nominal=18, unit="%")]).json()
        assert [e["element"] for e in body["composition"]] == ["Cr"]

    def test_an_empty_list_means_no_composition_not_zero(self, client, db_session) -> None:
        mid = _material_id(db_session, STEEL)
        body = _put(client, mid, []).json()
        assert body["composition"] == []
        found = client.get("/api/materials/busca", params={"q": "NOT comp:Cr>=12"}).json()
        assert STEEL not in [i["name"] for i in found["items"]]

    @pytest.mark.parametrize(
        "entries",
        [
            [_entry("Zz", value_max=1, unit="%")],
            [_entry("Fe", state="resto", value_min=50, unit="%")],
            [_entry("Cr", state="ausente", value_max=1, unit="%")],
            [_entry("Cr", unit="%")],
            [_entry("Cr", value_max=1)],
            [_entry("Cr", value_min=5, value_max=1, unit="%")],
            [_entry("Cr", value_max=120, unit="%")],
            [_entry("Cr", value_max=1, unit="kg")],
            [_entry("Cr", value_max=1, unit="%"), _entry("cr", value_max=2, unit="%")],
            [_entry("Fe", state="resto"), _entry("Ni", state="resto")],
            [_entry("Cr", value_min=60, unit="%"), _entry("Ni", value_min=50, unit="%")],
        ],
    )
    def test_invalid_rows_are_refused_and_nothing_is_stored(
        self, client, db_session, entries
    ) -> None:
        mid = _material_id(db_session, STEEL)
        before = (
            db_session.execute(
                select(MaterialCompositionEntry).where(MaterialCompositionEntry.material_id == mid)
            )
            .scalars()
            .all()
        )
        response = _put(client, mid, entries)
        assert response.status_code == 400, response.text
        db_session.expire_all()
        after = (
            db_session.execute(
                select(MaterialCompositionEntry).where(MaterialCompositionEntry.material_id == mid)
            )
            .scalars()
            .all()
        )
        assert len(after) == len(before) > 0

    def test_a_source_is_required(self, client, db_session) -> None:
        mid = _material_id(db_session, STEEL)
        response = client.put(
            f"/api/materials/{mid}/composicao",
            json={"entries": [{"element": "Cr", "value_max": 1, "unit": "%"}]},
        )
        assert response.status_code == 422

    def test_the_change_is_audited(self, client, db_session) -> None:
        mid = _material_id(db_session, POLYMER)
        _put(client, mid, [_entry("Cr", value_min=16, value_max=18, unit="%")])
        events = client.get(
            "/api/audit", params={"entity_type": "material", "entity_id": mid}
        ).json()
        assert any("composição Cr" in e["changes"] for e in events), events

    def test_an_unchanged_write_is_not_audited(self, client, db_session) -> None:
        mid = _material_id(db_session, POLYMER)
        entries = [_entry("Cr", value_min=16, value_max=18, unit="%")]
        _put(client, mid, entries)
        before = len(client.get("/api/audit", params={"entity_id": mid}).json())
        _put(client, mid, entries)
        assert len(client.get("/api/audit", params={"entity_id": mid}).json()) == before

    def test_an_own_record_is_editable_by_its_owner(self, client, db_session) -> None:
        mid = _own_record(client, db_session)
        assert _put(client, mid, [_entry("Al", value_min=99, unit="%")]).status_code == 200

    def test_someone_elses_own_record_is_a_404(self, client, db_session, other_user) -> None:
        from app.db.base import get_db  # noqa: F401
        from app.dependencies import get_current_user
        from app.main import app

        mid = _own_record(client, db_session)
        app.dependency_overrides[get_current_user] = lambda: other_user
        assert _put(client, mid, [_entry("Al", value_min=99, unit="%")]).status_code == 404

    def test_unknown_material_is_404(self, client) -> None:
        assert _put(client, 999999, []).status_code == 404

    def test_the_shared_catalogue_needs_a_curator(self, client, db_session, monkeypatch) -> None:
        monkeypatch.setattr(settings, "access_mode", "open")
        mid = _material_id(db_session, STEEL)
        response = _put(client, mid, [_entry("Cr", value_nominal=18, unit="%")])
        assert response.status_code == 403
        # ...but their own record is theirs.
        own = _own_record(client, db_session)
        assert _put(client, own, [_entry("Al", value_min=99, unit="%")]).status_code == 200

    def test_an_official_record_is_not_edited_by_hand(self, client, db_session) -> None:
        mid = _material_id(db_session, STEEL)
        dataset = CatalogDataset(
            slug="oficial-teste",
            name="Oficial",
            source_sha256="0" * 64,
            license_label="Licença de teste",
            created_at=datetime.now(UTC),
        )
        db_session.add(dataset)
        db_session.flush()
        db_session.add(
            CatalogRecordRef(
                dataset_id=dataset.id,
                external_table="t",
                external_record_id="1",
                raw_record_sha256="0" * 64,
                material_id=mid,
            )
        )
        db_session.commit()
        assert client.get(f"/api/materials/{mid}").json()["is_official"] is True
        assert _put(client, mid, []).status_code == 409
        assert (
            client.put(f"/api/materials/{mid}/designacoes", json={"designations": []}).status_code
            == 409
        )


def _designation(system: str, code: str, **kw) -> dict:
    return {"system": system, "code": code, "source_label": "Norma Y", **kw}


class TestDesignations:
    def _put(self, client, mid, items):
        return client.put(f"/api/materials/{mid}/designacoes", json={"designations": items})

    def test_designations_are_written_and_searchable(self, client, db_session) -> None:
        mid = _material_id(db_session, POLYMER)
        response = self._put(
            client,
            mid,
            [_designation("UNS", "S30400"), _designation("AISI_SAE", "304", region="EUA")],
        )
        assert response.status_code == 200, response.text
        codes = {(d["system_label"], d["code"]) for d in response.json()["designations"]}
        assert codes == {("UNS", "S30400"), ("AISI/SAE", "304")}
        found = client.get("/api/materials/busca", params={"q": "designacao:S30400"}).json()
        assert [i["name"] for i in found["items"]] == [POLYMER]

    def test_a_repeated_code_is_refused(self, client, db_session) -> None:
        mid = _material_id(db_session, POLYMER)
        response = self._put(
            client, mid, [_designation("UNS", "S30400"), _designation("UNS", "s 30400")]
        )
        assert response.status_code == 400

    def test_an_unknown_system_is_refused(self, client, db_session) -> None:
        mid = _material_id(db_session, POLYMER)
        assert self._put(client, mid, [_designation("XYZ", "1")]).status_code == 422

    def test_a_blank_code_is_refused(self, client, db_session) -> None:
        mid = _material_id(db_session, POLYMER)
        assert self._put(client, mid, [_designation("UNS", "   ")]).status_code == 400

    def test_the_change_is_audited(self, client, db_session) -> None:
        mid = _material_id(db_session, POLYMER)
        self._put(client, mid, [_designation("UNS", "S30400")])
        events = client.get("/api/audit", params={"entity_id": mid}).json()
        assert any("designação UNS S30400" in e["changes"] for e in events)

    def test_the_shared_catalogue_needs_a_curator(self, client, db_session, monkeypatch) -> None:
        monkeypatch.setattr(settings, "access_mode", "open")
        mid = _material_id(db_session, POLYMER)
        assert self._put(client, mid, [_designation("UNS", "S30400")]).status_code == 403
