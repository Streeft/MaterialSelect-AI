"""The extended property catalogue (D-188): 33 numeric definitions beyond the core 15.

Reference data, like the core list in ``app.db.seed.PROPERTIES``: only the
*definition* lives here (canonical unit, accepted units, reading unit,
direction). No value is written by this module; the demo catalogue fills the
demo materials through ``app.db.seed_demo_extended_props`` and nothing ever
writes on a real record.

Rules each spec keeps (tested in ``test_property_catalog_extended.py``):

* ``canonical_unit`` and every accepted unit parse in Pint and convert to the
  canonical one; the reading unit (``display_unit``) is one of the accepted
  ones (the D-70 rule).
* Quantities Pint flattens to a pure number are written ``dimensionless`` with
  the meaning in the name, as ``custo_massa`` and ``pegada_co2`` already are:
  money per litre and kilograms of CO₂ per kilogram have no Pint dimension.
* A temperature *difference* (thermal-shock resistance) is canonical in kelvin
  with no °C reading: read in °C, a ΔT of 100 K would print as −173 °C.
* Percentages are canonical in Pint's ``percent`` and read as ``%``.

The depth level of each slug (D-127) is declared in
``app.domain.depth_profile.PROPERTY_MIN_LEVEL``; the glossary entry in
``app/glossary/entries.json``.
"""

from __future__ import annotations

from app.models.enums import BetterDirection, PropertyCategory

_STRESS = "[mass] / [length] / [time] ** 2"
_TEMPERATURE = "[temperature]"
_PERCENT = ["percent", "%"]


def _stress(slug: str, name: str, symbol: str, *, display: str = "MPa") -> dict:
    return {
        "slug": slug,
        "name": name,
        "symbol": symbol,
        "category": PropertyCategory.MECANICA,
        "physical_dimension": _STRESS,
        "canonical_unit": "Pa",
        "accepted_units": ["Pa", "MPa", "GPa"],
        "display_unit": display,
        "is_interval": False,
        "better_direction": BetterDirection.HIGHER,
    }


def _temperature(slug: str, name: str, symbol: str, direction: BetterDirection) -> dict:
    return {
        "slug": slug,
        "name": name,
        "symbol": symbol,
        "category": PropertyCategory.TERMICA,
        "physical_dimension": _TEMPERATURE,
        "canonical_unit": "kelvin",
        "accepted_units": ["kelvin", "degC"],
        "display_unit": "degC",
        "is_interval": False,
        "better_direction": direction,
    }


EXTENDED_PROPERTIES: list[dict] = [
    # --- mechanical -----------------------------------------------------------
    {
        "slug": "tenacidade_fratura",
        "name": "Tenacidade à fratura",
        "symbol": "KIc",
        "category": PropertyCategory.MECANICA,
        "physical_dimension": "[mass] / [length] ** 0.5 / [time] ** 2",
        "canonical_unit": "Pa*m**0.5",
        "accepted_units": ["Pa*m**0.5", "MPa*m**0.5"],
        "display_unit": "MPa*m**0.5",
        "is_interval": False,
        "better_direction": BetterDirection.HIGHER,
    },
    {
        "slug": "tenacidade_gc",
        "name": "Tenacidade (energia de fratura)",
        "symbol": "Gc",
        "category": PropertyCategory.MECANICA,
        "physical_dimension": "[mass] / [time] ** 2",
        "canonical_unit": "J/m**2",
        "accepted_units": ["J/m**2", "kJ/m**2"],
        "display_unit": "kJ/m**2",
        "is_interval": False,
        "better_direction": BetterDirection.HIGHER,
    },
    {
        "slug": "alongamento",
        "name": "Alongamento na ruptura",
        "symbol": "A",
        "category": PropertyCategory.MECANICA,
        "physical_dimension": "",
        "canonical_unit": "percent",
        "accepted_units": _PERCENT,
        "display_unit": "%",
        "is_interval": False,
        "better_direction": BetterDirection.HIGHER,
    },
    _stress("resistencia_fadiga", "Resistência à fadiga (10⁷ ciclos)", "σe"),
    _stress("resistencia_compressao", "Resistência à compressão", "σc"),
    _stress("resistencia_flexao", "Resistência à flexão", "σf"),
    _stress("resistencia_cisalhamento", "Resistência ao cisalhamento", "τu"),
    _stress("modulo_cisalhamento", "Módulo de cisalhamento", "G", display="GPa"),
    _stress("modulo_volumetrico", "Módulo volumétrico", "K", display="GPa"),
    _stress("modulo_flexao", "Módulo de flexão", "Ef", display="GPa"),
    {
        "slug": "resistencia_impacto",
        "name": "Resistência ao impacto (Charpy entalhado)",
        "symbol": "acN",
        "category": PropertyCategory.MECANICA,
        "physical_dimension": "[mass] / [time] ** 2",
        "canonical_unit": "J/m**2",
        "accepted_units": ["J/m**2", "kJ/m**2"],
        "display_unit": "kJ/m**2",
        "is_interval": False,
        "better_direction": BetterDirection.HIGHER,
    },
    {
        "slug": "coef_perda_mecanica",
        "name": "Coeficiente de perda (amortecimento)",
        "symbol": "η",
        "category": PropertyCategory.MECANICA,
        "physical_dimension": "",
        "canonical_unit": "dimensionless",
        "accepted_units": ["dimensionless"],
        "is_interval": False,
        "better_direction": BetterDirection.NEUTRAL,
    },
    {
        "slug": "dureza_shore_a",
        "name": "Dureza Shore A",
        "symbol": "ShA",
        "category": PropertyCategory.MECANICA,
        "physical_dimension": "",
        "canonical_unit": "dimensionless",
        "accepted_units": ["dimensionless"],
        "is_interval": False,
        "better_direction": BetterDirection.NEUTRAL,
        "allows_log_scale": False,
    },
    {
        "slug": "dureza_shore_d",
        "name": "Dureza Shore D",
        "symbol": "ShD",
        "category": PropertyCategory.MECANICA,
        "physical_dimension": "",
        "canonical_unit": "dimensionless",
        "accepted_units": ["dimensionless"],
        "is_interval": False,
        "better_direction": BetterDirection.NEUTRAL,
        "allows_log_scale": False,
    },
    # --- thermal --------------------------------------------------------------
    _temperature("temp_fusao", "Temperatura de fusão", "Tm", BetterDirection.HIGHER),
    _temperature(
        "temp_transicao_vitrea", "Temperatura de transição vítrea", "Tg", BetterDirection.NEUTRAL
    ),
    _temperature(
        "temp_min_servico", "Temperatura mínima de serviço", "Tmin", BetterDirection.LOWER
    ),
    _temperature(
        "temp_deflexao_termica",
        "Temperatura de deflexão térmica (0,45 MPa)",
        "HDT",
        BetterDirection.HIGHER,
    ),
    {
        "slug": "difusividade_termica",
        "name": "Difusividade térmica",
        "symbol": "a",
        "category": PropertyCategory.TERMICA,
        "physical_dimension": "[length] ** 2 / [time]",
        "canonical_unit": "m**2/s",
        "accepted_units": ["m**2/s", "mm**2/s"],
        "display_unit": "mm**2/s",
        "is_interval": False,
        "better_direction": BetterDirection.NEUTRAL,
    },
    {
        "slug": "resistencia_choque_termico",
        "name": "Resistência ao choque térmico (ΔT)",
        "symbol": "ΔTc",
        "category": PropertyCategory.TERMICA,
        # A difference of temperatures: kelvin, never read in °C (module note).
        "physical_dimension": _TEMPERATURE,
        "canonical_unit": "kelvin",
        "accepted_units": ["kelvin", "delta_degC"],
        "is_interval": False,
        "better_direction": BetterDirection.HIGHER,
    },
    # --- electrical -----------------------------------------------------------
    {
        "slug": "resistividade_eletrica",
        "name": "Resistividade elétrica",
        "symbol": "ρe",
        "category": PropertyCategory.ELETRICA,
        "physical_dimension": "[mass] * [length] ** 3 / [time] ** 3 / [current] ** 2",
        "canonical_unit": "ohm*m",
        "accepted_units": ["ohm*m", "microohm*cm", "ohm*cm"],
        "is_interval": False,
        "better_direction": BetterDirection.NEUTRAL,
    },
    {
        "slug": "condutividade_eletrica",
        "name": "Condutividade elétrica",
        "symbol": "σe",
        "category": PropertyCategory.ELETRICA,
        "physical_dimension": "[current] ** 2 * [time] ** 3 / [mass] / [length] ** 3",
        "canonical_unit": "S/m",
        "accepted_units": ["S/m", "MS/m"],
        "is_interval": False,
        "better_direction": BetterDirection.NEUTRAL,
    },
    {
        "slug": "constante_dieletrica",
        "name": "Constante dielétrica (permissividade relativa)",
        "symbol": "εr",
        "category": PropertyCategory.ELETRICA,
        "physical_dimension": "",
        "canonical_unit": "dimensionless",
        "accepted_units": ["dimensionless"],
        "is_interval": False,
        "better_direction": BetterDirection.NEUTRAL,
    },
    {
        "slug": "rigidez_dieletrica",
        "name": "Rigidez dielétrica",
        "symbol": "Ed",
        "category": PropertyCategory.ELETRICA,
        "physical_dimension": "[mass] * [length] / [time] ** 3 / [current]",
        "canonical_unit": "V/m",
        "accepted_units": ["V/m", "MV/m", "kV/mm"],
        "display_unit": "MV/m",
        "is_interval": False,
        "better_direction": BetterDirection.HIGHER,
    },
    {
        "slug": "fator_perda_dieletrica",
        "name": "Fator de perda dielétrica (tan δ)",
        "symbol": "tanδ",
        "category": PropertyCategory.ELETRICA,
        "physical_dimension": "",
        "canonical_unit": "dimensionless",
        "accepted_units": ["dimensionless"],
        "is_interval": False,
        "better_direction": BetterDirection.LOWER,
    },
    # --- optical and physical ---------------------------------------------------
    {
        "slug": "indice_refracao",
        "name": "Índice de refração",
        "symbol": "n",
        "category": PropertyCategory.FISICA,
        "physical_dimension": "",
        "canonical_unit": "dimensionless",
        "accepted_units": ["dimensionless"],
        "is_interval": False,
        "better_direction": BetterDirection.NEUTRAL,
        "allows_log_scale": False,
    },
    {
        "slug": "absorcao_agua",
        "name": "Absorção de água (24 h, em massa)",
        "symbol": "Wa",
        "category": PropertyCategory.FISICA,
        "physical_dimension": "",
        "canonical_unit": "percent",
        "accepted_units": _PERCENT,
        "display_unit": "%",
        "is_interval": False,
        "better_direction": BetterDirection.LOWER,
        # Dense metals, glasses and ceramics absorb nothing: a real zero.
        "allows_log_scale": False,
    },
    {
        "slug": "indice_oxigenio_limite",
        "name": "Índice de oxigênio limite (LOI)",
        "symbol": "LOI",
        "category": PropertyCategory.AMBIENTAL,
        "physical_dimension": "",
        "canonical_unit": "percent",
        "accepted_units": _PERCENT,
        "display_unit": "%",
        "is_interval": False,
        "better_direction": BetterDirection.HIGHER,
    },
    # --- economic and eco -------------------------------------------------------
    {
        "slug": "custo_volume",
        "name": "Custo por volume (por litro)",
        "symbol": "Cv",
        "category": PropertyCategory.ECONOMICA,
        # Same currency as custo_massa, per litre; dimensionless like it.
        "physical_dimension": "",
        "canonical_unit": "dimensionless",
        "accepted_units": ["dimensionless"],
        "is_interval": False,
        "better_direction": BetterDirection.LOWER,
    },
    {
        "slug": "pegada_hidrica",
        "name": "Pegada hídrica (produção primária)",
        "symbol": "Wm",
        "category": PropertyCategory.AMBIENTAL,
        "physical_dimension": "[length] ** 3 / [mass]",
        "canonical_unit": "m**3/kg",
        "accepted_units": ["m**3/kg", "L/kg"],
        "display_unit": "L/kg",
        "is_interval": False,
        "better_direction": BetterDirection.LOWER,
    },
    {
        "slug": "fracao_reciclada",
        "name": "Fração reciclada na oferta atual",
        "symbol": "Rf",
        "category": PropertyCategory.AMBIENTAL,
        "physical_dimension": "",
        "canonical_unit": "percent",
        "accepted_units": _PERCENT,
        "display_unit": "%",
        "is_interval": False,
        "better_direction": BetterDirection.HIGHER,
    },
    {
        "slug": "energia_processamento",
        "name": "Energia de processamento primário",
        "symbol": "Hp",
        "category": PropertyCategory.AMBIENTAL,
        "physical_dimension": "[length] ** 2 / [time] ** 2",
        "canonical_unit": "MJ/kg",
        "accepted_units": ["MJ/kg", "kJ/kg"],
        "is_interval": False,
        "better_direction": BetterDirection.LOWER,
    },
    {
        "slug": "co2_processamento",
        "name": "Pegada de CO₂ do processamento primário",
        "symbol": "CO₂p",
        "category": PropertyCategory.AMBIENTAL,
        "physical_dimension": "",  # kg de CO₂ por kg de material, como pegada_co2
        "canonical_unit": "dimensionless",
        "accepted_units": ["dimensionless"],
        "is_interval": False,
        "better_direction": BetterDirection.LOWER,
    },
]

#: The slugs above, in catalogue order.
EXTENDED_SLUGS: tuple[str, ...] = tuple(spec["slug"] for spec in EXTENDED_PROPERTIES)
