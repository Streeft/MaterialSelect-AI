"""A álgebra do Battery Designer (P4), sem tocar no catálogo.

Estes testes exercitam **a conta**, e por isso constroem a própria célula. O
conteúdo do catálogo é outra pergunta, e ela é feita onde o catálogo mora:
`test_battery_api.py` confere as nove químicas semeadas, a citação de cada uma e
a fonte que registra a licença. Amarrar um teste de fórmula aos números do
catálogo faria uma correção de dado quebrar a prova da álgebra.
"""

import pytest

from app.calculations.battery import (
    APPLICATION_ARCHETYPES,
    BatteryDesignError,
    CellSpec,
    compare_chemistries,
    design_pack,
)


def _cell(slug: str = "lfp", **overrides) -> CellSpec:
    """Uma célula de teste. Números redondos: a conta tem de poder ser refeita."""
    base = dict(
        slug=slug,
        name=f"Química {slug}",
        formula="LiFePO4",
        nominal_voltage=3.2,
        specific_energy=160.0,
        energy_density=350.0,
        specific_power=1500.0,
        cycle_efficiency=0.95,
        cycle_life=3500,
        cell_cost_per_kwh=75.0,
        thermal_safety="ALTA",
        thermal_runaway_temp_c=270.0,
        operating_temp_min_c=-20.0,
        operating_temp_max_c=60.0,
        max_continuous_c_rate=3.0,
        peak_c_rate=5.0,
        description="Célula de teste.",
        advantages=["a"],
        limitations=["b"],
        typical_applications=["c"],
    )
    base.update(overrides)
    return CellSpec(**base)


def test_archetypes_catalog_integrity():
    """Os arquétipos são premissas de projeto, e moram em código como tais."""
    assert len(APPLICATION_ARCHETYPES) == 6
    for arch in APPLICATION_ARCHETYPES.values():
        assert arch.target_voltage > 0.0
        assert arch.target_energy_kwh > 0.0
        assert arch.target_power_kw > 0.0
        assert 0.5 <= arch.target_dod <= 1.0
        assert arch.default_cell_capacity_ah > 0.0
        # As químicas recomendadas são slugs; quem confere que elas existem no
        # catálogo é o teste de API, que tem o catálogo à mão.
        assert arch.recommended_chemistries


def test_pack_design_ev_urban_lfp():
    """Design a 400V, 48 kWh, 100 kW pack with LFP."""
    result = design_pack(
        cell=_cell("lfp"),
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
    assert result.pack_energy_density_wh_l == pytest.approx(result.chemistry.energy_density * 0.60)

    # Financials
    assert result.pack_cost_total_usd > result.cell_cost_total_usd
    assert result.levelized_cost_per_kwh_cycle > 0.0


def test_pack_design_power_driven_scaling():
    """If power requirement dominates energy, parallel strings scale up to meet power."""
    # Low energy (1 kWh) but extreme power (200 kW)
    result = design_pack(
        cell=_cell("nmc_622"),
        target_voltage_v=400.0,
        target_energy_kwh=1.0,
        target_power_kw=200.0,
        dod=0.80,
        cell_capacity_ah=5.0,
    )
    assert result.peak_power_kw >= 200.0


def test_pack_design_input_validation():
    """Invalid or non-finite inputs are refused with clear messages."""
    # Uma química inexistente não é erro desta camada: ela recebe a célula
    # pronta e nunca procura nada. Quem devolve 404 por slug é o serviço, e é
    # `test_battery_api.py` que prova isso.
    with pytest.raises(BatteryDesignError, match="estritamente positivas"):
        design_pack(_cell(), 0.0, 50.0, 100.0)

    with pytest.raises(BatteryDesignError, match="estritamente positivas"):
        design_pack(_cell(), 400.0, -10.0, 100.0)

    with pytest.raises(BatteryDesignError, match="números finitos"):
        design_pack(_cell(), float("nan"), 50.0, 100.0)

    with pytest.raises(BatteryDesignError, match="números finitos"):
        design_pack(_cell(), 400.0, float("inf"), 100.0)

    with pytest.raises(BatteryDesignError, match="DoD"):
        design_pack(_cell(), 400.0, 50.0, 100.0, dod=0.05)

    with pytest.raises(BatteryDesignError, match="mássico"):
        design_pack(_cell(), 400.0, 50.0, 100.0, mass_packing_factor=0.1)

    with pytest.raises(BatteryDesignError, match="volumétrico"):
        design_pack(_cell(), 400.0, 50.0, 100.0, volume_packing_factor=0.99)


def test_compare_chemistries():
    """O pódio sai das células recebidas, e de nenhuma outra.

    As três aqui são construídas com uma diferença por faceta, para que cada
    campo do pódio tenha uma resposta previsível: a leve é a de maior energia
    específica, a durável é a de maior vida em ciclos, a segura é a de rótulo
    térmico mais alto. Quem confere que o catálogo real tem essas químicas é o
    teste de API.
    """
    leve = _cell("leve", specific_energy=260.0, energy_density=700.0, cycle_life=1000)
    durable = _cell("durable", specific_energy=80.0, cycle_life=18000, thermal_safety="MUITO_ALTA")
    barata = _cell("barata", specific_energy=120.0, cell_cost_per_kwh=40.0, cycle_life=500)

    comparison = compare_chemistries(
        cells=[leve, durable, barata],
        target_voltage_v=400.0,
        target_energy_kwh=60.0,
        target_power_kw=150.0,
        dod=0.85,
    )

    assert len(comparison.items) == 3
    by_slug = {it.chemistry_slug: it for it in comparison.items}

    # Mais energia específica, menos massa: é a definição da grandeza.
    assert by_slug["leve"].pack_mass_kg < by_slug["durable"].pack_mass_kg
    assert comparison.lightest_slug == "leve"
    assert comparison.most_compact_slug == "leve"

    assert comparison.most_durable_slug == "durable"
    assert by_slug["durable"].cycle_life == 18000
    assert comparison.safest_slug == "durable"

    # O custo inicial é da mais barata por kWh; o nivelado leva a vida junto, e
    # por isso os dois pódios podem discordar — que é o ponto da comparação.
    assert comparison.lowest_upfront_cost_slug == "barata"

    # O resumo em prosa nomeia cada faceta do pódio — inclusive a durabilidade,
    # que a versão original calculava e esquecia de dizer (era o F841 do ruff).
    assert "pack mais leve" in comparison.technical_summary
    assert "mais compacto" in comparison.technical_summary
    assert "maior vida em ciclos" in comparison.technical_summary


def test_compare_refuses_an_empty_catalogue():
    """Pódio sobre ninguém não é pódio — a recusa tem de ser escrita.

    Devolver "a mais leve" de um conjunto vazio quebraria; devolver vazio em
    silêncio leria como "nenhuma química serve", que é uma afirmação sobre as
    químicas e não sobre o catálogo estar vazio.
    """
    with pytest.raises(BatteryDesignError, match="Nenhuma química"):
        compare_chemistries(
            cells=[],
            target_voltage_v=400.0,
            target_energy_kwh=60.0,
            target_power_kw=150.0,
        )
