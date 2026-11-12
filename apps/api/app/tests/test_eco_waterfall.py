"""The eco waterfall and the per-phase deltas are computed here, not drawn from
sums done in the browser (ADR 0004, D-216).

The waterfall is the chart the audit tools (SimaPro, OpenLCA) draw: each phase
a step from the running total to the next. The rules this file protects are the
two the method already has: a phase nobody could compute is a state with a
reason, never a zero, and a total over fewer than all five phases is not a
total (``None``).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.calculations.eco_audit import (
    CARBON_UNIT,
    ENERGY_UNIT,
    PHASES,
    PhaseResult,
    build_waterfall,
)
from app.models.material import Material
from app.models.process import Process

MOBILE_USE = {
    "model": "movel",
    "distance_km": 200000.0,
    "mobile_intensity": 0.0025,
    "life_years": 10.0,
    "carbon_per_energy": 0.07,
}


def _phase(name: str, energy: float | None, carbon: float | None = None) -> PhaseResult:
    return PhaseResult(
        phase=name,
        label=name.title(),
        energy=energy,
        carbon=carbon,
        detail="",
        energy_reason=None if energy is not None else "Dados ausentes: x",
        carbon_reason=None if carbon is not None else "Dados ausentes: y",
    )


def test_steps_start_where_the_previous_one_ended() -> None:
    phases = tuple(
        _phase(name, value) for name, value in zip(PHASES, (10.0, 5.0, 2.0, 30.0, 3.0), strict=True)
    )
    wf = build_waterfall(phases, "energy", ENERGY_UNIT)
    assert [s.start for s in wf.steps] == [0.0, 10.0, 15.0, 17.0, 47.0]
    assert [s.end for s in wf.steps] == [10.0, 15.0, 17.0, 47.0, 50.0]
    assert wf.total.value == 50.0 and wf.total.start == 0.0 and wf.total.end == 50.0
    assert wf.domain == (0.0, 50.0)
    assert wf.unit == ENERGY_UNIT


def test_a_missing_phase_is_a_state_with_a_reason_and_the_total_is_refused() -> None:
    values = (10.0, None, 2.0, 30.0, 3.0)
    phases = tuple(_phase(name, value) for name, value in zip(PHASES, values, strict=True))
    wf = build_waterfall(phases, "energy", ENERGY_UNIT)
    gap = wf.steps[1]
    assert gap.value is None and gap.reason == "Dados ausentes: x"
    # The running total skips it: it is neither added nor treated as zero.
    assert gap.start == gap.end == 10.0
    assert wf.steps[2].start == 10.0
    assert wf.total.value is None and wf.total.start is None and wf.total.end is None
    assert wf.total.reason


def test_a_credit_steps_downwards_and_the_domain_follows_it() -> None:
    values = (10.0, 5.0, 2.0, 30.0, -4.0)
    phases = tuple(_phase(name, value) for name, value in zip(PHASES, values, strict=True))
    wf = build_waterfall(phases, "energy", ENERGY_UNIT)
    last = wf.steps[-1]
    assert last.start == 47.0 and last.end == 43.0
    assert wf.domain == (0.0, 47.0)


def test_carbon_reads_its_own_column() -> None:
    phases = tuple(
        _phase(name, 1.0, c) for name, c in zip(PHASES, (1.0, 2.0, None, 4.0, 5.0), strict=True)
    )
    wf = build_waterfall(phases, "carbon", CARBON_UNIT)
    assert wf.steps[2].value is None and wf.steps[2].reason == "Dados ausentes: y"
    assert wf.unit == CARBON_UNIT


def test_an_all_zero_audit_still_gets_a_drawable_frame() -> None:
    phases = tuple(_phase(name, 0.0) for name in PHASES)
    wf = build_waterfall(phases, "energy", ENERGY_UNIT)
    assert wf.domain[0] < wf.domain[1]


def _audit_body(db: Session) -> dict:
    material = (
        db.execute(select(Material).where(Material.name.like("%Alumínio%"))).scalars().first()
    )
    process = db.execute(select(Process).where(Process.slug == "fundicao-areia")).scalars().one()
    return {
        "material_id": material.id,
        "process_id": process.id,
        "part_mass": 2.0,
        "transport_mode": "rodoviario",
        "transport_distance_km": 1500.0,
        "use": MOBILE_USE,
    }


def test_the_audit_carries_one_waterfall_per_quantity(
    client: TestClient, db_session: Session
) -> None:
    out = client.post("/api/eco/auditar", json=_audit_body(db_session)).json()
    for key, unit, attr in (
        ("energy_waterfall", ENERGY_UNIT, "energy"),
        ("carbon_waterfall", CARBON_UNIT, "carbon"),
    ):
        wf = out[key]
        assert wf["unit"] == unit
        assert [s["phase"] for s in wf["steps"]] == list(PHASES)
        for step, phase in zip(wf["steps"], out["phases"], strict=True):
            assert step["value"] == phase[attr]
        total = out[f"total_{attr}"]
        # The total bar IS the audit's total, bit for bit (no second sum).
        assert wf["total"]["value"] == total
        if total is not None:
            assert wf["steps"][-1]["end"] == pytest.approx(total)
            assert wf["domain"][0] <= 0.0 <= wf["domain"][1]
            assert wf["domain"][1] >= total


def test_the_comparison_names_the_difference_of_each_phase(
    client: TestClient, db_session: Session
) -> None:
    base = _audit_body(db_session)
    body = {
        "material_a": {
            "material_id": base["material_id"],
            "process_id": base["process_id"],
            "part_mass": 2.0,
        },
        "material_b": {
            "material_id": base["material_id"],
            "process_id": base["process_id"],
            "part_mass": 3.0,
        },
        "transport_mode": "rodoviario",
        "transport_distance_km": 1500.0,
        "use": MOBILE_USE,
    }
    out = client.post("/api/eco/comparar", json=body).json()
    deltas = out["phase_deltas"]
    assert [d["phase"] for d in deltas] == list(PHASES)
    for delta, a, b in zip(
        deltas, out["material_a"]["phases"], out["material_b"]["phases"], strict=True
    ):
        for quantity in ("energy", "carbon"):
            if a[quantity] is None or b[quantity] is None:
                assert delta[f"delta_{quantity}"] is None
            else:
                assert delta[f"delta_{quantity}"] == pytest.approx(b[quantity] - a[quantity])


def test_the_total_bar_takes_the_audits_own_total_not_a_second_sum() -> None:
    """Summing the same floats in another order can differ in the last digit."""
    values = (31.25, 2.125, 0.204, 70.0, 3.2)
    phases = tuple(_phase(name, 1.0, c) for name, c in zip(PHASES, values, strict=True))
    own = 106.77900000000001  # one ulp off the running sum, on purpose
    wf = build_waterfall(phases, "carbon", CARBON_UNIT, own)
    assert wf.total.value == own and wf.total.end == own
    # Without one, it falls back to the running sum.
    assert build_waterfall(phases, "carbon", CARBON_UNIT).total.value == pytest.approx(
        own, rel=1e-3
    )
