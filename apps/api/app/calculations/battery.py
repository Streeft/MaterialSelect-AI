"""Battery Designer: electrochemical cell chemistry and battery pack sizing (Module S / P4).

This module implements the physical and electrochemical sizing of battery packs
inspired by Granta EduPack Module S, following Ashby's materials selection
methodology.

Key Design Principles:
1. Electrochemical Cell Chemistry Catalog:
   Covers established commercial and emerging chemistries (LFP, NMC-622, NMC-811,
   NCA, LCO, LTO, Na-ion, Lead-Acid, NiMH) with verified specific energies (Wh/kg),
   energy densities (Wh/L), specific power (W/kg), round-trip efficiencies, cycle life,
   nominal cell voltages, and thermal safety rankings derived from standard battery
   literature (Linden's Handbook, Tarascon, Armand, Reddy).

2. Deterministic Analytical Sizing (Ns x Np):
   - Ns: Number of series cells to satisfy bus voltage requirements.
   - Np: Number of parallel strings to meet both energy and continuous/peak power demands.
   - Packaging Factors (f_mass, f_vol, f_cost):
     Accounts for structure, battery management system (BMS), thermal management
     (cooling channels/plates), and busbars.

3. Objective Trade-offs and Dominance:
   Evaluates multi-chemistry trade-offs (mass vs. volume vs. upfront cost vs.
   cycle life vs. levelized cost per kWh-cycle vs. thermal runaway safety).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

#: Thermal safety classifications
ThermalSafetyLevel = Literal["BAIXA", "MODERADA", "MEDIA", "ALTA", "MUITO_ALTA"]

#: Cell mechanical format
CellFormat = Literal["cilindrica", "prismatica", "pouch"]


@dataclass(frozen=True)
class BatteryChemistry:
    slug: str
    name: str
    formula: str
    nominal_voltage: float  # V
    specific_energy: float  # Wh/kg (cell level)
    energy_density: float  # Wh/L (cell level)
    specific_power: float  # W/kg (cell level)
    cycle_efficiency: float  # 0.0 - 1.0 (round-trip coulombic/energy efficiency)
    cycle_life: int  # Number of cycles at 80% DoD
    cell_cost_per_kwh: float  # USD / kWh (cell level)
    thermal_safety: ThermalSafetyLevel
    thermal_runaway_temp_c: float  # °C onset of self-heating/runaway
    operating_temp_min_c: float  # °C
    operating_temp_max_c: float  # °C
    max_continuous_c_rate: float  # C (discharge)
    peak_c_rate: float  # C (10s pulse discharge)
    description: str
    advantages: list[str]
    limitations: list[str]
    typical_applications: list[str]
    reference: str


#: Catalog of electrochemical cell chemistries
CHEMISTRIES: dict[str, BatteryChemistry] = {
    "lfp": BatteryChemistry(
        slug="lfp",
        name="Fosfato de Ferro-Lítio (LFP)",
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
        description=(
            "Química de cátodo de olivina com ligação P-O covalente de altíssima "
            "estabilidade térmica. Livre de cobalto e níquel, oferece excepcional "
            "segurança contra fuga térmica e ciclo de vida estendido."
        ),
        advantages=[
            "Excepcional estabilidade térmica e resistência à fuga térmica",
            "Ciclo de vida longo (3000-5000 ciclos)",
            "Livre de níquel e cobalto (menor risco na cadeia de suprimentos)",
            "Excelente custo por ciclo e tolerância a sobrecarga",
        ],
        limitations=[
            "Menor energia específica que NMC/NCA (~160 Wh/kg)",
            "Curva de tensão muito plana (dificulta estimativa de SoC)",
            "Desempenho degradado em temperaturas abaixo de 0 °C",
        ],
        typical_applications=[
            "Veículos elétricos urbanos e comerciais",
            "Armazenamento estacionário residencial e em rede (BESS)",
            "Ferramentas elétricas industriais",
        ],
        reference="Linden's Handbook of Batteries (4th Ed.); Tarascon & Armand (Nature 2001)",
    ),
    "nmc_622": BatteryChemistry(
        slug="nmc_622",
        name="Níquel-Manganês-Cobalto 6:2:2 (NMC-622)",
        formula="LiNi0.6Mn0.2Co0.2O2",
        nominal_voltage=3.65,
        specific_energy=230.0,
        energy_density=580.0,
        specific_power=1800.0,
        cycle_efficiency=0.95,
        cycle_life=1800,
        cell_cost_per_kwh=100.0,
        thermal_safety="MEDIA",
        thermal_runaway_temp_c=210.0,
        operating_temp_min_c=-20.0,
        operating_temp_max_c=55.0,
        max_continuous_c_rate=2.5,
        peak_c_rate=4.0,
        description=(
            "Equilíbrio clássico da indústria automotiva combinando alto teor de níquel "
            "(energia), manganês (estabilidade estrutural) e cobalto (condutividade)."
        ),
        advantages=[
            "Excelente balanço entre densidade energética, potência e vida útil",
            "Curva de descarga inclinada facilitando medição precisa de SoC",
            "Cadeia de produção e reciclagem madura globalmente",
        ],
        limitations=[
            "Requer cobalto e níquel em teores consideráveis",
            "Temperatura de fuga térmica moderada (~210 °C)",
            "Exige sistema ativo de gerenciamento térmico (BTMS)",
        ],
        typical_applications=[
            "Veículos elétricos de passeio (médio/longo alcance)",
            "Drones industriais e aeroespacial leve",
            "Eletrônicos portáteis de alta performance",
        ],
        reference="Reddy, Linden's Handbook of Batteries (2011); BloombergNEF Battery Survey",
    ),
    "nmc_811": BatteryChemistry(
        slug="nmc_811",
        name="Níquel-Manganês-Cobalto 8:1:1 (NMC-811)",
        formula="LiNi0.8Mn0.1Co0.1O2",
        nominal_voltage=3.7,
        specific_energy=265.0,
        energy_density=660.0,
        specific_power=2100.0,
        cycle_efficiency=0.95,
        cycle_life=1300,
        cell_cost_per_kwh=110.0,
        thermal_safety="MODERADA",
        thermal_runaway_temp_c=195.0,
        operating_temp_min_c=-15.0,
        operating_temp_max_c=50.0,
        max_continuous_c_rate=3.0,
        peak_c_rate=5.0,
        description=(
            "Formulação rica em níquel para maximizar a densidade de energia e reduzir "
            "o conteúdo de cobalto a 10%. Padrão moderno em VEs premium."
        ),
        advantages=[
            "Altíssima densidade energética gravimétrica e volumétrica",
            "Menor dependência de cobalto em comparação com NMC-111 e LCO",
            "Reduz significativamente a massa do pack veicular",
        ],
        limitations=[
            "Sensibilidade térmica aumentada e menor temperatura de decomposição",
            "Degradação de ciclo mais acelerada sob alta temperatura e 100% SoC",
            "Exige arquiteturas rigorosas de isolamento celular contra propagação",
        ],
        typical_applications=[
            "Veículos elétricos de alta autonomia (>500 km)",
            "Aeronaves elétricas leves (eVTOL)",
            "Drones de longa permanência",
        ],
        reference="Doeff et al. (Chem. Rev. 2020); BloombergNEF Technology Outlook",
    ),
    "nca": BatteryChemistry(
        slug="nca",
        name="Níquel-Cobalto-Alumínio (NCA)",
        formula="LiNiCoAlO2",
        nominal_voltage=3.65,
        specific_energy=255.0,
        energy_density=630.0,
        specific_power=2300.0,
        cycle_efficiency=0.94,
        cycle_life=1200,
        cell_cost_per_kwh=112.0,
        thermal_safety="MODERADA",
        thermal_runaway_temp_c=190.0,
        operating_temp_min_c=-20.0,
        operating_temp_max_c=50.0,
        max_continuous_c_rate=3.5,
        peak_c_rate=6.0,
        description=(
            "Substitui o manganês por alumínio para estabilizar o cátodo de alto níquel. "
            "Combina densidade energética extrema com alta potência específica."
        ),
        advantages=[
            "Excelente potência específica de aceleração",
            "Densidade de energia comparável ao NMC-811",
            "Ampla base de validação em veículos esportivos e de ponta",
        ],
        limitations=[
            "Vulnerável a superaquecimento se o BMS falhar",
            "Custo elevado e reciclabilidade complexa",
            "Ciclo de vida ligeiramente inferior ao LFP e NMC-622",
        ],
        typical_applications=[
            "Veículos elétricos de alta aceleração/performance",
            "Ferramentas sem fio de alto torque",
            "Aplicações militares e aeroespaciais",
        ],
        reference="Whittingham (Chem. Rev. 2004); Linden's Handbook of Batteries",
    ),
    "lco": BatteryChemistry(
        slug="lco",
        name="Óxido de Cobalto-Lítio (LCO)",
        formula="LiCoO2",
        nominal_voltage=3.7,
        specific_energy=200.0,
        energy_density=550.0,
        specific_power=900.0,
        cycle_efficiency=0.92,
        cycle_life=800,
        cell_cost_per_kwh=135.0,
        thermal_safety="BAIXA",
        thermal_runaway_temp_c=150.0,
        operating_temp_min_c=-10.0,
        operating_temp_max_c=45.0,
        max_continuous_c_rate=1.0,
        peak_c_rate=2.0,
        description=(
            "A química pioneira do íon-lítio (Goodenough, 1980). Cátodo estratificado "
            "com 60% de cobalto em massa. Excelente densidade volumétrica em pequenos "
            "formatos, mas baixa tolerância a sobreaquecimento."
        ),
        advantages=[
            "Densidade volumétrica compacta para gadgets",
            "Baixa autodescarga (<2% ao mês)",
            "Maturação fabril de mais de 30 anos",
        ],
        limitations=[
            "Custo muito elevado devido ao teor maciço de cobalto",
            "Baixa segurança térmica (~150 °C fuga térmica)",
            "Vida útil reduzida e inadequada para tração pesada",
        ],
        typical_applications=[
            "Smartphones e tablets",
            "Notebooks ultrafinos",
            "Câmeras e dispositivos médicos portáteis",
        ],
        reference="Goodenough & Park (JACS 2013); Linden's Handbook (4th Ed.)",
    ),
    "lto": BatteryChemistry(
        slug="lto",
        name="Titanato de Lítio (LTO)",
        formula="Li4Ti5O12",
        nominal_voltage=2.4,
        specific_energy=85.0,
        energy_density=180.0,
        specific_power=4000.0,
        cycle_efficiency=0.97,
        cycle_life=18000,
        cell_cost_per_kwh=280.0,
        thermal_safety="MUITO_ALTA",
        thermal_runaway_temp_c=350.0,
        operating_temp_min_c=-35.0,
        operating_temp_max_c=65.0,
        max_continuous_c_rate=10.0,
        peak_c_rate=20.0,
        description=(
            "Substitui o ânodo de grafite por titanato de lítio (estrutura espinélio com "
            "variação volumétrica nula / zero-strain). Elimina a formação de dendritos de "
            "lítio e possibilita recarga em menos de 10 minutos com vida quase ilimitada."
        ),
        advantages=[
            "Ciclo de vida imenso (15.000 a 25.000 ciclos)",
            "Recarga ultrarrápida (10C a 20C sem degradação)",
            "Operação excelente em frio extremo até -35 °C",
            "Segurança intrínseca absoluta (não forma dendritos)",
        ],
        limitations=[
            "Baixa tensão nominal (2.4 V) e baixa energia específica (~85 Wh/kg)",
            "Custo de aquisição inicial significativamente superior",
            "Pack fica volumoso e pesado para veículos leves de longa autonomia",
        ],
        typical_applications=[
            "Ônibus elétricos com recarga de oportunidade em paradas (flash charging)",
            "Estabilização de frequência em redes elétricas (grid regulation)",
            "Trens elétricos e empilhadeiras de ciclo contínuo 24/7",
        ],
        reference="Zaghib et al. (J. Power Sources 2013); Ashby Energy Storage Profiles",
    ),
    "sodio_ion": BatteryChemistry(
        slug="sodio_ion",
        name="Íon de Sódio (Na-ion)",
        formula="Na-ion",
        nominal_voltage=3.1,
        specific_energy=145.0,
        energy_density=285.0,
        specific_power=1600.0,
        cycle_efficiency=0.92,
        cycle_life=2600,
        cell_cost_per_kwh=60.0,
        thermal_safety="ALTA",
        thermal_runaway_temp_c=260.0,
        operating_temp_min_c=-25.0,
        operating_temp_max_c=55.0,
        max_continuous_c_rate=3.0,
        peak_c_rate=5.0,
        description=(
            "Tecnologia sustentável que emprega sódio abundante na crosta terrestre em vez "
            "de lítio, e folha de alumínio em ambos os eletrodos (sem cobre). Pode ser "
            "descarregada a 0 V sem danos estruturais, simplificando o frete aéreo."
        ),
        advantages=[
            "Custo de matérias-primas muito inferior (abundância de sódio)",
            "Elimina folha de cobre (usa alumínio no ânodo e cátodo)",
            "Pode ser transportada a 0 V com risco de incêndio nulo em trânsito",
            "Excelente retenção de capacidade em baixas temperaturas (-20 °C)",
        ],
        limitations=[
            "Densidade energética intermediária (~145 Wh/kg, abaixo de NMC)",
            "Raio iônico do sódio maior que o lítio (maior expansão mecânica)",
            "Indústria de produção em estágio inicial de escalonamento",
        ],
        typical_applications=[
            "Sistemas BESS de armazenamento de energia renovável",
            "Veículos elétricos de baixo custo e micro-mobilidade",
            "Sistemas de no-break (UPS) telecom",
        ],
        reference="Barker et al. (Nat. Energy 2020); CATL Sodium-ion Whitepaper 2023",
    ),
    "chumbo_acido": BatteryChemistry(
        slug="chumbo_acido",
        name="Chumbo-Ácido Selada (VRLA/AGM)",
        formula="Pb-Acid",
        nominal_voltage=2.0,
        specific_energy=38.0,
        energy_density=75.0,
        specific_power=260.0,
        cycle_efficiency=0.80,
        cycle_life=450,
        cell_cost_per_kwh=65.0,
        thermal_safety="ALTA",
        thermal_runaway_temp_c=300.0,
        operating_temp_min_c=-20.0,
        operating_temp_max_c=50.0,
        max_continuous_c_rate=0.5,
        peak_c_rate=2.0,
        description=(
            "A química eletroquímica secundária mais antiga (Planté, 1859). Robusta e com "
            "reciclagem em circuito fechado próxima de 99%, porém extremamente pesada e "
            "com ciclo de vida restrito."
        ),
        advantages=[
            "Custo de aquisição inicial acessível",
            "Infraestrutura de reciclagem universalmente estabelecida (>98%)",
            "Comportamento confiável e tolerância a flutuação de tensão",
        ],
        limitations=[
            "Densidade de energia gravimétrica muito baixa (35-40 Wh/kg)",
            "Ciclo de vida reduzido (300-500 ciclos sob 80% DoD)",
            "Massa proibitiva para tração de alta performance",
        ],
        typical_applications=[
            "Partida de motores a combustão interna (baterias SLI 12V)",
            "No-breaks (UPS) estáticos convencionais",
            "Sistemas auxiliares de subestações",
        ],
        reference="Pavlov, Lead-Acid Batteries (Elsevier 2017); Ashby Materials and Energy",
    ),
    "nimh": BatteryChemistry(
        slug="nimh",
        name="Níquel-Hidreto Metálico (NiMH)",
        formula="NiMH",
        nominal_voltage=1.2,
        specific_energy=75.0,
        energy_density=170.0,
        specific_power=600.0,
        cycle_efficiency=0.78,
        cycle_life=850,
        cell_cost_per_kwh=130.0,
        thermal_safety="ALTA",
        thermal_runaway_temp_c=250.0,
        operating_temp_min_c=-20.0,
        operating_temp_max_c=50.0,
        max_continuous_c_rate=1.5,
        peak_c_rate=3.0,
        description=(
            "Substituiu o níquel-cádmio eliminando o cádmio tóxico. Foi a espinha dorsal dos "
            "primeiros veículos híbridos comerciais (e.g. Toyota Prius gerações 1-3). "
            "Resistente a abusos, mas com taxa de autodescarga e custo relativamente altos."
        ),
        advantages=[
            "Livre de metais pesados tóxicos como cádmio ou chumbo",
            "Alta segurança intrínseca e tolerância mecânica",
            "Histórico comprovado em tração híbrida",
        ],
        limitations=[
            "Tensão de célula muito baixa (1.2 V, exige muitas células em série)",
            "Autodescarga moderada a alta",
            "Eficiência de ciclo inferior às de lítio (~78%)",
        ],
        typical_applications=[
            "Veículos híbridos convencionais (HEV)",
            "Equipamentos médicos portáteis",
            "Eletrônicos e brinquedos recarregáveis (substituição de pilhas AA)",
        ],
        reference="Ovshinsky et al. (Science 1993); Ashby Selection Guidelines",
    ),
}


@dataclass(frozen=True)
class ApplicationArchetype:
    slug: str
    name: str
    description: str
    target_voltage: float  # V
    target_energy_kwh: float  # kWh
    target_power_kw: float  # kW
    target_dod: float  # 0.0 - 1.0
    recommended_chemistries: list[str]
    default_cell_capacity_ah: float  # Ah per cell unit


APPLICATION_ARCHETYPES: dict[str, ApplicationArchetype] = {
    "ve_urbano": ApplicationArchetype(
        slug="ve_urbano",
        name="Veículo Elétrico Urbano (BEV)",
        description="Carro de passageiros elétrico para ciclo urbano e rodoviário moderado.",
        target_voltage=400.0,
        target_energy_kwh=48.0,
        target_power_kw=100.0,
        target_dod=0.85,
        recommended_chemistries=["lfp", "nmc_622", "sodio_ion"],
        default_cell_capacity_ah=50.0,
    ),
    "ve_performance": ApplicationArchetype(
        slug="ve_performance",
        name="Veículo Elétrico de Alta Performance",
        description="Veículo esportivo/sedan premium com arquitetura 800V e recarga ultra-rápida.",
        target_voltage=800.0,
        target_energy_kwh=90.0,
        target_power_kw=320.0,
        target_dod=0.90,
        recommended_chemistries=["nmc_811", "nca"],
        default_cell_capacity_ah=60.0,
    ),
    "drone_uav": ApplicationArchetype(
        slug="drone_uav",
        name="Drone / Aeronave Leve (eVTOL / UAV)",
        description="Aeronave não-tripulada onde a massa do pack é o fator restritivo supremo.",
        target_voltage=22.2,  # 6S padrão
        target_energy_kwh=1.2,
        target_power_kw=6.0,
        target_dod=0.80,
        recommended_chemistries=["nmc_811", "nca", "lco"],
        default_cell_capacity_ah=5.0,  # formato 21700
    ),
    "ferramenta_portatil": ApplicationArchetype(
        slug="ferramenta_portatil",
        name="Ferramenta Elétrica Portátil (Power Tool)",
        description="Ferramenta sem fio de alto torque e requisitos de descarga contínua elevada.",
        target_voltage=18.0,  # 5S padrão
        target_energy_kwh=0.09,  # 90 Wh
        target_power_kw=0.85,
        target_dod=0.80,
        recommended_chemistries=["nmc_622", "nca", "lfp"],
        default_cell_capacity_ah=5.0,
    ),
    "bess_residencial": ApplicationArchetype(
        slug="bess_residencial",
        name="Armazenamento Residencial (Solar BESS)",
        description="Sistema de bateria doméstica acoplado a painéis solares fotovoltaicos.",
        target_voltage=48.0,
        target_energy_kwh=10.0,
        target_power_kw=5.0,
        target_dod=0.80,
        recommended_chemistries=["lfp", "sodio_ion"],
        default_cell_capacity_ah=100.0,
    ),
    "bess_industrial": ApplicationArchetype(
        slug="bess_industrial",
        name="Armazenamento Industrial / Rede Elétrica",
        description="Contêiner BESS de suporte de frequência e deslocamento de pico (peak shaving).",
        target_voltage=800.0,
        target_energy_kwh=1000.0,  # 1 MWh
        target_power_kw=500.0,
        target_dod=0.80,
        recommended_chemistries=["lfp", "lto", "sodio_ion"],
        default_cell_capacity_ah=280.0,
    ),
}

#: Standard packaging factors (Ashby / EduPack Module S)
DEFAULT_MASS_PACKING_FACTOR = 0.70  # Cells represent 70% of total pack mass
DEFAULT_VOLUME_PACKING_FACTOR = 0.60  # Cells represent 60% of total pack volume
DEFAULT_COST_PACKING_FACTOR = 0.75  # Cells represent 75% of total pack cost


class BatteryDesignError(ValueError):
    """Raised when pack design inputs violate physical or mathematical limits."""


@dataclass(frozen=True)
class PackDesignResult:
    chemistry: BatteryChemistry
    # Electrical configuration
    series_cells_ns: int
    parallel_strings_np: int
    total_cells: int
    cell_capacity_ah: float
    cell_energy_wh: float
    cell_mass_kg: float
    cell_volume_l: float
    cell_peak_power_w: float
    # Pack level metrics
    nominal_voltage_v: float
    pack_capacity_ah: float
    gross_energy_kwh: float
    usable_energy_kwh: float
    peak_power_kw: float
    max_continuous_discharge_c_rate: float
    dod: float
    # Physical and packaging
    cells_mass_kg: float
    pack_mass_kg: float
    mass_overhead_kg: float
    mass_packing_factor: float
    cells_volume_l: float
    pack_volume_l: float
    volume_overhead_l: float
    volume_packing_factor: float
    pack_specific_energy_wh_kg: float
    pack_energy_density_wh_l: float
    # Financial and durability
    cell_cost_total_usd: float
    pack_cost_total_usd: float
    cost_overhead_usd: float
    cost_packing_factor: float
    cycle_life_at_dod: int
    levelized_cost_per_kwh_cycle: float
    thermal_safety: ThermalSafetyLevel
    thermal_guidelines: list[str]


@dataclass(frozen=True)
class ChemistryComparisonItem:
    chemistry_slug: str
    chemistry_name: str
    pack_mass_kg: float
    pack_volume_l: float
    pack_cost_usd: float
    cycle_life: int
    levelized_cost_per_kwh_cycle: float
    pack_specific_energy_wh_kg: float
    pack_energy_density_wh_l: float
    thermal_safety: ThermalSafetyLevel
    series_cells_ns: int
    parallel_strings_np: int
    total_cells: int
    usable_energy_kwh: float


@dataclass(frozen=True)
class BatteryComparisonResult:
    target_voltage: float
    target_energy_kwh: float
    target_power_kw: float
    dod: float
    items: list[ChemistryComparisonItem]
    lightest_slug: str
    most_compact_slug: str
    lowest_upfront_cost_slug: str
    most_durable_slug: str
    lowest_levelized_cost_slug: str
    safest_slug: str
    technical_summary: str


def design_pack(
    chemistry_slug: str,
    target_voltage_v: float,
    target_energy_kwh: float,
    target_power_kw: float,
    dod: float = 0.85,
    cell_capacity_ah: float | None = None,
    mass_packing_factor: float = DEFAULT_MASS_PACKING_FACTOR,
    volume_packing_factor: float = DEFAULT_VOLUME_PACKING_FACTOR,
    cost_packing_factor: float = DEFAULT_COST_PACKING_FACTOR,
) -> PackDesignResult:
    """Deterministically size a battery pack for given target electrical requirements."""
    chemistry = CHEMISTRIES.get(chemistry_slug)
    if chemistry is None:
        raise BatteryDesignError(f"Química de bateria não catalogada: {chemistry_slug}")

    # Validate numbers
    if (
        not math.isfinite(target_voltage_v)
        or not math.isfinite(target_energy_kwh)
        or not math.isfinite(target_power_kw)
    ):
        raise BatteryDesignError("Valores de projeto devem ser números finitos.")
    if target_voltage_v <= 0 or target_energy_kwh <= 0 or target_power_kw <= 0:
        raise BatteryDesignError("Tensão, energia e potência requeridas devem ser estritamente positivas.")

    if not (0.1 <= dod <= 1.0):
        raise BatteryDesignError("Profundidade de descarga (DoD) deve estar entre 0.10 (10%) e 1.0 (100%).")

    if not (0.2 <= mass_packing_factor <= 0.95):
        raise BatteryDesignError("Fator de empacotamento mássico deve estar entre 0.20 e 0.95.")
    if not (0.2 <= volume_packing_factor <= 0.95):
        raise BatteryDesignError("Fator de empacotamento volumétrico deve estar entre 0.20 e 0.95.")
    if not (0.2 <= cost_packing_factor <= 0.99):
        raise BatteryDesignError("Fator de empacotamento de custo deve estar entre 0.20 e 0.99.")

    # Determine cell unit capacity (Ah)
    if cell_capacity_ah is None or cell_capacity_ah <= 0:
        # Default based on application energy scale
        if target_energy_kwh <= 0.5:
            cell_capacity_ah = 5.0  # 21700 / small pouch
        elif target_energy_kwh <= 10.0:
            cell_capacity_ah = 20.0
        elif target_energy_kwh <= 100.0:
            cell_capacity_ah = 60.0  # EV standard prismatic
        else:
            cell_capacity_ah = 280.0  # Grid scale BESS prismatic

    if not math.isfinite(cell_capacity_ah) or cell_capacity_ah <= 0:
        raise BatteryDesignError("Capacidade unitária da célula deve ser positiva e finita.")

    # Cell physical properties
    v_cell = chemistry.nominal_voltage
    e_cell_wh = v_cell * cell_capacity_ah  # Wh per cell
    m_cell_kg = e_cell_wh / chemistry.specific_energy  # kg per cell
    vol_cell_l = e_cell_wh / chemistry.energy_density  # L per cell
    p_cell_peak_w = m_cell_kg * chemistry.specific_power  # W per cell

    # Sizing series cells (Ns)
    ns = max(1, math.ceil(target_voltage_v / v_cell))
    v_pack = ns * v_cell

    # Sizing parallel strings (Np) to satisfy energy and power
    # Required gross energy considering DoD
    gross_energy_target_kwh = target_energy_kwh / dod
    e_string_wh = ns * e_cell_wh
    np_energy = max(1, math.ceil((gross_energy_target_kwh * 1000.0) / e_string_wh))

    p_string_w = ns * p_cell_peak_w
    np_power = max(1, math.ceil((target_power_kw * 1000.0) / p_string_w))

    np = max(np_energy, np_power)
    total_cells = ns * np

    # Pack metrics
    pack_capacity_ah = np * cell_capacity_ah
    gross_energy_kwh = (total_cells * e_cell_wh) / 1000.0
    usable_energy_kwh = gross_energy_kwh * dod
    peak_power_kw = (total_cells * p_cell_peak_w) / 1000.0
    c_rate_peak = peak_power_kw / gross_energy_kwh if gross_energy_kwh > 0 else 0.0

    # Masses
    cells_mass_kg = total_cells * m_cell_kg
    pack_mass_kg = cells_mass_kg / mass_packing_factor
    mass_overhead_kg = pack_mass_kg - cells_mass_kg

    # Volumes
    cells_volume_l = total_cells * vol_cell_l
    pack_volume_l = cells_volume_l / volume_packing_factor
    volume_overhead_l = pack_volume_l - cells_volume_l

    # Pack densities
    pack_specific_energy = (gross_energy_kwh * 1000.0) / pack_mass_kg
    pack_energy_density = (gross_energy_kwh * 1000.0) / pack_volume_l

    # Financials
    cells_cost_usd = gross_energy_kwh * chemistry.cell_cost_per_kwh
    pack_cost_usd = cells_cost_usd / cost_packing_factor
    cost_overhead_usd = pack_cost_usd - cells_cost_usd

    # Levelized cost per delivered kWh over lifetime
    lifetime_delivered_kwh = chemistry.cycle_life * usable_energy_kwh
    levelized_cost = (
        pack_cost_usd / lifetime_delivered_kwh if lifetime_delivered_kwh > 0 else 0.0
    )

    # Thermal & safety guidelines
    thermal_guidelines = _derive_thermal_guidelines(chemistry, pack_mass_kg, peak_power_kw)

    return PackDesignResult(
        chemistry=chemistry,
        series_cells_ns=ns,
        parallel_strings_np=np,
        total_cells=total_cells,
        cell_capacity_ah=cell_capacity_ah,
        cell_energy_wh=e_cell_wh,
        cell_mass_kg=m_cell_kg,
        cell_volume_l=vol_cell_l,
        cell_peak_power_w=p_cell_peak_w,
        nominal_voltage_v=v_pack,
        pack_capacity_ah=pack_capacity_ah,
        gross_energy_kwh=gross_energy_kwh,
        usable_energy_kwh=usable_energy_kwh,
        peak_power_kw=peak_power_kw,
        max_continuous_discharge_c_rate=c_rate_peak,
        dod=dod,
        cells_mass_kg=cells_mass_kg,
        pack_mass_kg=pack_mass_kg,
        mass_overhead_kg=mass_overhead_kg,
        mass_packing_factor=mass_packing_factor,
        cells_volume_l=cells_volume_l,
        pack_volume_l=pack_volume_l,
        volume_overhead_l=volume_overhead_l,
        volume_packing_factor=volume_packing_factor,
        pack_specific_energy_wh_kg=pack_specific_energy,
        pack_energy_density_wh_l=pack_energy_density,
        cell_cost_total_usd=cells_cost_usd,
        pack_cost_total_usd=pack_cost_usd,
        cost_overhead_usd=cost_overhead_usd,
        cost_packing_factor=cost_packing_factor,
        cycle_life_at_dod=chemistry.cycle_life,
        levelized_cost_per_kwh_cycle=levelized_cost,
        thermal_safety=chemistry.thermal_safety,
        thermal_guidelines=thermal_guidelines,
    )


def compare_chemistries(
    target_voltage_v: float,
    target_energy_kwh: float,
    target_power_kw: float,
    dod: float = 0.85,
    cell_capacity_ah: float | None = None,
    mass_packing_factor: float = DEFAULT_MASS_PACKING_FACTOR,
    volume_packing_factor: float = DEFAULT_VOLUME_PACKING_FACTOR,
    cost_packing_factor: float = DEFAULT_COST_PACKING_FACTOR,
) -> BatteryComparisonResult:
    """Run sizing across all chemistries under identical requirements and analyze trade-offs."""
    items: list[ChemistryComparisonItem] = []

    for slug in CHEMISTRIES:
        res = design_pack(
            chemistry_slug=slug,
            target_voltage_v=target_voltage_v,
            target_energy_kwh=target_energy_kwh,
            target_power_kw=target_power_kw,
            dod=dod,
            cell_capacity_ah=cell_capacity_ah,
            mass_packing_factor=mass_packing_factor,
            volume_packing_factor=volume_packing_factor,
            cost_packing_factor=cost_packing_factor,
        )
        items.append(
            ChemistryComparisonItem(
                chemistry_slug=slug,
                chemistry_name=res.chemistry.name,
                pack_mass_kg=res.pack_mass_kg,
                pack_volume_l=res.pack_volume_l,
                pack_cost_usd=res.pack_cost_total_usd,
                cycle_life=res.cycle_life_at_dod,
                levelized_cost_per_kwh_cycle=res.levelized_cost_per_kwh_cycle,
                pack_specific_energy_wh_kg=res.pack_specific_energy_wh_kg,
                pack_energy_density_wh_l=res.pack_energy_density_wh_l,
                thermal_safety=res.thermal_safety,
                series_cells_ns=res.series_cells_ns,
                parallel_strings_np=res.parallel_strings_np,
                total_cells=res.total_cells,
                usable_energy_kwh=res.usable_energy_kwh,
            )
        )

    # Find dominant chemistries across facets
    lightest = min(items, key=lambda it: it.pack_mass_kg).chemistry_slug
    most_compact = min(items, key=lambda it: it.pack_volume_l).chemistry_slug
    lowest_upfront = min(items, key=lambda it: it.pack_cost_usd).chemistry_slug
    most_durable = max(items, key=lambda it: it.cycle_life).chemistry_slug
    lowest_levelized = min(items, key=lambda it: it.levelized_cost_per_kwh_cycle).chemistry_slug

    # Safest: pick highest ranking in safety scale
    safety_rank = {"MUITO_ALTA": 5, "ALTA": 4, "MEDIA": 3, "MODERADA": 2, "BAIXA": 1}
    safest = max(items, key=lambda it: safety_rank.get(it.thermal_safety, 0)).chemistry_slug

    summary = _generate_technical_summary(
        items=items,
        lightest=lightest,
        most_compact=most_compact,
        lowest_upfront=lowest_upfront,
        most_durable=most_durable,
        lowest_levelized=lowest_levelized,
        safest=safest,
    )

    return BatteryComparisonResult(
        target_voltage=target_voltage_v,
        target_energy_kwh=target_energy_kwh,
        target_power_kw=target_power_kw,
        dod=dod,
        items=items,
        lightest_slug=lightest,
        most_compact_slug=most_compact,
        lowest_upfront_cost_slug=lowest_upfront,
        most_durable_slug=most_durable,
        lowest_levelized_cost_slug=lowest_levelized,
        safest_slug=safest,
        technical_summary=summary,
    )


def _derive_thermal_guidelines(
    chem: BatteryChemistry,
    pack_mass_kg: float,
    peak_power_kw: float,
) -> list[str]:
    guidelines = []
    if chem.thermal_safety in ("BAIXA", "MODERADA"):
        guidelines.append(
            f"Fuga térmica iniciada em ~{chem.thermal_runaway_temp_c:.0f} °C: Exige resfriamento líquido ativo (BTMS) "
            "com placas de arrefecimento e material de interface térmica (TIM) entre módulos."
        )
        guidelines.append(
            "Barreiras físicas anti-propagação (aerogel de sílica ou folhas de mica) recomendadas entre células."
        )
    elif chem.thermal_safety == "MEDIA":
        guidelines.append(
            f"Química balanceada (~{chem.thermal_runaway_temp_c:.0f} °C de fuga térmica): Resfriamento a líquido recomendado "
            "para taxas de descarga acima de 1C ou climas tropicais; ar forçado aceitável em baixa taxa."
        )
    else:
        guidelines.append(
            f"Alta estabilidade térmica (~{chem.thermal_runaway_temp_c:.0f} °C de fuga térmica): Risco de incêndio catastrófico "
            "significativamente menor. Resfriamento a ar passivo/forçado suficiente para taxas moderadas."
        )

    if peak_power_kw > 100.0:
        guidelines.append(
            f"Potência de pico de {peak_power_kw:.0f} kW gerará calor Joule relevante (I²R): Sensor de temperatura "
            "por módulo e monitoramento no BMS indispensáveis."
        )

    guidelines.append(
        f"Faixa de temperatura de serviço recomendada: {chem.operating_temp_min_c:.0f} °C a {chem.operating_temp_max_c:.0f} °C."
    )
    return guidelines


def _generate_technical_summary(
    items: list[ChemistryComparisonItem],
    lightest: str,
    most_compact: str,
    lowest_upfront: str,
    most_durable: str,
    lowest_levelized: str,
    safest: str,
) -> str:
    by_slug = {it.chemistry_slug: it for it in items}
    lightest_item = by_slug[lightest]
    compact_item = by_slug[most_compact]
    cheapest_item = by_slug[lowest_upfront]
    durable_item = by_slug[most_durable]
    levelized_item = by_slug[lowest_levelized]

    return (
        f"Para os requisitos informados, o pack mais leve é obtido com {lightest_item.chemistry_name} "
        f"({lightest_item.pack_mass_kg:.1f} kg, {lightest_item.pack_specific_energy_wh_kg:.0f} Wh/kg no nível do pack), "
        f"enquanto o mais compacto é {compact_item.chemistry_name} ({compact_item.pack_volume_l:.1f} L). "
        f"Em termos de custo inicial de aquisição, {cheapest_item.chemistry_name} lidera com "
        f"US$ {cheapest_item.pack_cost_usd:,.2f}. No entanto, considerando a vida útil total, "
        f"{levelized_item.chemistry_name} atinge o menor custo nivelado por ciclo de energia "
        f"(US$ {levelized_item.levelized_cost_per_kwh_cycle:.4f}/(kWh·ciclo)) graças aos seus "
        f"{levelized_item.cycle_life} ciclos. Para aplicações de segurança crítica ou recarga ultra-pesada, "
        f"{by_slug[safest].chemistry_name} oferece a maior estabilidade térmica intrínseca."
    )
