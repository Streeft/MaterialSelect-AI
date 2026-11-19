"""The laudo's annex reads the few values it shows, not the whole catalogue (D-249).

The ``laudo.html`` preview re-runs the study and, with the full demo catalogue, held ~75 MB of
Python per request. 66 MB of it was the ORM values of every candidate (about 50 each) that the
provenance table never read: it shows only the properties the decision rested on. The records are
now loaded without their values and those few come back as plain rows. The ceiling that guards the
order of magnitude is in ``test_memory_per_request``; these tests guard the *shape* of the fix,
on the small test catalogue, so a regression shows up here in a second and not in production.
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from app.models.material import Material
from app.repositories.chart_repository import ChartRepository, ValueRow
from app.tests.test_laudo import _study


def _ids(db: Session, count: int = 3) -> list[int]:
    return list(db.execute(select(Material.id).order_by(Material.id).limit(count)).scalars())


def test_materials_can_be_loaded_without_touching_their_values(db_session: Session) -> None:
    repo = ChartRepository(db_session)
    ids = _ids(db_session)
    bare = repo.list_materials(material_ids=ids, with_values=False)
    assert {m.id for m in bare} == set(ids)
    # Lazy, not empty: a later read still gets every value (nothing is left partial).
    assert all("property_values" in inspect(m).unloaded for m in bare)
    assert all(len(m.property_values) > 1 for m in bare)


def test_value_rows_are_plain_rows_for_only_the_slugs_asked(db_session: Session) -> None:
    repo = ChartRepository(db_session)
    ids = _ids(db_session)
    rows = repo.value_rows(ids, ["densidade", "modulo_young"])
    assert set(rows) <= set(ids) and rows
    for by_slug in rows.values():
        assert set(by_slug) <= {"densidade", "modulo_young"}
        for row in by_slug.values():
            assert isinstance(row, ValueRow)
    one = next(iter(rows.values()))["densidade"]
    assert one.name and one.definition_unit and one.normalized_value is not None
    assert repo.value_rows([], ["densidade"]) == {} and repo.value_rows(ids, []) == {}


def test_a_value_row_says_what_the_stored_value_says(db_session: Session) -> None:
    repo = ChartRepository(db_session)
    material = repo.list_materials(material_ids=_ids(db_session, 1))[0]
    stored = {v.property_definition.slug: v for v in material.property_values}
    rows = repo.value_rows([material.id], list(stored))[material.id]
    assert set(rows) == set(stored)
    for slug, value in stored.items():
        row = rows[slug]
        assert row.normalized_value == value.normalized_value
        assert row.is_missing == value.is_missing
        assert row.data_quality == value.data_quality
        assert row.original_unit == value.original_unit
        assert row.conversion_method == value.conversion_method


def test_the_laudo_loads_its_candidates_without_their_values(
    client: TestClient, monkeypatch
) -> None:
    seen: list[bool] = []
    original = ChartRepository.list_materials

    def spy(self, *args, **kwargs):
        seen.append(kwargs.get("with_values", True))
        return original(self, *args, **kwargs)

    monkeypatch.setattr(ChartRepository, "list_materials", spy)
    study_id = _study(client)
    response = client.get(f"/api/exports/estudos/{study_id}/laudo.html")
    assert response.status_code == 200, response.text
    # The records of the run are loaded bare; the annex still shows the values it rests on.
    assert False in seen
    assert "Proveniência" in response.text and "Valor normalizado" in response.text
