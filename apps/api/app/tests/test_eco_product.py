"""The Eco Audit of a product: several components, several legs, seven routes (D-120).

The single-part claims are proved in ``test_eco_audit.py``; these prove what the
list adds — that a sum over components is exact, that one component without a
datum forfeits the product's podium with its name written, that transport and
use read the product's whole mass, and that an end-of-life route is priced only
by a factor the material itself carries.
"""

from __future__ import annotations

import pytest

from app.calculations.eco_audit import (
    CO2_FOOTPRINT,
    EMBODIED_ENERGY,
    EOL_DOWNCYCLE,
    EOL_INCINERATION,
    EOL_LANDFILL,
    EOL_NONE,
    EOL_RECYCLE,
    EOL_REMANUFACTURE,
    EOL_REUSE,
    EOL_ROUTE_TABLE,
    EOL_ROUTES,
    MAX_COMPONENTS,
    PROCESS_CO2,
    PROCESS_ENERGY,
    RECYCLE_CO2,
    RECYCLE_ENERGY,
    TRANSPORT_CARBON_KEY,
    USE_MOBILE,
    USE_STATIC,
    ComponentBrief,
    EcoAuditError,
    TransportLeg,
    UseAssumptions,
    audit,
    audit_product,
)

_MATERIAL = {
    EMBODIED_ENERGY: 200.0,
    CO2_FOOTPRINT: 12.0,
    RECYCLE_ENERGY: 30.0,
    RECYCLE_CO2: 2.0,
}
_PROCESS = {PROCESS_ENERGY: 15.0, PROCESS_CO2: 1.0}

_MOBILE = UseAssumptions(
    model=USE_MOBILE,
    distance_km=200_000.0,
    mobile_intensity=0.0025,
    life_years=12.0,
    carbon_per_energy=0.07,
)
_STATIC = UseAssumptions(
    model=USE_STATIC, power_watts=60.0, duty_cycle=0.25, life_years=10.0, carbon_per_energy=0.05
)

_ROAD = TransportLeg(
    label="Rodoviário", distance_km=1500.0, energy_intensity=0.9, carbon_intensity=0.07
)
_SEA = TransportLeg(
    label="Marítimo", distance_km=8000.0, energy_intensity=0.15, carbon_intensity=0.01
)


def _component(**overrides) -> ComponentBrief:
    payload = {
        "name": "Carcaça",
        "unit_mass": 2.0,
        "quantity": 1,
        "recycled_fraction": 0.0,
        "scrap_fraction": 0.2,
        "end_of_life": EOL_RECYCLE,
        "material": dict(_MATERIAL),
        "process": dict(_PROCESS),
    }
    payload.update(overrides)
    return ComponentBrief(**payload)


def _phase(result, name):
    return next(phase for phase in result.phases if phase.phase == name)


# --- sums -------------------------------------------------------------------


def test_one_component_and_one_leg_equals_the_single_part_audit() -> None:
    """The two entry points are one computation; they cannot disagree."""
    product = audit_product(components=[_component()], legs=[_ROAD], use=_MOBILE)
    single = audit(
        mass_in_part=2.0,
        recycled_fraction=0.0,
        scrap_fraction=0.2,
        embodied_energy=200.0,
        carbon_footprint=12.0,
        recycle_energy=30.0,
        recycle_carbon=2.0,
        process_energy=15.0,
        process_carbon=1.0,
        transport_distance_km=1500.0,
        transport_energy_intensity=0.9,
        transport_carbon_intensity=0.07,
        use=_MOBILE,
        end_of_life=EOL_RECYCLE,
    )
    assert product.total_energy == pytest.approx(single.total_energy)
    assert product.total_carbon == pytest.approx(single.total_carbon)
    for a, b in zip(product.phases, single.phases, strict=True):
        assert a.energy == pytest.approx(b.energy)


def test_material_manufacture_and_end_of_life_are_sums_over_components() -> None:
    a = _component(name="A", unit_mass=2.0, scrap_fraction=0.2)
    b = _component(name="B", unit_mass=0.5, scrap_fraction=0.0, end_of_life=EOL_RECYCLE)
    result = audit_product(components=[a, b], legs=[_ROAD], use=_MOBILE)

    # Hand computation: mass bought = 2/0.8 + 0.5 = 3.0 kg.
    assert _phase(result, "material").energy == pytest.approx(3.0 * 200.0)
    assert _phase(result, "manufatura").energy == pytest.approx(3.0 * 15.0)
    # End of life is on the mass in the part: 2.5 kg.
    assert _phase(result, "fim-de-vida").energy == pytest.approx(2.5 * 30.0)
    assert result.mass_in_product == pytest.approx(2.5)
    assert result.mass_bought == pytest.approx(3.0)


def test_quantity_multiplies_the_unit_mass() -> None:
    four = audit_product(
        components=[_component(unit_mass=0.25, quantity=4)], legs=[_ROAD], use=_MOBILE
    )
    one = audit_product(components=[_component(unit_mass=1.0)], legs=[_ROAD], use=_MOBILE)
    assert four.total_energy == pytest.approx(one.total_energy)
    assert four.components[0].mass_in_part == pytest.approx(1.0)


def test_each_component_carries_its_own_three_phases() -> None:
    result = audit_product(
        components=[_component(name="A"), _component(name="B", unit_mass=1.0)],
        legs=[_ROAD],
        use=_MOBILE,
    )
    assert [p.phase for p in result.components[0].phases] == [
        "material",
        "manufatura",
        "fim-de-vida",
    ]
    assert sum(c.phases[0].energy for c in result.components) == pytest.approx(
        _phase(result, "material").energy
    )


def test_transport_is_the_whole_product_over_every_leg() -> None:
    result = audit_product(
        components=[_component(unit_mass=2.0), _component(unit_mass=3.0)],
        legs=[_ROAD, _SEA],
        use=_MOBILE,
    )
    tonnes = 5.0 / 1000.0
    expected = tonnes * (1500.0 * 0.9 + 8000.0 * 0.15)
    assert _phase(result, "transporte").energy == pytest.approx(expected)
    assert sum(leg.energy for leg in result.legs) == pytest.approx(expected)


def test_the_mobile_use_phase_reads_the_product_mass() -> None:
    result = audit_product(
        components=[_component(unit_mass=2.0), _component(unit_mass=3.0)],
        legs=[_ROAD],
        use=_MOBILE,
    )
    assert _phase(result, "uso").energy == pytest.approx(5.0 * 200_000.0 * 0.0025)


def test_the_static_use_phase_still_ignores_the_mass() -> None:
    light = audit_product(components=[_component(unit_mass=1.0)], legs=[_ROAD], use=_STATIC)
    heavy = audit_product(
        components=[_component(unit_mass=1.0), _component(unit_mass=50.0)],
        legs=[_ROAD],
        use=_STATIC,
    )
    assert _phase(light, "uso").energy == pytest.approx(_phase(heavy, "uso").energy)
    # 60 W × 8760 h × 10 × 0.25 = 1 314 000 W·h = 4730.4 MJ.
    assert _phase(light, "uso").energy == pytest.approx(4730.4)


# --- absence ----------------------------------------------------------------


def test_one_component_without_a_datum_forfeits_the_product_podium() -> None:
    """Principle 3 over a list: a sum over some components is not a total."""
    gap = _component(name="Vedação", material={CO2_FOOTPRINT: 3.0})
    result = audit_product(components=[_component(name="Carcaça"), gap], legs=[_ROAD], use=_MOBILE)

    material = _phase(result, "material")
    assert material.energy is None
    assert EMBODIED_ENERGY in material.energy_missing
    assert "Vedação" in material.energy_reason
    assert "Carcaça" not in material.energy_reason
    assert result.total_energy is None
    assert result.energy_dominance.phase is None
    assert "Material" in result.energy_dominance.refusal


def test_the_other_quantity_survives_when_only_one_is_missing() -> None:
    gap = _component(name="Vedação", material={CO2_FOOTPRINT: 3.0, RECYCLE_CO2: 0.5})
    result = audit_product(components=[_component(), gap], legs=[_ROAD], use=_MOBILE)
    assert _phase(result, "material").carbon is not None
    assert result.carbon_dominance.phase is not None


def test_one_leg_without_an_intensity_forfeits_the_transport_phase() -> None:
    rail = TransportLeg(
        label="Ferroviário", distance_km=300.0, energy_intensity=0.3, carbon_intensity=None
    )
    result = audit_product(components=[_component()], legs=[_ROAD, rail], use=_MOBILE)
    transport = _phase(result, "transporte")
    assert transport.energy is not None
    assert transport.carbon is None
    assert TRANSPORT_CARBON_KEY in transport.carbon_missing
    assert "Trecho 2 (Ferroviário)" in transport.carbon_reason
    assert result.carbon_dominance.phase is None


# --- the seven routes -------------------------------------------------------


def test_there_are_seven_routes_and_every_one_names_its_factors() -> None:
    assert len(EOL_ROUTES) == 7
    assert set(EOL_ROUTES) == set(EOL_ROUTE_TABLE)
    for slug in EOL_ROUTES:
        route = EOL_ROUTE_TABLE[slug]
        if slug == EOL_NONE:
            assert route.energy_slug is None and route.carbon_slug is None
        else:
            assert route.energy_slug and route.carbon_slug


@pytest.mark.parametrize(
    "route",
    [EOL_LANDFILL, EOL_INCINERATION, EOL_DOWNCYCLE, EOL_REMANUFACTURE, EOL_REUSE],
)
def test_a_route_without_its_catalogued_factor_is_unavailable_never_zero(route) -> None:
    result = audit_product(components=[_component(end_of_life=route)], legs=[_ROAD], use=_MOBILE)
    end = _phase(result, "fim-de-vida")
    spec = EOL_ROUTE_TABLE[route]
    assert end.energy is None and end.carbon is None
    assert spec.energy_slug in end.energy_missing
    assert "indisponível" in end.energy_reason and "zero" in end.energy_reason
    assert result.energy_dominance.phase is None


@pytest.mark.parametrize(
    "route",
    [EOL_LANDFILL, EOL_INCINERATION, EOL_DOWNCYCLE, EOL_REMANUFACTURE, EOL_REUSE],
)
def test_a_route_is_priced_by_the_material_own_factor(route) -> None:
    """The factor comes from the catalogue, never from this module."""
    spec = EOL_ROUTE_TABLE[route]
    material = {**_MATERIAL, spec.energy_slug: 4.0, spec.carbon_slug: 0.25}
    result = audit_product(
        components=[_component(end_of_life=route, unit_mass=2.0, material=material)],
        legs=[_ROAD],
        use=_MOBILE,
    )
    end = _phase(result, "fim-de-vida")
    assert end.energy == pytest.approx(2.0 * 4.0)
    assert end.carbon == pytest.approx(2.0 * 0.25)
    assert result.energy_dominance.phase is not None


def test_the_no_route_choice_is_never_left_out_of_the_sum() -> None:
    result = audit_product(components=[_component(end_of_life=EOL_NONE)], legs=[_ROAD], use=_MOBILE)
    end = _phase(result, "fim-de-vida")
    assert end.energy is None
    assert "zero" in end.energy_reason
    assert result.total_energy is None


def test_routes_are_chosen_per_component() -> None:
    reuse = EOL_ROUTE_TABLE[EOL_REUSE]
    result = audit_product(
        components=[
            _component(name="A", end_of_life=EOL_RECYCLE),
            _component(
                name="B",
                end_of_life=EOL_REUSE,
                material={**_MATERIAL, reuse.energy_slug: 1.0, reuse.carbon_slug: 0.1},
            ),
        ],
        legs=[_ROAD],
        use=_MOBILE,
    )
    assert [c.end_of_life for c in result.components] == [EOL_RECYCLE, EOL_REUSE]
    assert _phase(result, "fim-de-vida").energy == pytest.approx(2.0 * 30.0 + 2.0 * 1.0)


# --- refusals ---------------------------------------------------------------


def test_an_empty_product_is_refused() -> None:
    with pytest.raises(EcoAuditError, match="pelo menos um componente"):
        audit_product(components=[], legs=[_ROAD], use=_MOBILE)


def test_a_product_without_legs_is_refused_rather_than_shipped_free() -> None:
    with pytest.raises(EcoAuditError, match="trecho"):
        audit_product(components=[_component()], legs=[], use=_MOBILE)


def test_too_many_components_are_refused() -> None:
    with pytest.raises(EcoAuditError, match="No máximo"):
        audit_product(components=[_component()] * (MAX_COMPONENTS + 1), legs=[_ROAD], use=_MOBILE)


def test_a_bad_component_is_refused_with_its_name() -> None:
    with pytest.raises(EcoAuditError, match="Parafuso"):
        audit_product(
            components=[_component(name="Parafuso", quantity=0)], legs=[_ROAD], use=_MOBILE
        )


def test_a_negative_leg_is_refused() -> None:
    bad = TransportLeg(label="x", distance_km=-1.0, energy_intensity=1.0, carbon_intensity=1.0)
    with pytest.raises(EcoAuditError, match="negativa"):
        audit_product(components=[_component()], legs=[bad], use=_MOBILE)


def test_an_unknown_route_is_refused() -> None:
    with pytest.raises(EcoAuditError, match="Rota de fim de vida"):
        audit_product(components=[_component(end_of_life="compostagem")], legs=[_ROAD], use=_MOBILE)
