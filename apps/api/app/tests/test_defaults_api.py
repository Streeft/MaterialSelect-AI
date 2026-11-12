"""``GET /api/padroes``: the one place the screens' starting numbers live (D-216).

The front used to carry its own copies (cost 1000 / 5 / 0,5; eco 60 W / 0,25 /
10 years…; battery packing factors 0,65 / 0,50 / 0,70) and the copy had drifted
from the schemas (0,70 / 0,60 / 0,75). These tests pin the endpoint to the
constants the requests validate against, so a second copy cannot diverge
without a test failing.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.calculations.battery import APPLICATION_ARCHETYPES
from app.schemas.battery import BatteryComparisonRequest, PackDesignRequest
from app.schemas.part_cost import CostRequest
from app.schemas.solver import SolveRequest


def _defaults(client: TestClient) -> dict:
    response = client.get("/api/padroes")
    assert response.status_code == 200, response.text
    return response.json()


def test_defaults_need_a_signed_in_user(anon_client: TestClient) -> None:
    assert anon_client.get("/api/padroes").status_code == 401


def test_defaults_need_an_active_subscription(client_without_subscription: TestClient) -> None:
    assert client_without_subscription.get("/api/padroes").status_code == 403


def test_cost_defaults_are_the_ones_the_request_validates_with(client: TestClient) -> None:
    cost = _defaults(client)["custo"]
    probe = CostRequest(material_id=1, part_mass=1.0, batch_size=1.0)
    assert cost["write_off_years"] == probe.write_off_years
    assert cost["load_factor"] == probe.load_factor
    assert cost["batch_size"] >= 1
    # The premises travel with their reading: they are inputs, not facts.
    assert cost["note"]


def test_battery_packing_factors_come_from_the_schema_not_from_the_screen(
    client: TestClient,
) -> None:
    battery = _defaults(client)["baterias"]
    design = PackDesignRequest(
        chemistry_slug="lfp", target_voltage_v=400, target_energy_kwh=50, target_power_kw=100
    )
    compare = BatteryComparisonRequest(
        target_voltage_v=400, target_energy_kwh=50, target_power_kw=100
    )
    for source in (design, compare):
        assert battery["mass_packing_factor"] == source.mass_packing_factor == 0.70
        assert battery["volume_packing_factor"] == source.volume_packing_factor == 0.60
        assert battery["cost_packing_factor"] == source.cost_packing_factor == 0.75
        assert battery["dod"] == source.dod


def test_battery_starting_requirement_is_a_real_archetype(client: TestClient) -> None:
    battery = _defaults(client)["baterias"]
    archetype = APPLICATION_ARCHETYPES[battery["archetype_slug"]]
    assert battery["voltage_v"] == archetype.target_voltage
    assert battery["energy_kwh"] == archetype.target_energy_kwh
    assert battery["power_kw"] == archetype.target_power_kw
    assert battery["dod"] == archetype.target_dod
    assert battery["chemistry_slug"] == archetype.recommended_chemistries[0]
    # The cell capacity stays empty: the archetype's typical cell is offered by
    # the archetype picker, never imposed as a premise.
    assert battery["cell_capacity_ah"] is None


def test_eco_defaults_cover_both_use_models(client: TestClient) -> None:
    eco = _defaults(client)["eco"]
    assert eco["use_model"] in ("estatico", "movel")
    assert 0 < eco["static"]["duty_cycle"] <= 1
    for key in ("power_watts", "life_years", "carbon_per_energy"):
        assert eco["static"][key] > 0
    for key in ("distance_km", "mobile_intensity", "life_years", "carbon_per_energy"):
        assert eco["mobile"][key] > 0
    assert eco["transport_distance_km"] >= 0
    assert 0 <= eco["recycled_fraction"] <= 1
    assert eco["end_of_life"] == "reciclagem"
    assert eco["note"]


def test_solver_defaults_match_the_request(client: TestClient) -> None:
    solver = _defaults(client)["dimensionar"]
    probe = SolveRequest(case_key="x", inputs={"a": 1.0})
    assert solver["objective"] == probe.objective
    assert solver["limit"] == probe.limit
