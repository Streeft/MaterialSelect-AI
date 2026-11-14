"""Memory each heavy screen holds per request, with the full demo catalogue (D-231).

Production died of memory (exit 137) with the demo catalogue of 678 materials
and ~32 thousand values: the selection funnel and run, the maps, the solver,
the cost and eco calculators and the AI plan each built an ORM object per
stored value — 130 to 170 MB per request, measured with ``tracemalloc`` — and
the catalogue listing ~55 MB. These tests seed the same catalogue inside the
test's transaction (``seed`` + ``seed_extended``'s materials + the extended
properties of D-188) and hold every one of those routes under a ceiling that
the old loading could not meet, so a regression to "load the whole catalogue
with every value" fails here instead of in production.

The ceiling is generous on purpose (the routes measure 1 to 11 MB on Postgres
after D-231): it guards the order of magnitude, not the last megabyte.
"""

from __future__ import annotations

import gc
import tracemalloc

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.seed import DEMO_SOURCE_LABEL
from app.db.seed_demo_extended_props import seed_demo_extended_properties
from app.db.seed_extended import TCC_DEMO_MATERIALS, seed_extended_materials
from app.models.material import Material
from app.models.material_property_value import MaterialPropertyValue
from app.models.process import Process
from app.models.source import Source

# MB a single request may allocate at its peak, over what was allocated before.
CEILING_MB = 40.0

DENSITY_LIMIT = {
    "kind": "limit",
    "root_group": {
        "operator": "AND",
        "constraints": [
            {"operator": "lte", "property_slug": "densidade", "value": 3, "unit": "g/cm**3"}
        ],
        "groups": [],
    },
}
SPECIFIC_STIFFNESS = {"expression": "modulo_young / densidade"}


@pytest.fixture()
def full_catalogue(db_session: Session) -> dict[str, int]:
    """The demo catalogue as ``semear_demo`` leaves it, for values and materials."""
    source = db_session.execute(
        select(Source).where(Source.label == DEMO_SOURCE_LABEL)
    ).scalar_one()
    seed_extended_materials(db_session, source)
    seed_extended_materials(db_session, source, specs=TCC_DEMO_MATERIALS)
    seed_demo_extended_properties(db_session, source)
    db_session.commit()
    db_session.expire_all()

    materials = db_session.execute(select(func.count(Material.id))).scalar_one()
    values = db_session.execute(select(func.count(MaterialPropertyValue.id))).scalar_one()
    assert materials >= 660 and values >= 30_000, (materials, values)
    aluminium = (
        db_session.execute(
            select(Material.id).where(Material.name.like("%Alumínio%")).order_by(Material.id)
        )
        .scalars()
        .first()
    )
    first_two = db_session.execute(select(Material.id).order_by(Material.id).limit(2)).scalars()
    m1, m2 = list(first_two)
    process = db_session.execute(
        select(Process.id).where(Process.slug == "fundicao-areia")
    ).scalar_one()
    return {"al": aluminium, "m1": m1, "m2": m2, "process": process}


def _routes(ids: dict[str, int]) -> list[tuple[str, str, str, dict | None]]:
    return [
        ("catálogo", "GET", "/api/materials", None),
        ("catálogo paginado", "GET", "/api/materials?limit=50", None),
        ("busca", "GET", "/api/materials/busca?q=aco", None),
        (
            "catálogo por propriedade",
            "GET",
            "/api/materials/busca?ordenar=densidade&limit=50&facetas=true",
            None,
        ),
        ("funil", "POST", "/api/selection/funnel", {"stages": [DENSITY_LIMIT]}),
        ("filtro", "POST", "/api/selection/filter", {"stages": [DENSITY_LIMIT]}),
        (
            "executar",
            "POST",
            "/api/selection/run",
            {
                "stages": [DENSITY_LIMIT],
                "index": SPECIFIC_STIFFNESS,
                "ranking": {
                    "criteria": [
                        {"key": "densidade", "direction": "min", "weight": 1},
                        {"key": "__index__", "weight": 1},
                    ]
                },
            },
        ),
        (
            "mapa",
            "POST",
            "/api/charts/property-map",
            {"x": "densidade", "y": "modulo_young", "scale": "log"},
        ),
        (
            "mapa com índice",
            "POST",
            "/api/charts/property-map",
            {"x": "densidade", "y": "modulo_young", "index": SPECIFIC_STIFFNESS},
        ),
        (
            "linha de índice",
            "POST",
            "/api/charts/index-line",
            {"x": "densidade", "y": "modulo_young", "index": SPECIFIC_STIFFNESS},
        ),
        (
            "comparar",
            "POST",
            "/api/charts/compare",
            {"material_ids": [ids["m1"], ids["m2"]], "property_slugs": ["densidade"]},
        ),
        (
            "dimensionar",
            "POST",
            "/api/solver/resolver",
            {
                "case_key": "viga-rigidez",
                "inputs": {"rigidez": 2.0e5, "comprimento": 0.8, "constante_apoio": 48.0},
            },
        ),
        (
            "custo",
            "POST",
            "/api/custo/estimar",
            {
                "material_id": ids["al"],
                "part_mass": 2.0,
                "batch_size": 1000.0,
                "write_off_years": 5.0,
                "load_factor": 0.5,
            },
        ),
        (
            "eco",
            "POST",
            "/api/eco/auditar",
            {
                "material_id": ids["al"],
                "process_id": ids["process"],
                "part_mass": 2.0,
                "transport_mode": "rodoviario",
                "transport_distance_km": 1500.0,
                "use": {
                    "model": "movel",
                    "distance_km": 200000.0,
                    "mobile_intensity": 0.0025,
                    "life_years": 12.0,
                    "carbon_per_energy": 0.07,
                },
            },
        ),
        ("plano da IA", "POST", "/api/ai/plan", {"text": "Quero fazer uma roupa de esqui"}),
        ("sugestão do catálogo", "POST", "/api/ai/suggest", {"tool": "catalogo", "context": {}}),
        ("painel", "GET", "/api/dashboard/overview", None),
        # D-235: the whole catalogue as a file, built from batches of materials.
        ("exportar o catálogo (csv)", "GET", "/api/exports/catalogo.csv", None),
        ("exportar o catálogo (xlsx)", "GET", "/api/exports/catalogo.xlsx", None),
    ]


def _peak_mb(client: TestClient, method: str, path: str, body: dict | None) -> tuple[int, float]:
    gc.collect()
    tracemalloc.reset_peak()
    before = tracemalloc.get_traced_memory()[0]
    response = client.get(path) if method == "GET" else client.post(path, json=body)
    peak = tracemalloc.get_traced_memory()[1] - before
    return response.status_code, peak / 1e6


def test_no_heavy_screen_holds_the_whole_catalogue_per_request(
    client: TestClient, full_catalogue: dict[str, int]
) -> None:
    routes = _routes(full_catalogue)
    # One warm-up pass: imports, compiled statements and the unit registry are
    # paid once per process and are not what a request holds.
    for _, method, path, body in routes:
        response = client.get(path) if method == "GET" else client.post(path, json=body)
        assert response.status_code == 200, (path, response.text)

    tracemalloc.start()
    try:
        measured = {name: _peak_mb(client, m, p, b) for name, m, p, b in routes}
    finally:
        tracemalloc.stop()

    assert all(status == 200 for status, _ in measured.values()), measured
    over = {name: round(mb, 1) for name, (_, mb) in measured.items() if mb > CEILING_MB}
    assert not over, f"acima de {CEILING_MB} MB por requisição: {over}"
