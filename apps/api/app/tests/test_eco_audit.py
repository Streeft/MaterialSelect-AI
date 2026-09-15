"""The Eco Audit: the five phases, the two models of use, and what it refuses.

These tests are organised around the four claims the module docstring makes,
because those are the claims that would still be "working software" if they were
quietly wrong: the numbers would come out, and they would be about the wrong
thing.
"""

from __future__ import annotations

import pytest

from app.calculations.eco_audit import (
    EMBODIED_ENERGY,
    EOL_INCINERATION,
    EOL_LANDFILL,
    EOL_RECYCLE,
    MANUFATURA,
    MATERIAL,
    PHASES,
    PROCESS_ENERGY,
    RECYCLE_ENERGY,
    USE_MOBILE,
    USE_STATIC,
    USO,
    EcoAuditError,
    UseAssumptions,
    audit,
)

#: A complete brief: every phase computable, so the podium is reachable and the
#: refusals below are visibly caused by what each test removes.
_BASE = {
    "mass_in_part": 2.0,
    "recycled_fraction": 0.0,
    "scrap_fraction": 0.2,
    "embodied_energy": 200.0,
    "carbon_footprint": 12.0,
    "recycle_energy": 30.0,
    "recycle_carbon": 2.0,
    "process_energy": 15.0,
    "process_carbon": 1.0,
    "transport_distance_km": 1500.0,
    "transport_energy_intensity": 0.9,
    "transport_carbon_intensity": 0.07,
    "end_of_life": EOL_RECYCLE,
}

_MOBILE = UseAssumptions(
    model=USE_MOBILE,
    distance_km=200_000.0,
    mobile_intensity=0.0025,
    life_years=12.0,
    carbon_per_energy=0.07,
)

_STATIC = UseAssumptions(
    model=USE_STATIC,
    power_watts=60.0,
    duty_cycle=0.25,
    life_years=10.0,
    carbon_per_energy=0.05,
)


def _audit(**overrides):
    payload = {**_BASE, "use": _MOBILE}
    payload.update(overrides)
    return audit(**payload)


def _phase(result, name):
    return next(phase for phase in result.phases if phase.phase == name)


# --- the shape of the answer -----------------------------------------------


def test_the_five_phases_come_back_in_the_order_a_part_lives_them() -> None:
    """Never sorted by magnitude: the reader compares against a life, not a rank."""
    result = _audit()
    assert tuple(phase.phase for phase in result.phases) == PHASES


def test_every_phase_says_how_it_was_computed() -> None:
    """The number has to be re-derivable by hand from what the screen shows."""
    for phase in _audit().phases:
        assert phase.detail


# --- 2. the material phase is charged on the mass bought --------------------


def test_the_material_phase_pays_for_the_scrap_the_process_will_make() -> None:
    """A fifth scrapped means a fifth more smelted, product or not."""
    result = _audit(scrap_fraction=0.2)
    assert result.mass_bought == pytest.approx(2.5)
    assert _phase(result, MATERIAL).energy == pytest.approx(2.5 * 200.0)


def test_a_wasteful_process_raises_the_material_phase_not_only_manufacture() -> None:
    """The coupling is the point: waste is bought material, not just machine time."""
    tight = _audit(scrap_fraction=0.0)
    wasteful = _audit(scrap_fraction=0.5)
    assert _phase(wasteful, MATERIAL).energy > _phase(tight, MATERIAL).energy
    assert _phase(wasteful, MANUFATURA).energy > _phase(tight, MANUFATURA).energy


def test_the_end_of_life_is_charged_on_the_part_not_on_the_scrap() -> None:
    """The scrap never became a product and never reached an end of life as one."""
    result = _audit(scrap_fraction=0.5)
    assert _phase(result, "fim-de-vida").energy == pytest.approx(2.0 * 30.0)


# --- recycled content -------------------------------------------------------


def test_recycled_content_mixes_the_two_intensities() -> None:
    result = _audit(recycled_fraction=0.4)
    expected = 2.5 * (0.6 * 200.0 + 0.4 * 30.0)
    assert _phase(result, MATERIAL).energy == pytest.approx(expected)


def test_recycled_content_lowers_the_material_phase() -> None:
    assert (
        _phase(_audit(recycled_fraction=0.4), MATERIAL).energy
        < _phase(_audit(recycled_fraction=0.0), MATERIAL).energy
    )


def test_a_material_without_a_recycling_figure_is_audited_at_zero_recycled_content() -> None:
    """What the brief needs depends on the brief, not on the catalogue."""
    result = _audit(recycled_fraction=0.0, recycle_energy=None, end_of_life=EOL_LANDFILL)
    assert _phase(result, MATERIAL).energy == pytest.approx(2.5 * 200.0)


def test_asking_for_recycled_content_the_catalogue_cannot_price_names_what_is_missing() -> None:
    result = _audit(recycled_fraction=0.4, recycle_energy=None)
    material = _phase(result, MATERIAL)
    assert material.energy is None
    assert material.energy_missing == (RECYCLE_ENERGY,)
    assert RECYCLE_ENERGY in material.energy_reason


# --- 1. the two models of use ----------------------------------------------


def test_the_static_model_does_not_contain_the_mass_at_all() -> None:
    """This is the whole reason the choice exists: lightweighting saves nothing here."""
    light = _audit(mass_in_part=1.0, use=_STATIC)
    heavy = _audit(mass_in_part=20.0, use=_STATIC)
    assert _phase(light, USO).energy == pytest.approx(_phase(heavy, USO).energy)


def test_the_mobile_model_is_linear_in_the_mass() -> None:
    light = _audit(mass_in_part=1.0)
    heavy = _audit(mass_in_part=2.0)
    assert _phase(heavy, USO).energy == pytest.approx(2 * _phase(light, USO).energy)


def test_the_static_model_matches_power_times_hours_computed_independently() -> None:
    result = _audit(use=_STATIC)
    hours = 8760.0 * 10.0 * 0.25
    assert _phase(result, USO).energy == pytest.approx(60.0 * hours * 3600.0 / 1e6)


def test_the_result_says_which_model_ran() -> None:
    assert _audit(use=_STATIC).use_model == USE_STATIC
    assert _audit(use=_MOBILE).use_model == USE_MOBILE


def test_a_field_of_the_other_model_is_refused_not_ignored() -> None:
    """Dropping it silently would leave a number the reader believes in and the sum lacks."""
    with pytest.raises(EcoAuditError, match="outro modelo"):
        UseAssumptions(
            model=USE_MOBILE,
            distance_km=1000.0,
            mobile_intensity=0.002,
            power_watts=60.0,
        )
    with pytest.raises(EcoAuditError, match="outro modelo"):
        UseAssumptions(
            model=USE_STATIC,
            power_watts=60.0,
            duty_cycle=0.5,
            life_years=5.0,
            distance_km=1000.0,
        )


def test_each_model_requires_its_own_inputs() -> None:
    with pytest.raises(EcoAuditError, match="potência"):
        UseAssumptions(model=USE_STATIC, duty_cycle=0.5, life_years=5.0)
    with pytest.raises(EcoAuditError, match="distância"):
        UseAssumptions(model=USE_MOBILE, mobile_intensity=0.002)
    with pytest.raises(EcoAuditError, match="ciclo de trabalho"):
        UseAssumptions(model=USE_STATIC, power_watts=60.0, duty_cycle=1.5, life_years=5.0)


def test_an_unknown_use_model_is_refused() -> None:
    with pytest.raises(EcoAuditError, match="Modelo de uso desconhecido"):
        UseAssumptions(model="hibrido", power_watts=1.0)


# --- 3. recycling is spent here and saved elsewhere ------------------------


def test_the_recycling_route_spends_energy_and_never_credits_the_total() -> None:
    result = _audit(end_of_life=EOL_RECYCLE)
    end = _phase(result, "fim-de-vida")
    assert end.energy > 0
    assert result.total_energy == pytest.approx(sum(phase.energy for phase in result.phases))


def test_the_note_about_the_credit_travels_with_the_answer() -> None:
    assert "não abate crédito" in _audit().recycling_credit_note


@pytest.mark.parametrize("route", [EOL_LANDFILL, EOL_INCINERATION])
def test_an_unquantified_route_is_declared_and_never_zero(route) -> None:
    """A landfill that costs zero would make burying a part look like a bargain."""
    result = _audit(end_of_life=route)
    end = _phase(result, "fim-de-vida")
    assert end.energy is None and end.carbon is None
    assert end.energy_reason and "zero" in end.energy_reason


def test_an_unknown_route_is_refused() -> None:
    with pytest.raises(EcoAuditError, match="Rota de fim de vida"):
        _audit(end_of_life="compostagem")


# --- 4. an incomplete audit cannot be summarised ---------------------------


def test_the_complete_brief_names_a_dominant_phase_with_its_share() -> None:
    result = _audit()
    assert result.energy_dominance.phase is not None
    assert 0 < result.energy_dominance.share <= 1
    assert result.energy_dominance.refusal is None


def test_the_dominant_phase_is_the_largest_one() -> None:
    result = _audit()
    largest = max(result.phases, key=lambda phase: phase.energy)
    assert result.energy_dominance.phase == largest.phase
    assert result.energy_dominance.share == pytest.approx(largest.energy / result.total_energy)


def test_one_missing_phase_forfeits_the_podium_with_the_reason_written() -> None:
    """The phase nobody could compute might be the one that dominates."""
    result = _audit(process_energy=None)
    assert result.energy_dominance.phase is None
    assert "Manufatura" in result.energy_dominance.refusal
    assert "pode ser" in result.energy_dominance.refusal


def test_one_missing_phase_also_forfeits_the_total() -> None:
    """A total over four of five phases is a subtotal that reads like a total."""
    result = _audit(process_energy=None)
    assert result.total_energy is None
    assert _phase(result, MANUFATURA).energy_missing == (PROCESS_ENERGY,)


def test_energy_and_carbon_are_judged_separately() -> None:
    """A phase can be known in MJ and unknown in kg CO₂; they read different data."""
    result = _audit(process_carbon=None)
    manufacture = _phase(result, MANUFATURA)
    assert manufacture.energy is not None
    assert manufacture.carbon is None
    assert manufacture.carbon_reason and manufacture.energy_reason is None
    assert result.energy_dominance.phase is not None
    assert result.carbon_dominance.phase is None


def test_the_two_podiums_can_disagree() -> None:
    """Which is itself the finding: a clean grid moves carbon and not energy."""
    dirty = _audit(use=_MOBILE)
    clean = _audit(
        use=UseAssumptions(
            model=USE_MOBILE,
            distance_km=200_000.0,
            mobile_intensity=0.0025,
            life_years=12.0,
            carbon_per_energy=0.0001,
        )
    )
    assert dirty.energy_dominance.phase == clean.energy_dominance.phase
    assert dirty.carbon_dominance.phase != clean.carbon_dominance.phase


def test_a_use_phase_without_a_carbon_intensity_has_energy_and_no_carbon() -> None:
    result = _audit(
        use=UseAssumptions(
            model=USE_MOBILE, distance_km=1000.0, mobile_intensity=0.002, life_years=5.0
        )
    )
    use = _phase(result, USO)
    assert use.energy is not None and use.carbon is None
    assert use.carbon_reason
    assert result.total_carbon is None


def test_a_missing_material_figure_is_named_by_its_catalogue_slug() -> None:
    material = _phase(_audit(embodied_energy=None), MATERIAL)
    assert material.energy_missing == (EMBODIED_ENERGY,)
    assert EMBODIED_ENERGY in material.energy_reason


def test_a_missing_transport_intensity_is_named_too() -> None:
    """Not a catalogue slug, but "why is this cell empty" still has an answer."""
    result = _audit(transport_energy_intensity=None)
    transport = _phase(result, "transporte")
    assert transport.energy is None
    assert transport.energy_missing and transport.energy_reason


# --- the units ---------------------------------------------------------------


def test_the_carbon_unit_is_declared_in_words_and_says_why() -> None:
    result = _audit()
    assert result.carbon_unit == "kg de CO₂"
    assert result.energy_unit == "MJ"
    assert "adimensional" in result.carbon_unit_note


# --- refusals on the brief itself ------------------------------------------


def test_a_non_positive_mass_is_refused() -> None:
    with pytest.raises(EcoAuditError, match="massa"):
        _audit(mass_in_part=0.0)


def test_a_scrap_fraction_of_one_is_refused() -> None:
    """Every gram lost means the part is never made, not that it is free."""
    with pytest.raises(EcoAuditError, match="refugo"):
        _audit(scrap_fraction=1.0)


def test_a_recycled_fraction_outside_zero_to_one_is_refused() -> None:
    with pytest.raises(EcoAuditError, match="teor reciclado"):
        _audit(recycled_fraction=1.4)


def test_a_negative_distance_is_refused() -> None:
    with pytest.raises(EcoAuditError, match="distância"):
        _audit(transport_distance_km=-1.0)
