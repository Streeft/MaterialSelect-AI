"""Unit tests for the Battery Designer calculation domain (Module S / P4)."""

import pytest

from app.calculations.battery import (
    APPLICATION_ARCHETYPES,
    CHEMISTRIES,
    BatteryDesignError,
    compare_chemistries,
    design_pack,
)


def test_chemistries_catalog_integrity():
    """All 9 chemistries are present and have consistent, physically valid properties."""
    expected_slugs = {
        "lfp",
        "nmc_622",
        "nmc_811",
        "nca",
        "lco",
        "lto",
        "sodio_ion",
        "chumbo_acido",
        "nimh",
    }
    assert set(CHEMISTRIES.keys()) == expected_slugs

    for slug, chem in CHEMISTRIES.items():
        assert chem.slug == slug
        assert chem.nominal_voltage > 0.0
        assert chem.specific_energy > 0.0
        assert chem.energy_density > 0.0
        assert chem.specific_power > 0.0
        assert 0.5 <= chem.cycle_efficiency <= 1.0
        assert chem.cycle_life >= 100
        assert chem.cell_cost_per_kwh > 0.0
        assert chem.operating_temp_min_c < chem.operating_temp_max_c
        assert chem.thermal_runaway_temp_c > 100.0
        assert chem.max_continuous_c_rate > 0.0
        assert chem.peak_c_rate >= chem.max_continuous_c_rate
        assert chem.reference


def test_archetypes_catalog_integrity():
    """Standard application archetypes are present and valid."""
    assert len(APPLICATION_ARCHETYPES) == 6
    for arch in APPLICATION_ARCHETYPES.values():
        assert arch.target_voltage > 0.0
        assert arch.target_energy_kwh > 0.0
        assert arch.target_power_kw > 0.0
        assert 0.5 <= arch.target_dod <= 1.0
        assert arch.default_cell_capacity_ah > 0.0
        for rec in arch.recommended_chemistries:
            assert rec in CHEMISTRIES


def test_pack_design_ev_urban_lfp():
    """Design a 400V, 48 kWh, 100 kW pack with LFP."""
    result = design_pack(
        chemistry_slug="lfp",
        target_voltage_v=400.0,
        target_energy_kwh=48.0,
        target_power_kw=100.0,
        dod=0.85,
        cell_capacity_ah=50.0,
        mass_packing_factor=0.70,
        volume_packing_factor=0.60,
    )

    # Ns = ceil(400 / 3.2) = 125
    assert result.series_cells_ns == 125
    assert result.nominal_voltage_v == 125 * 3.2  # 400.0 V

    # Cell energy: 3.2V * 50Ah = 160 Wh
    assert result.cell_energy_wh == 160.0
    # String energy: 125 * 160 = 20,000 Wh = 20 kWh
    # Target gross energy = 48 / 0.85 = 56.47 kWh -> Np = ceil(56.47 / 20) = 3
    assert result.parallel_strings_np >= 3
    assert result.total_cells == result.series_cells_ns * result.parallel_strings_np

    # Usable energy satisfies target
    assert result.usable_energy_kwh >= 48.0
    assert result.peak_power_kw >= 100.0

    # Packaging mass
    assert result.cells_mass_kg > 0.0
    assert result.pack_mass_kg == pytest.approx(result.cells_mass_kg / 0.70)
    assert result.mass_overhead_kg == pytest.approx(result.pack_mass_kg - result.cells_mass_kg)

    # Packaging volume
    assert result.cells_volume_l > 0.0
    assert result.pack_volume_l == pytest.approx(result.cells_volume_l / 0.60)
    assert result.volume_overhead_l == pytest.approx(result.pack_volume_l - result.cells_volume_l)

    # Pack specific energy is cell specific energy * 0.70
    assert result.pack_specific_energy_wh_kg == pytest.approx(
        result.chemistry.specific_energy * 0.70
    )
    # Pack energy density is cell energy density * 0.60
    assert result.pack_energy_density_wh_l == pytest.approx(
        result.chemistry.energy_density * 0.60
    )

    # Financials
    assert result.pack_cost_total_usd > result.cell_cost_total_usd
    assert result.levelized_cost_per_kwh_cycle > 0.0


def test_pack_design_power_driven_scaling():
    """If power requirement dominates energy, parallel strings scale up to meet power."""
    # Low energy (1 kWh) but extreme power (200 kW)
    result = design_pack(
        chemistry_slug="nmc_622",
        target_voltage_v=400.0,
        target_energy_kwh=1.0,
        target_power_kw=200.0,
        dod=0.80,
        cell_capacity_ah=5.0,
    )
    assert result.peak_power_kw >= 200.0


def test_pack_design_input_validation():
    """Invalid or non-finite inputs are refused with clear messages."""
    with pytest.raises(BatteryDesignError, match="não catalogada"):
        design_pack("desconhecida", 400.0, 50.0, 100.0)

    with pytest.raises(BatteryDesignError, match="estritamente positivas"):
        design_pack("lfp", 0.0, 50.0, 100.0)

    with pytest.raises(BatteryDesignError, match="estritamente positivas"):
        design_pack("lfp", 400.0, -10.0, 100.0)

    with pytest.raises(BatteryDesignError, match="números finitos"):
        design_pack("lfp", float("nan"), 50.0, 100.0)

    with pytest.raises(BatteryDesignError, match="números finitos"):
        design_pack("lfp", 400.0, float("inf"), 100.0)

    with pytest.raises(BatteryDesignError, match="DoD"):
        design_pack("lfp", 400.0, 50.0, 100.0, dod=0.05)

    with pytest.raises(BatteryDesignError, match="mássico"):
        design_pack("lfp", 400.0, 50.0, 100.0, mass_packing_factor=0.1)

    with pytest.raises(BatteryDesignError, match="volumétrico"):
        design_pack("lfp", 400.0, 50.0, 100.0, volume_packing_factor=0.99)


def test_compare_chemistries():
    """Multi-chemistry comparison evaluates all 9 chemistries and identifies dominance."""
    comparison = compare_chemistries(
        target_voltage_v=400.0,
        target_energy_kwh=60.0,
        target_power_kw=150.0,
        dod=0.85,
    )

    assert len(comparison.items) == 9
    by_slug = {it.chemistry_slug: it for it in comparison.items}

    # NMC-811 / NCA should be much lighter than Lead-Acid
    assert by_slug["nmc_811"].pack_mass_kg < by_slug["lfp"].pack_mass_kg
    assert by_slug["nmc_811"].pack_mass_kg < by_slug["chumbo_acido"].pack_mass_kg / 4.0

    # LTO has the highest cycle life
    assert comparison.most_durable_slug == "lto"
    assert by_slug["lto"].cycle_life == 18000

    # High nickel (NMC-811 or NCA) should win in compactness or lightness
    assert comparison.lightest_slug in ("nmc_811", "nca")
    assert comparison.most_compact_slug in ("nmc_811", "nca")

    # Safest is LTO
    assert comparison.safest_slug == "lto"

    # Technical summary is generated with meaningful comparisons
    assert "pack mais leve" in comparison.technical_summary
    assert "mais compacto" in comparison.technical_summary
