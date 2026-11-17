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
import os
import threading
import time
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

# The catalogue as a CSV (D-237) is sent as it is written, so what is left is
# the file itself, which the test client also has to hold to read it: 13 MB
# measured against 33 MB when the text was built whole first. The 40 MB above
# could not tell the two apart; this one can.
CSV_CEILING_MB = 20.0

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

    csv_mb = measured["exportar o catálogo (csv)"][1]
    assert csv_mb <= CSV_CEILING_MB, f"CSV do catálogo: {csv_mb:.1f} MB > {CSV_CEILING_MB} MB"


# --- The laudo as Word and PowerPoint (D-243) -----------------------------------
#
# These two build a whole document and rasterise every chart to a PNG. ``tracemalloc``
# sees the Python side (the document, the SVG strings, the ``bytes`` of each PNG) but not
# the Rust allocator inside ``resvg``, so the same request is also measured by the
# process's resident set, sampled while it runs: the number that decides whether a 1 GB
# machine survives it. Measured on the full demo catalogue (Linux, CPython 3.11):
# D-243 records the figures in docs/13-deploy.md.

LAUDO_CEILING_MB = 100.0
#: What Word or PowerPoint may add over the HTML laudo, which already re-runs the whole study
#: (D-241): the document, the PNGs and the zip, not a second copy of the catalogue.
LAUDO_EXTRA_CEILING_MB = 15.0
#: Resident-set growth of one request. Generous on purpose: it guards the order of magnitude
#: (matplotlib alone would cost ~55 MB just to import), not the last megabyte.
LAUDO_RSS_CEILING_MB = 90.0
#: The very first request of a cold process also pays the imports (python-docx, python-pptx,
#: lxml, resvg ≈ 18 MB, measured apart) and the first run of the study: 82 MB measured.
LAUDO_COLD_RSS_CEILING_MB = 150.0
LAUDO_QUERY = "?responsavel=Ana+Souza&massa=1.5&lote=2000"


def _rss_mb() -> float:
    with open("/proc/self/statm") as handle:
        return int(handle.read().split()[1]) * os.sysconf("SC_PAGE_SIZE") / 1e6


def _peak_rss_growth_mb(call) -> float:
    """Highest resident set seen while ``call`` runs, over what it was before (sampled)."""
    baseline = _rss_mb()
    peak = baseline
    done = threading.Event()

    def sample() -> None:
        nonlocal peak
        while not done.is_set():
            peak = max(peak, _rss_mb())
            time.sleep(0.002)

    thread = threading.Thread(target=sample, daemon=True)
    thread.start()
    try:
        call()
    finally:
        done.set()
        thread.join()
    return max(peak, _rss_mb()) - baseline


@pytest.mark.skipif(not os.path.exists("/proc/self/statm"), reason="needs /proc (Linux)")
def test_the_word_and_powerpoint_laudo_fit_the_machine(
    client: TestClient, full_catalogue: dict[str, int]
) -> None:
    study = client.post(
        "/api/selection/studies",
        json={
            "name": "Laudo sobre o catálogo inteiro",
            "constraints": [
                {"operator": "gt", "property_slug": "modulo_young", "value": 1.0, "unit": "GPa"}
            ],
            "index": {
                "name": "Viga leve",
                "expression": "sqrt(modulo_young) / densidade",
                "goal": "maximize",
            },
            "criteria": [
                {"key": "__index__", "weight": 2.0},
                {"key": "densidade", "weight": 1.0},
                {"key": "modulo_young", "weight": 1.0},
            ],
        },
    )
    assert study.status_code == 201, study.text
    base = f"/api/exports/estudos/{study.json()['id']}/laudo"
    formats = ("html", "docx", "pptx")

    # The first Word/PowerPoint request pays the one-time imports (python-docx, python-pptx,
    # lxml, resvg): measured on its own, because it is what a cold process holds once.
    cold: dict[str, float] = {}
    for fmt in ("docx", "pptx"):
        statuses: list[int] = []
        cold[fmt] = _peak_rss_growth_mb(
            lambda fmt=fmt, statuses=statuses: statuses.append(
                client.get(f"{base}.{fmt}{LAUDO_QUERY}").status_code
            )
        )
        assert statuses == [200]
    assert client.get(f"{base}.html{LAUDO_QUERY}").status_code == 200

    python_mb: dict[str, float] = {}
    rss_mb: dict[str, float] = {}
    for fmt in formats:
        path = f"{base}.{fmt}{LAUDO_QUERY}"
        rss_mb[fmt] = _peak_rss_growth_mb(lambda path=path: client.get(path))
        tracemalloc.start()
        try:
            status, python_mb[fmt] = _peak_mb(client, "GET", path, None)
        finally:
            tracemalloc.stop()
        assert status == 200, fmt

    print(  # noqa: T201
        "\nlaudo (cheio de catálogo): "
        + "; ".join(
            f"{fmt}: Python {python_mb[fmt]:.1f} MB, RSS +{rss_mb[fmt]:.1f} MB" for fmt in formats
        )
        + f"; primeira vez (imports): docx +{cold['docx']:.1f} MB, pptx +{cold['pptx']:.1f} MB"
    )
    for fmt in formats:
        assert python_mb[fmt] <= LAUDO_CEILING_MB, f"{fmt}: {python_mb[fmt]:.1f} MB (Python)"
        assert rss_mb[fmt] <= LAUDO_RSS_CEILING_MB, f"{fmt}: +{rss_mb[fmt]:.1f} MB residentes"
    for fmt in ("docx", "pptx"):
        extra = python_mb[fmt] - python_mb["html"]
        assert extra <= LAUDO_EXTRA_CEILING_MB, f"{fmt} soma {extra:.1f} MB ao HTML"
        assert cold[fmt] <= LAUDO_COLD_RSS_CEILING_MB, f"{fmt}: +{cold[fmt]:.1f} MB na primeira vez"
