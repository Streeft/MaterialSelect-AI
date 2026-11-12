"""The catalogue as pages (D-217): limit/offset/total, chips with counts, order, relevance.

The seed has five demo materials; the fixtures below add a small family with a
child class so the subtree rule and the relevance tiers each have a witness.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.catalog_listing import (
    MAX_PAGE_SIZE,
    ListingFilters,
    ListingRow,
    apply_filters,
    facet_counts,
    order_by_value,
    page,
)
from app.domain.text_fold import fold_accents
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition


@pytest.fixture()
def family(db_session: Session) -> dict[str, int]:
    """'Família qzx' with a child class; names give each relevance tier one witness."""
    parent = MaterialClass(name="Família qzx", slug="familia-qzx")
    db_session.add(parent)
    db_session.flush()
    child = MaterialClass(name="Ramo qzx", slug="ramo-qzx", parent_id=parent.id)
    db_session.add(child)
    db_session.flush()
    rows = {
        "contains": Material(name="Argamassa qzx traço fino", class_id=parent.id, keywords=[]),
        "word_prefix": Material(name="Liga qzx açoforte", class_id=parent.id, keywords=[]),
        "whole_word": Material(name="Liga qzx de aço", class_id=child.id, keywords=[]),
        "prefix": Material(name="Aço qzx 1020", class_id=child.id, subclass="Carbono", keywords=[]),
    }
    rows["prefix"].is_demo = False
    for row in rows.values():
        db_session.add(row)
    db_session.commit()
    return {key: row.id for key, row in rows.items()}


def _search(client: TestClient, **params) -> dict:
    resp = client.get("/api/materials/busca", params=params)
    assert resp.status_code == 200, resp.text
    return resp.json()


# --- pagination ------------------------------------------------------------


def test_page_carries_total_offset_and_limit(client: TestClient) -> None:
    everything = _search(client)
    assert everything["total"] == len(everything["items"]) >= 5
    assert everything["limit"] is None and everything["offset"] == 0

    first = _search(client, limit=2)
    second = _search(client, limit=2, offset=2)
    assert first["total"] == second["total"] == everything["total"]
    assert len(first["items"]) == len(second["items"]) == 2
    names = [m["name"] for m in everything["items"]]
    assert [m["name"] for m in first["items"] + second["items"]] == names[:4]


def test_offset_past_the_end_is_an_empty_page_not_an_error(client: TestClient) -> None:
    body = _search(client, limit=10, offset=10_000)
    assert body["items"] == [] and body["total"] >= 5


def test_limit_above_the_maximum_is_refused(client: TestClient) -> None:
    resp = client.get("/api/materials/busca", params={"limit": MAX_PAGE_SIZE + 1})
    assert resp.status_code == 422
    resp = client.get("/api/materials", params={"limit": 0})
    assert resp.status_code == 422


def test_plain_list_keeps_its_shape_and_states_the_total_in_a_header(client: TestClient) -> None:
    whole = client.get("/api/materials")
    assert isinstance(whole.json(), list)
    total = int(whole.headers["X-Total-Count"])
    assert total == len(whole.json())

    paged = client.get("/api/materials", params={"limit": 2, "offset": 1})
    assert [m["id"] for m in paged.json()] == [m["id"] for m in whole.json()[1:3]]
    assert int(paged.headers["X-Total-Count"]) == total


# --- relevance, accents ------------------------------------------------------


def test_aco_ranks_steel_before_mortar(client: TestClient, family: dict[str, int]) -> None:
    ids = [m["id"] for m in _search(client, q="aço qzx")["items"]]
    assert ids == [
        family["prefix"],
        family["whole_word"],
        family["word_prefix"],
        family["contains"],
    ]


@pytest.mark.parametrize("typed", ["aco qzx", "AÇO QZX", "Aco Qzx"])
def test_search_folds_accents_and_case(
    client: TestClient, family: dict[str, int], typed: str
) -> None:
    ids = [m["id"] for m in _search(client, q=typed)["items"]]
    assert ids[0] == family["prefix"]
    assert set(ids) == set(family.values())


def test_fold_accents_keeps_spaces_and_wildcards() -> None:
    assert fold_accents("Aço  Inoxidável %ç_") == "aco  inoxidavel %c_"


# --- chips and facets ------------------------------------------------------


def test_class_filter_includes_the_classes_under_it(
    client: TestClient, family: dict[str, int]
) -> None:
    parent = {m["id"] for m in _search(client, classe="familia-qzx")["items"]}
    child = {m["id"] for m in _search(client, classe="ramo-qzx")["items"]}
    assert parent == set(family.values())
    assert child == {family["prefix"], family["whole_word"]}


def test_subclass_and_demo_filters(client: TestClient, family: dict[str, int]) -> None:
    assert [m["id"] for m in _search(client, subclasse="Carbono")["items"]] == [family["prefix"]]
    not_demo = _search(client, demo="false", classe="familia-qzx")
    assert [m["id"] for m in not_demo["items"]] == [family["prefix"]]


def test_facets_count_each_chip_with_the_others_applied(
    client: TestClient, family: dict[str, int]
) -> None:
    body = _search(client, q="qzx", classe="ramo-qzx", facetas="true")
    facets = body["facets"]
    assert body["total"] == 2
    # The class facet ignores the class chip: four qzx materials in the family,
    # two of them in the branch.
    assert facets["classe"]["familia-qzx"] == 4
    assert facets["classe"]["ramo-qzx"] == 2
    # The other facets respect the class chip.
    assert facets["subclasse"] == {"Carbono": 1}
    assert facets["demo"] == {"true": 1, "false": 1}
    # No value of the fixture is registered: nothing is complete, and a value
    # nobody has is absent, not listed as zero.
    assert "complete" not in facets["qualidade"]


def test_facets_only_when_asked(client: TestClient) -> None:
    assert _search(client)["facets"] is None


def test_quality_filter_matches_the_payload_summary(client: TestClient) -> None:
    gaps = _search(client, qualidade="gaps")["items"]
    assert gaps and all(m["quality"]["missing"] > 0 for m in gaps)


# --- order -------------------------------------------------------------------


def test_order_by_name_and_class(client: TestClient) -> None:
    by_name = [m["name"] for m in _search(client, ordenar="nome")["items"]]
    assert by_name == sorted(by_name, key=fold_accents)
    desc = [m["name"] for m in _search(client, ordenar="nome", direcao="desc")["items"]]
    assert desc == list(reversed(by_name))
    by_class = [m["class_slug"] for m in _search(client, ordenar="classe")["items"]]
    assert by_class == sorted(by_class)


def test_order_by_property_puts_absent_values_last_both_ways(
    client: TestClient, db_session: Session
) -> None:
    definition = db_session.execute(
        select(PropertyDefinition).where(PropertyDefinition.slug == "condutividade_termica")
    ).scalar_one()
    missing_ids = set(
        db_session.execute(
            select(MaterialPropertyValue.material_id).where(
                MaterialPropertyValue.property_id == definition.id,
                MaterialPropertyValue.is_missing.is_(True),
            )
        ).scalars()
    )
    assert missing_ids, "the seed records one absent conductivity"

    for direction in ("asc", "desc"):
        items = _search(client, ordenar="condutividade_termica", direcao=direction)["items"]
        values = [m["sort_value"]["value"] for m in items]
        present = [v for v in values if v is not None]
        assert values[: len(present)] == present, "absent values go last"
        assert present == sorted(present, reverse=direction == "desc")
        absent = [m for m in items if m["sort_value"]["value"] is None]
        assert {m["id"] for m in absent if m["sort_value"]["is_missing"]} >= missing_ids
        assert all(m["sort_value"]["unit"] for m in items)


def test_order_by_unknown_property_is_a_400(client: TestClient) -> None:
    resp = client.get("/api/materials/busca", params={"ordenar": "nao_existe"})
    assert resp.status_code == 400
    assert "nao_existe" in resp.json()["detail"]


# --- the pure rules ----------------------------------------------------------


def _row(name: str, **kw) -> ListingRow[str]:
    base = dict(
        class_slug="a",
        subclass=None,
        is_demo=True,
        measured=0,
        imported=0,
        estimated=0,
        missing=0,
        reference_count=0,
    )
    base.update(kw)
    return ListingRow(name=name, ref=name, **base)


def test_order_by_value_never_reads_absence_as_zero() -> None:
    rows = [_row("b"), _row("a"), _row("c"), _row("d")]
    values = {"a": 0.0, "b": None, "c": -1.0, "d": 5.0}
    asc = [r.ref for r in order_by_value(rows, lambda r: values[r.ref], "asc")]
    desc = [r.ref for r in order_by_value(rows, lambda r: values[r.ref], "desc")]
    assert asc == ["c", "a", "d", "b"]
    assert desc == ["d", "a", "c", "b"]


def test_facet_counts_roll_up_to_ancestors_and_skip_their_own_filter() -> None:
    rows = [_row("x", class_slug="leaf"), _row("y", class_slug="other", is_demo=False)]
    filters = ListingFilters(class_slugs=frozenset({"leaf"}), demo=True)
    counts = facet_counts(rows, filters, {"leaf": ["root"], "other": ["root"]})
    assert counts.classe == {"leaf": 1, "root": 1}  # "y" is not demo
    assert counts.demo == {"true": 1}  # "y" is not in the class
    assert [r.ref for r in apply_filters(rows, filters)] == ["x"]


def test_page_bounds() -> None:
    assert page([1, 2, 3], 1, None) == [2, 3]
    assert page([1, 2, 3], 1, 1) == [2]
    with pytest.raises(ValueError):
        page([1], 0, MAX_PAGE_SIZE + 1)
    with pytest.raises(ValueError):
        page([1], -1, 1)
