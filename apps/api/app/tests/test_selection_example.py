"""The bicycle-beam example the wizard loads in one click (D-85).

The example lives in the frontend (``apps/web/lib/selection/examples.ts``)
because it is input choices, not material data. This file runs the same
choices through the real pipeline, so an example that stopped selecting
anything — a renamed index, a unit the seed no longer accepts — breaks here
and not in front of a class.
"""

from __future__ import annotations

from sqlalchemy import select

from app.db.seed_extended import seed_extended_materials
from app.models.source import Source

EXAMPLE_CONSTRAINTS = [
    {"operator": "gte", "property_slug": "modulo_young", "value": 70, "unit": "GPa"},
    {"operator": "gte", "property_slug": "limite_escoamento", "value": 200, "unit": "MPa"},
    {"operator": "gt", "property_slug": "temp_max_servico", "value": 80, "unit": "degC"},
]


def _run_example(client):
    indices = {i["slug"]: i for i in client.get("/api/performance-indices").json()}
    beam = indices["viga-leve-rigidez"]
    return client.post(
        "/api/selection/run",
        json={
            "universe": "material",
            "stages": [
                {
                    "kind": "limit",
                    "root_group": {
                        "operator": "AND",
                        "constraints": EXAMPLE_CONSTRAINTS,
                        "groups": [],
                    },
                }
            ],
            "index": {
                "name": beam["name"],
                "expression": beam["expression"],
                "goal": beam["goal"],
            },
            "ranking": {"criteria": [{"key": "__index__", "weight": 1.0}]},
        },
    )


def test_bike_beam_example_selects_and_ranks_on_the_production_catalogue(
    client, db_session
) -> None:
    """Production runs both seed modules (D-71), so that is the catalogue the
    class meets: the example must leave a real shortlist there and rank it."""
    demo_source = db_session.execute(select(Source)).scalars().first()
    seed_extended_materials(db_session, demo_source)
    db_session.commit()

    resp = _run_example(client)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["candidates"]) >= 5
    ranked = body["ranking"]["ranked"]
    assert ranked and ranked[0]["rank"] == 1


def test_bike_beam_example_on_the_base_seed_runs_and_selects_nothing(client) -> None:
    """The five-material base seed has no demo material with yield ≥ 200 MPa
    *and* the other two thresholds ("Aço Demo B" carries tensile strength, not
    yield). The run still answers — an empty funnel, not an error — which is
    what the screen must survive if it ever meets that catalogue."""
    resp = _run_example(client)
    assert resp.status_code == 200, resp.text
    assert resp.json()["candidates"] == []
