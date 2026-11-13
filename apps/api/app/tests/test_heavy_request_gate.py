"""The heavy-request gate and the deploy limits that go with it (D-231).

Production died of memory (exit 137) when several heavy screens ran at once.
Two limits keep that from coming back: the Fly proxy hands the machine only a
few requests at a time (``fly.toml``), and inside the process only
``HEAVY_REQUEST_CONCURRENCY`` heavy routes run together, the next one waiting
and then answering 503 with ``Retry-After``.
"""

from __future__ import annotations

import threading
import tomllib
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.config import settings
from app.dependencies import heavy_request
from app.domain.errors import ServerBusyError
from app.routers import (
    ai,
    auth,
    battery,
    charts,
    eco,
    health,
    materials,
    part_cost,
    properties,
    selection,
    solver,
)
from app.services.heavy_request_gate import HeavyRequestGate, get_gate, reset_gate

REPO_ROOT = Path(__file__).resolve().parents[4]

# The routes that read a large share of the catalogue per request.
HEAVY_ROUTES = {
    ("POST", "/api/selection/filter"),
    ("POST", "/api/selection/funnel"),
    ("POST", "/api/selection/index"),
    ("POST", "/api/selection/run"),
    ("POST", "/api/selection/run-diff"),
    ("POST", "/api/selection/studies/{study_id}/run"),
    ("POST", "/api/charts/property-map"),
    ("POST", "/api/charts/map-box"),
    ("POST", "/api/charts/index-line"),
    ("POST", "/api/charts/compare"),
    ("POST", "/api/solver/resolver"),
    ("POST", "/api/custo/estimar"),
    ("POST", "/api/custo/curvas"),
    ("POST", "/api/eco/auditar"),
    ("POST", "/api/eco/comparar"),
    ("POST", "/api/baterias/dimensionar"),
    ("POST", "/api/baterias/comparar"),
    ("POST", "/api/ai/plan"),
    ("POST", "/api/ai/plan/run"),
}


@pytest.fixture()
def fresh_gate() -> Generator[None, None, None]:
    reset_gate()
    yield
    reset_gate()


# --- the gate itself ---------------------------------------------------------


def test_a_full_gate_refuses_after_the_wait_with_retry_after() -> None:
    gate = HeavyRequestGate(capacity=1, wait_seconds=0.05)
    with gate.slot():
        assert gate.in_use == 1
        with pytest.raises(ServerBusyError) as refused:
            with gate.slot():
                pass
    assert refused.value.retry_after > 0
    assert "Tente de novo" in str(refused.value)
    # The slot came back: the next caller gets in.
    with gate.slot():
        assert gate.in_use == 1
    assert gate.in_use == 0


def test_a_waiting_caller_gets_the_slot_when_it_frees_up() -> None:
    gate = HeavyRequestGate(capacity=1, wait_seconds=5.0)
    held = threading.Event()
    release = threading.Event()

    def holder() -> None:
        with gate.slot():
            held.set()
            release.wait(5)

    thread = threading.Thread(target=holder)
    thread.start()
    held.wait(5)
    threading.Timer(0.05, release.set).start()
    with gate.slot():  # waits for the holder, never refused
        assert gate.in_use == 1
    thread.join(5)
    assert gate.in_use == 0


def test_the_slot_is_released_when_the_block_raises() -> None:
    gate = HeavyRequestGate(capacity=1, wait_seconds=0.0)
    with pytest.raises(RuntimeError):
        with gate.slot():
            raise RuntimeError("boom")
    with gate.slot():
        assert gate.in_use == 1


def test_capacity_zero_turns_the_gate_off() -> None:
    gate = HeavyRequestGate(capacity=0, wait_seconds=0.0)
    with gate.slot(), gate.slot(), gate.slot():
        pass


def test_the_gate_follows_the_settings(monkeypatch, fresh_gate) -> None:
    monkeypatch.setattr(settings, "heavy_request_concurrency", 3)
    monkeypatch.setattr(settings, "heavy_request_wait_seconds", 1.5)
    gate = get_gate()
    assert (gate.capacity, gate.wait_seconds) == (3, 1.5)
    assert get_gate() is gate
    monkeypatch.setattr(settings, "heavy_request_concurrency", 1)
    assert get_gate().capacity == 1


def test_the_default_lets_two_heavy_requests_run_together() -> None:
    assert settings.heavy_request_concurrency == 2


# --- through HTTP ------------------------------------------------------------


ROUTER_MODULES = (ai, auth, battery, charts, eco, health, materials, part_cost, properties)
ROUTER_MODULES += (selection, solver)


def _gated_routes() -> tuple[set[tuple[str, str]], set[tuple[str, str]]]:
    """``(gated, all)`` as ``(method, "/api" + path)`` over the routers above."""
    gated: set[tuple[str, str]] = set()
    every: set[tuple[str, str]] = set()
    for module in ROUTER_MODULES:
        for route in module.router.routes:
            if not isinstance(route, APIRoute):
                continue
            holds = any(dep.call is heavy_request for dep in route.dependant.dependencies)
            for method in route.methods:
                every.add((method, "/api" + route.path))
                if holds:
                    gated.add((method, "/api" + route.path))
    return gated, every


def test_every_heavy_route_holds_a_slot() -> None:
    gated, every = _gated_routes()
    assert HEAVY_ROUTES <= every, sorted(HEAVY_ROUTES - every)
    assert HEAVY_ROUTES <= gated, sorted(HEAVY_ROUTES - gated)


def test_light_routes_do_not_queue_behind_the_heavy_ones() -> None:
    gated, every = _gated_routes()
    light = {
        ("GET", "/api/health"),
        ("GET", "/api/auth/me"),
        ("GET", "/api/properties"),
        ("GET", "/api/materials/{material_id}"),
        ("GET", "/api/baterias/quimicas"),
        ("GET", "/api/solver/casos"),
    }
    assert light <= every, sorted(light - every)
    assert not light & gated
    # Nothing beyond the declared heavy set is gated by accident.
    assert gated == HEAVY_ROUTES


def test_a_heavy_route_answers_503_while_the_gate_is_full(
    client: TestClient, monkeypatch, fresh_gate
) -> None:
    monkeypatch.setattr(settings, "heavy_request_concurrency", 1)
    monkeypatch.setattr(settings, "heavy_request_wait_seconds", 0.0)
    body = {"x": "densidade", "y": "modulo_young", "scale": "log"}

    with get_gate().slot():
        busy = client.post("/api/charts/property-map", json=body)
        light = client.get("/api/properties")
    assert busy.status_code == 503
    assert busy.headers["Retry-After"].isdigit()
    assert "ocupado" in busy.json()["detail"]
    assert light.status_code == 200

    after = client.post("/api/charts/property-map", json=body)
    assert after.status_code == 200, after.text
    assert get_gate().in_use == 0


def test_a_route_outside_the_gate_is_answered_while_it_is_full(
    client: TestClient, monkeypatch, fresh_gate
) -> None:
    monkeypatch.setattr(settings, "heavy_request_concurrency", 1)
    monkeypatch.setattr(settings, "heavy_request_wait_seconds", 0.0)
    with get_gate().slot():
        busy = client.post(
            "/api/selection/studies",
            json={"name": "não é pesada", "stages": []},
        )
    # Creating a study is not gated: it is answered (whatever the validation says).
    assert busy.status_code != 503


# --- the deploy limits -------------------------------------------------------


def _fly() -> dict:
    return tomllib.loads((REPO_ROOT / "fly.toml").read_text(encoding="utf-8"))


def test_the_vm_has_one_gigabyte() -> None:
    vms = _fly()["vm"]
    assert [vm["memory"] for vm in vms] == ["1gb"]


def test_the_proxy_hands_the_machine_only_a_few_requests_at_once() -> None:
    concurrency = _fly()["http_service"]["concurrency"]
    assert concurrency["type"] == "requests"
    assert 0 < concurrency["soft_limit"] < concurrency["hard_limit"] <= 10


def test_the_api_runs_a_single_worker() -> None:
    dockerfile = (REPO_ROOT / "Dockerfile.api").read_text(encoding="utf-8")
    cmd = next(line for line in dockerfile.splitlines() if line.startswith("CMD"))
    assert "uvicorn" in cmd
    assert "--workers" not in cmd
