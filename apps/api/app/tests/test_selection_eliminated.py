"""Which step removed each record (D-240).

The funnel only ever said how many records a step removed; ``eliminated`` names
them, labelled exactly as the funnel line that removed each one, and says when a
record fell for want of a datum rather than for a value out of range.
"""

from __future__ import annotations

from app.domain.filters import Constraint, MaterialSnapshot, Operator, lacks_datum

DENSE = {"operator": "lte", "property_slug": "densidade", "value": 5, "unit": "g/cm**3"}
YIELD = {"operator": "gte", "property_slug": "limite_escoamento", "value": 1, "unit": "MPa"}


def _by_name(body) -> dict[str, dict]:
    return {e["name"]: e for e in body["eliminated"]}


def test_each_removed_record_is_named_once_with_the_step_that_removed_it(client):
    body = client.post("/api/selection/run", json={"constraints": [DENSE, YIELD]}).json()

    eliminated = _by_name(body)
    assert len(body["eliminated"]) == body["initial_count"] - body["final_count"]
    assert set(eliminated).isdisjoint({c["name"] for c in body["candidates"]})

    labels = [step["label"] for step in body["funnel"]]
    assert {e["reason"] for e in body["eliminated"]} <= set(labels)
    # The dense steel fails the first step, by value.
    assert eliminated["Aço Demo B"]["reason"] == labels[0]
    assert eliminated["Aço Demo B"]["missing_data"] is False
    # The other two pass the density and hold no yield strength at all.
    for name in ("Cerâmica Demo D", "Compósito Demo E"):
        assert eliminated[name]["reason"] == labels[1]
        assert eliminated[name]["missing_data"] is True
        assert eliminated[name]["stage_position"] == 0


def test_an_or_group_names_every_alternative_the_record_failed(client):
    body = client.post(
        "/api/selection/run", json={"combinator": "OR", "constraints": [DENSE, YIELD]}
    ).json()

    assert [e["name"] for e in body["eliminated"]] == ["Aço Demo B"]
    labels = [step["label"] for step in body["funnel"]]
    assert body["eliminated"][0]["reason"] == " ou ".join(labels)
    # The steel has a yield strength: it failed by value, not for want of data.
    assert body["eliminated"][0]["missing_data"] is False


def test_with_several_stages_the_reason_carries_the_stage_and_disabled_stages_remove_nothing(
    client,
):
    stages = [
        {
            "kind": "limit",
            "label": "Leve",
            "root_group": {"operator": "AND", "constraints": [DENSE]},
        },
        {
            "kind": "limit",
            "label": "Desligado",
            "enabled": False,
            "root_group": {"operator": "AND", "constraints": [YIELD]},
        },
    ]
    body = client.post("/api/selection/run", json={"stages": stages}).json()

    assert [e["name"] for e in body["eliminated"]] == ["Aço Demo B"]
    only = body["eliminated"][0]
    assert only["stage_position"] == 0
    assert only["reason"].startswith("Leve · ")
    assert only["reason"] in {step["label"] for step in body["funnel"]}


def test_nothing_is_eliminated_when_nothing_is_asked(client):
    body = client.post("/api/selection/run", json={}).json()
    assert body["eliminated"] == []


# --- Pure rule -----------------------------------------------------------------


def _snap(**values: float) -> MaterialSnapshot:
    return MaterialSnapshot(id=1, name="m", class_name="c", class_slug="c", values=values)


def test_lacks_datum_only_for_a_criterion_that_reads_a_value_the_record_lacks():
    numeric = Constraint(operator=Operator.GTE, property_slug="e", value=1.0)
    assert lacks_datum(numeric, _snap()) is True
    assert lacks_datum(numeric, _snap(e=0.5)) is False
    # Presence and class criteria have always something to read.
    assert lacks_datum(Constraint(operator=Operator.EXISTS, property_slug="e"), _snap()) is False
    assert lacks_datum(Constraint(operator=Operator.IN_CLASS, class_slugs=["x"]), _snap()) is False
    level = Constraint(operator=Operator.LEVEL_AT_LEAST, property_slug="d", min_rank=2)
    assert lacks_datum(level, _snap()) is True
