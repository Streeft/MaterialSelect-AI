"""Composition: quality and source restated or kept (TM2-f), and one row at a time (TM2-g), D-255.

Before D-255 every write replaced the whole composition and every row came back
``ESTIMADO`` with a typed label: re-saving a form turned an ``IMPORTADO`` row
into an estimate. Now a row states its quality and source (a registered source
by id, or a label) or, when it replaces a stored row of the same element and
condition, keeps the stored ones; and a row can be added, rewritten or removed
alone, validated with the rest of the composition and audited.
"""

from __future__ import annotations

from sqlalchemy import select

from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.source import Source

POLYMER = "Polímero Demo C"


def _mid(db_session, name: str = POLYMER) -> int:
    return db_session.execute(select(Material.id).where(Material.name == name)).scalar_one()


def _put_all(client, mid: int, entries: list[dict]):
    return client.put(f"/api/materials/{mid}/composicao", json={"entries": entries})


def _add(client, mid: int, entry: dict):
    return client.post(f"/api/materials/{mid}/composicao/linhas", json=entry)


def _by_element(body: dict) -> dict[str, dict]:
    return {e["element"]: e for e in body["composition"]}


CR = {
    "element": "Cr",
    "value_min": 16,
    "value_max": 18,
    "unit": "%",
    "source_label": "Norma de teste",
    "data_quality": "IMPORTADO",
}


class TestQualityAndSource:
    def test_a_new_row_must_state_its_quality(self, client, db_session) -> None:
        mid = _mid(db_session)
        entry = {k: v for k, v in CR.items() if k != "data_quality"}
        response = _put_all(client, mid, [entry])
        assert response.status_code == 400
        assert "qualidade do dado de Cr" in response.json()["detail"]

    def test_a_resave_keeps_quality_and_source_it_does_not_restate(
        self, client, db_session
    ) -> None:
        mid = _mid(db_session)
        assert _put_all(client, mid, [CR]).status_code == 200
        resave = {"element": "Cr", "value_min": 16, "value_max": 19, "unit": "%"}
        body = _put_all(client, mid, [resave]).json()
        cr = _by_element(body)["Cr"]
        assert cr["data_quality"] == "IMPORTADO"  # never silently ESTIMADO
        assert cr["source_label"] == "Norma de teste"
        assert cr["value_max"] == 19

    def test_a_registered_source_is_chosen_by_id(self, client, db_session) -> None:
        mid = _mid(db_session)
        source = Source(label="Fonte cadastrada", is_demo=True)
        db_session.add(source)
        db_session.commit()
        entry = {**CR, "source_label": None, "source_id": source.id, "data_quality": "MEDIDO"}
        cr = _by_element(_put_all(client, mid, [entry]).json())["Cr"]
        assert (cr["source_id"], cr["source_label"], cr["data_quality"]) == (
            source.id,
            "Fonte cadastrada",
            "MEDIDO",
        )

    def test_an_unknown_source_id_is_refused(self, client, db_session) -> None:
        entry = {**CR, "source_label": None, "source_id": 987654}
        response = _put_all(client, _mid(db_session), [entry])
        assert response.status_code == 400
        assert "Fonte não encontrada" in response.json()["detail"]

    def test_id_and_label_together_are_refused(self, client, db_session) -> None:
        response = _put_all(client, _mid(db_session), [{**CR, "source_id": 1}])
        assert response.status_code == 422

    def test_a_demo_source_is_not_chosen_for_a_real_record(self, client, db_session) -> None:
        class_id = db_session.execute(
            select(MaterialClass.id).where(MaterialClass.slug == "metais")
        ).scalar_one()
        own = client.post(
            "/api/materials",
            json={"name": "Liga real", "class_id": class_id, "values": [], "is_own_record": True},
        ).json()["id"]
        demo = Source(label="Fonte fictícia", is_demo=True)
        db_session.add(demo)
        db_session.commit()
        response = _put_all(client, own, [{**CR, "source_label": None, "source_id": demo.id}])
        assert response.status_code == 400
        assert "demonstração" in response.json()["detail"]


class TestOneRow:
    def test_add_edit_and_remove_one_row_leave_the_others_alone(self, client, db_session) -> None:
        mid = _mid(db_session)
        base = _put_all(
            client,
            mid,
            [
                CR,
                {
                    "element": "Fe",
                    "state": "resto",
                    "source_label": "X",
                    "data_quality": "ESTIMADO",
                },
            ],
        ).json()
        fe_before = _by_element(base)["Fe"]

        added = _add(
            client,
            mid,
            {
                "element": "Ni",
                "value_nominal": 8,
                "unit": "%",
                "source_label": "Y",
                "data_quality": "MEDIDO",
            },
        )
        assert added.status_code == 201, added.text
        rows = _by_element(added.json())
        assert set(rows) == {"Cr", "Fe", "Ni"} and rows["Ni"]["data_quality"] == "MEDIDO"

        cr_id = rows["Cr"]["id"]
        edited = client.put(
            f"/api/materials/{mid}/composicao/linhas/{cr_id}",
            json={"element": "Cr", "value_min": 17, "value_max": 19, "unit": "%"},
        )
        assert edited.status_code == 200, edited.text
        rows = _by_element(edited.json())
        assert rows["Cr"]["id"] == cr_id and rows["Cr"]["value_min"] == 17
        assert rows["Cr"]["data_quality"] == "IMPORTADO"  # kept: not restated
        assert rows["Fe"] == fe_before

        removed = client.delete(f"/api/materials/{mid}/composicao/linhas/{rows['Ni']['id']}")
        assert removed.status_code == 200
        assert set(_by_element(removed.json())) == {"Cr", "Fe"}

    def test_a_new_row_is_validated_with_the_whole_composition(self, client, db_session) -> None:
        mid = _mid(db_session)
        _put_all(client, mid, [CR])
        duplicate = _add(client, mid, {**CR, "value_min": 1, "value_max": 2})
        assert duplicate.status_code == 400
        assert "mais de uma vez" in duplicate.json()["detail"]
        too_much = _add(
            client,
            mid,
            {
                "element": "Ni",
                "value_min": 90,
                "unit": "%",
                "source_label": "Y",
                "data_quality": "MEDIDO",
            },
        )
        assert too_much.status_code == 400
        assert len(client.get(f"/api/materials/{mid}").json()["composition"]) == 1

    def test_absence_has_no_number_one_row_at_a_time_too(self, client, db_session) -> None:
        mid = _mid(db_session)
        response = _add(
            client,
            mid,
            {
                "element": "Mo",
                "state": "ausente",
                "value_max": 1,
                "unit": "%",
                "source_label": "Y",
                "data_quality": "MEDIDO",
            },
        )
        assert response.status_code == 400

    def test_an_unknown_row_is_404(self, client, db_session) -> None:
        mid = _mid(db_session)
        assert client.delete(f"/api/materials/{mid}/composicao/linhas/999999").status_code == 404
        put = client.put(f"/api/materials/{mid}/composicao/linhas/999999", json=CR)
        assert put.status_code == 404

    def test_a_row_of_another_material_is_404(self, client, db_session) -> None:
        mid = _mid(db_session)
        other = _mid(db_session, "Aço Demo B")
        rows = _by_element(_put_all(client, other, [CR]).json())
        response = client.delete(f"/api/materials/{mid}/composicao/linhas/{rows['Cr']['id']}")
        assert response.status_code == 404

    def test_each_row_change_is_audited_with_quality_and_source(self, client, db_session) -> None:
        mid = _mid(db_session)
        _put_all(client, mid, [CR])
        cr_id = _by_element(client.get(f"/api/materials/{mid}").json())["Cr"]["id"]
        client.put(
            f"/api/materials/{mid}/composicao/linhas/{cr_id}",
            json={**CR, "data_quality": "MEDIDO"},
        )
        events = client.get("/api/audit", params={"entity_type": "material", "entity_id": mid})
        changes = [str(e["changes"]) for e in events.json()]
        assert any("MEDIDO" in c and "IMPORTADO" in c and "composição Cr" in c for c in changes)

        client.delete(f"/api/materials/{mid}/composicao/linhas/{cr_id}")
        after = client.get("/api/audit", params={"entity_type": "material", "entity_id": mid})
        assert len(after.json()) == len(changes) + 1
        assert client.get(f"/api/materials/{mid}").json()["composition"] == []
