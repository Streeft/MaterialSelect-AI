"""The enlarged demo catalogue: nine JSON lots, 593 fictitious materials (D-184).

Data, not a seed of its own. ``app.db.seed_extended`` — the module the
``semear_demo`` action of ``admin-banco.yml`` runs after ``app.db.seed`` —
loads these lots into ``TCC_DEMO_MATERIALS`` and writes them through the same
writer as its 70 materials (``seed_demo_catalog_expansion``). There is no
``__main__`` here on purpose (docs/15): a module nothing runs is the D-71
defect.

Every material the lots describe is written ``is_demo=True`` against the single
demo source (``Dataset Demo MaterialSelect``), every value ``ESTIMADO``, and
``clear_demo`` removes all of it by that mark. The numbers are orders of
magnitude from open textbook/LCA literature, reviewed lot by lot (the QA report
the D-184 summarises); nothing is copied from a commercial database, and the
designations are all ``DEMO-…``/``Demo…`` so no row claims to *be* a real grade.

What lives here is pure (no session, no SQL):

* :func:`read_lot_files` reads the JSON as written;
* :func:`validate_lot` / :func:`validate_lots` apply the QA rules — structure,
  units accepted by the property and converted through
  ``app.calculations.units`` (via ``app.domain.data_quality``), absence written
  as absence and never zero, yield ≤ tensile, the per-family bands of the QA
  (specific stiffness, Poisson, expansion, CO₂ per MJ, brittle yield ratio,
  service temperature ceilings), the designation and composition grammar of
  D-107 and name/code uniqueness — and return every violation as text;
* :func:`load_lots` reads, validates (raising :class:`DemoCatalogError` on any
  violation, never skipping in silence) and returns seed specs ready for
  ``seed_extended_materials``.
"""

from __future__ import annotations

import json
import math
import unicodedata
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, replace
from pathlib import Path

from app.calculations.units import to_canonical
from app.db.demo_identity_data import (
    DemoIdentityDataError,
    parse_composition,
    parse_designation,
)
from app.db.seed import PROPERTIES
from app.domain.composition import build_composition_entry, validate_composition
from app.domain.data_quality import build_interval_value, build_scalar_value
from app.models.enums import DataQuality, DesignationSystem

#: Where the lots live; ``pyproject.toml`` ships ``db/demo_catalog/*.json``.
LOT_DIR = Path(__file__).resolve().parent
LOT_GLOB = "L*.json"

#: slug -> (canonical unit, accepted units), straight from the seed's definitions.
UNITS: dict[str, tuple[str, frozenset[str]]] = {
    spec["slug"]: (spec["canonical_unit"], frozenset(spec["accepted_units"])) for spec in PROPERTIES
}
#: The three a lot may write absent, with a note (HV that does not apply,
#: recycling route not established). Every other one feeds a screen.
OPTIONAL_SLUGS = frozenset({"dureza", "energia_reciclagem", "co2_reciclagem"})
ESSENTIAL_SLUGS = frozenset(UNITS) - OPTIONAL_SLUGS
CLASS_SLUGS = frozenset({"metais", "polimeros", "ceramicas", "compositos", "elastomeros"})
CURVE_SHAPES = frozenset({"ductile", "brittle", "elastomer", "cmc"})
LOT_KEYS = frozenset({"lote", "versao", "materiais"})
MATERIAL_KEYS = frozenset(
    {
        "name",
        "class_slug",
        "subclass",
        "description",
        "keywords",
        "designations",
        "composition",
        "values",
        "curve_hint",
    }
)
VALUE_KEYS = frozenset(
    {
        "slug",
        "kind",
        "value",
        "min",
        "max",
        "typical",
        "unit",
        "quality",
        "uncertainty",
        "measurement_condition",
        "notes",
    }
)
MAX_SIGNIFICANT_DIGITS = 4


class DemoCatalogError(ValueError):
    """The lots break a rule; the message lists every violation found."""


def normalize_name(text: str) -> str:
    """Case- and accent-insensitive key used for every uniqueness check."""
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    return "".join(c for c in decomposed if not unicodedata.combining(c)).strip()


def _significant_digits(number: float) -> int:
    mantissa = f"{number:.12g}".lower().split("e")[0]
    digits = mantissa.replace("-", "").replace(".", "").lstrip("0")
    if "." not in mantissa:
        digits = digits.rstrip("0")
    return len(digits) or 1


def _kelvin(celsius: float) -> float:
    return to_canonical(celsius, "degC", "kelvin")[0]


# --- per-family rules of the QA ---------------------------------------------------


@dataclass(frozen=True)
class FamilyRule:
    """Bands a family must respect, all in canonical units.

    ``specific_stiffness`` is E/ρ in J/kg (1e6 = 1 MN·m/kg); ``expansion`` in
    1/K; ``co2_per_mj`` is CO₂ footprint over embodied energy (kg/MJ);
    ``yield_ratio`` is σy/σu for the families where yield is taken near
    fracture (brittle) or below it (wood, CMC); ``tmax_k`` the service
    temperature ceiling; ``max_youngs_pa`` a hard ceiling on E.
    """

    specific_stiffness: tuple[float, float]
    poisson: tuple[float, float]
    expansion: tuple[float, float]
    co2_per_mj: tuple[float, float]
    yield_ratio: tuple[float, float] | None = None
    tmax_k: float | None = None
    max_youngs_pa: float | None = None
    shapes: frozenset[str] = CURVE_SHAPES


_MN = 1e6  # J/kg in one MN·m/kg
_MICRO = 1e-6  # 1/K in one 1e-6/K

#: By class. The QA's real-value policy (open literature over the spec's
#: didactic bands) is why some bands are wide: refractory and precious metals,
#: diamond, cork and lead alloys are real outliers of their class.
_CLASS_RULES: dict[str, FamilyRule] = {
    "metais": FamilyRule(
        specific_stiffness=(1 * _MN, 35 * _MN),
        poisson=(0.25, 0.44),
        expansion=(4 * _MICRO, 30 * _MICRO),
        co2_per_mj=(0.04, 0.1),
        shapes=frozenset({"ductile", "brittle"}),
    ),
    "polimeros": FamilyRule(
        specific_stiffness=(0.1 * _MN, 8 * _MN),
        poisson=(0.10, 0.46),
        expansion=(20 * _MICRO, 220 * _MICRO),
        # Polyolefins and PVC sit at ~0.02–0.035: feedstock energy stays in the polymer.
        co2_per_mj=(0.02, 0.1),
        shapes=frozenset({"ductile", "brittle"}),
    ),
    "elastomeros": FamilyRule(
        specific_stiffness=(0.0005 * _MN, 0.1 * _MN),
        poisson=(0.46, 0.4995),
        expansion=(100 * _MICRO, 300 * _MICRO),
        co2_per_mj=(0.04, 0.1),
        max_youngs_pa=0.2e9,
        shapes=frozenset({"elastomer"}),
    ),
    "ceramicas": FamilyRule(
        specific_stiffness=(3 * _MN, 320 * _MN),
        poisson=(0.07, 0.31),
        expansion=(0.1 * _MICRO, 12 * _MICRO),
        # Cement calcination and CVD electricity push the ratio above 0.1.
        co2_per_mj=(0.04, 0.17),
        yield_ratio=(0.9, 1.0),
        shapes=frozenset({"brittle", "cmc"}),
    ),
    "compositos": FamilyRule(
        specific_stiffness=(0.1 * _MN, 150 * _MN),
        # Woven 0/90 laminates have an in-plane ν12 of ~0.05–0.1.
        poisson=(0.04, 0.42),
        # α of UD carbon is ~0 or negative along the fibre; stored small and
        # positive (log scale) with the sign in the note. Cork reaches ~160.
        expansion=(0.1 * _MICRO, 200 * _MICRO),
        co2_per_mj=(0.03, 0.17),
        shapes=frozenset({"ductile", "brittle", "cmc"}),
    ),
}

#: By subclass, overriding the class fields it names.
_SUBCLASS_OVERRIDES: dict[str, dict] = {
    # Metals: E/ρ by family (steels 23–28 as the spec; non-ferrous by the QA).
    "Aços Carbono": {"specific_stiffness": (23 * _MN, 28 * _MN), "poisson": (0.27, 0.30)},
    "Aços Baixa Liga": {"specific_stiffness": (23 * _MN, 28 * _MN), "poisson": (0.27, 0.30)},
    "Aços Ferramenta e Rápidos": {
        "specific_stiffness": (23 * _MN, 28 * _MN),
        "poisson": (0.27, 0.30),
    },
    "Aços Inoxidáveis Austeníticos": {"specific_stiffness": (23 * _MN, 28 * _MN)},
    "Aços Inoxidáveis Ferríticos": {"specific_stiffness": (23 * _MN, 28 * _MN)},
    "Aços Inoxidáveis Martensíticos": {"specific_stiffness": (23 * _MN, 28 * _MN)},
    "Aços Inoxidáveis Duplex": {"specific_stiffness": (23 * _MN, 28 * _MN)},
    "Aços Inoxidáveis Endurecíveis por Precipitação": {"specific_stiffness": (23 * _MN, 28 * _MN)},
    "Ferros Fundidos": {"specific_stiffness": (11 * _MN, 25 * _MN)},
    "Ligas de Alumínio Trabalháveis": {
        "specific_stiffness": (23 * _MN, 28 * _MN),
        "tmax_k": _kelvin(250.0),
    },
    "Ligas de Alumínio de Fundição": {
        "specific_stiffness": (23 * _MN, 28 * _MN),
        "tmax_k": _kelvin(250.0),
    },
    "Ligas de Magnésio": {"specific_stiffness": (22 * _MN, 28 * _MN), "tmax_k": _kelvin(250.0)},
    "Ligas de Titânio": {"specific_stiffness": (20 * _MN, 28 * _MN)},
    "Ligas de Cobre": {"specific_stiffness": (10 * _MN, 17 * _MN)},
    "Ligas de Zinco": {"specific_stiffness": (11 * _MN, 16 * _MN)},
    "Ligas de Chumbo e Estanho": {"specific_stiffness": (1 * _MN, 8 * _MN)},
    "Ligas de Níquel": {"specific_stiffness": (19 * _MN, 28 * _MN)},
    "Superligas": {"specific_stiffness": (19 * _MN, 28 * _MN)},
    "Ligas de Cobalto": {"specific_stiffness": (19 * _MN, 28 * _MN)},
    # Polymers.
    "Termoplásticos": {"tmax_k": _kelvin(120.0)},
    "Termofixos": {"yield_ratio": (0.8, 1.0)},
    # Ceramics: zirconias sit at E/ρ ≈ 35 (real), below the spec's 40.
    "Cerâmicas Técnicas": {"specific_stiffness": (30 * _MN, 220 * _MN)},
    # Composites.
    "Compósitos de Fibra de Carbono": {
        "specific_stiffness": (30 * _MN, 150 * _MN),
        "expansion": (0.05 * _MICRO, 4 * _MICRO),
        "yield_ratio": (0.8, 1.0),
    },
    "Compósitos de Fibra de Vidro": {"yield_ratio": (0.8, 1.0)},
    "Compósitos de Aramida, Basalto e Híbridos": {"yield_ratio": (0.8, 1.0)},
    "Compósitos Verdes": {"yield_ratio": (0.8, 1.0)},
    "Compósitos de Matriz Cerâmica": {"yield_ratio": (0.5, 0.8)},
    "Compósitos Metal-Cerâmica": {"yield_ratio": (0.9, 1.0)},
    "Concretos e Argamassas": {"yield_ratio": (0.9, 1.0), "co2_per_mj": (0.05, 0.17)},
    "Madeiras Maciças": {"yield_ratio": (0.3, 0.7)},
    "Derivados de Madeira": {"yield_ratio": (0.4, 0.8)},
    "Compósitos Naturais": {"yield_ratio": (0.3, 0.7)},
}

#: Every subclass the lots use must have a rule decided for it (class default or
#: override): a new family is a decision, not something that slips through.
_KNOWN_SUBCLASSES: dict[str, frozenset[str]] = {
    "metais": frozenset(
        {
            "Aços Carbono",
            "Aços Baixa Liga",
            "Aços Ferramenta e Rápidos",
            "Aços Inoxidáveis Austeníticos",
            "Aços Inoxidáveis Ferríticos",
            "Aços Inoxidáveis Martensíticos",
            "Aços Inoxidáveis Duplex",
            "Aços Inoxidáveis Endurecíveis por Precipitação",
            "Ferros Fundidos",
            "Ligas de Alumínio Trabalháveis",
            "Ligas de Alumínio de Fundição",
            "Ligas de Magnésio",
            "Ligas de Titânio",
            "Ligas de Cobre",
            "Ligas de Zinco",
            "Ligas de Chumbo e Estanho",
            "Ligas de Níquel",
            "Superligas",
            "Ligas de Cobalto",
            "Metais Puros",
            "Metais Refratários",
            "Metais Preciosos",
            "Espumas Metálicas",
        }
    ),
    "polimeros": frozenset(
        {
            "Termoplásticos",
            "Termoplásticos de Engenharia",
            "Termoplásticos Reforçados",
            "Termoplásticos de Alta Performance",
            "Termofixos",
            "Espumas Poliméricas",
            "Biopolímeros",
        }
    ),
    "elastomeros": frozenset(
        {
            "Borrachas Naturais",
            "Borrachas Sintéticas",
            "Elastômeros Especiais",
            "Elastômeros Termoplásticos",
        }
    ),
    "ceramicas": frozenset(
        {
            "Cerâmicas Técnicas",
            "Cerâmicas Especiais",
            "Cerâmicas Tradicionais",
            "Cerâmicas Refratárias",
            "Cerâmicas de Construção",
            "Carbonos e Grafites",
            "Vidros",
            "Vitrocerâmicas",
            "Espumas Cerâmicas",
            "Pedras Naturais",
        }
    ),
    "compositos": frozenset(
        {
            "Compósitos de Fibra de Carbono",
            "Compósitos de Fibra de Vidro",
            "Compósitos de Aramida, Basalto e Híbridos",
            "Compósitos Verdes",
            "Compósitos Naturais",
            "Compósitos de Matriz Metálica",
            "Compósitos de Matriz Cerâmica",
            "Compósitos Metal-Cerâmica",
            "Concretos e Argamassas",
            "Madeiras Maciças",
            "Derivados de Madeira",
        }
    ),
}


def family_rule(class_slug: str, subclass: str) -> FamilyRule:
    """The rule a material of this class and subclass must respect."""
    rule = _CLASS_RULES[class_slug]
    override = _SUBCLASS_OVERRIDES.get(subclass)
    return replace(rule, **override) if override else rule


# --- validation -------------------------------------------------------------------


def _is_gray_iron(material: Mapping) -> bool:
    """The one spec exception: grey cast iron has no yield plateau (σy absent)."""
    hint = material.get("curve_hint") or {}
    return (
        material.get("subclass") == "Ferros Fundidos"
        and "cinzento" in normalize_name(str(material.get("name", "")))
        and hint.get("shape") == "brittle"
    )


def _check_number(errors: list[str], where: str, number: object) -> bool:
    if isinstance(number, bool) or not isinstance(number, int | float):
        errors.append(f"{where}: não é número ({number!r})")
        return False
    if not math.isfinite(number) or number <= 0:
        errors.append(f"{where}: valor não positivo ({number!r}); ausência se escreve missing")
        return False
    if _significant_digits(number) > MAX_SIGNIFICANT_DIGITS:
        errors.append(f"{where}: mais de {MAX_SIGNIFICANT_DIGITS} algarismos ({number!r})")
    return True


def _check_value(
    errors: list[str], tag: str, value: Mapping, gray_iron: bool
) -> tuple[float | None, float | None]:
    """Validate one value spec; return its canonical (representative, upper) numbers."""
    slug = value.get("slug")
    where = f"{tag} [{slug}]"
    extra = set(value) - VALUE_KEYS
    if extra:
        errors.append(f"{where}: chaves desconhecidas {sorted(extra)}")
    if value.get("quality") not in (None, DataQuality.ESTIMADO.value, DataQuality.ESTIMADO):
        errors.append(f"{where}: qualidade {value.get('quality')!r} (só ESTIMADO)")
    kind = value.get("kind")
    if kind == "missing":
        if slug in ESSENTIAL_SLUGS and not (gray_iron and slug == "limite_escoamento"):
            errors.append(f"{where}: propriedade essencial não pode ser ausente")
        if not value.get("notes"):
            errors.append(f"{where}: ausente sem nota do motivo")
        if any(key in value for key in ("value", "min", "max", "typical", "unit")):
            errors.append(f"{where}: ausente não leva número nem unidade")
        return None, None

    canonical, accepted = UNITS[slug]
    unit = value.get("unit")
    if unit not in accepted:
        errors.append(f"{where}: unidade {unit!r} fora de {sorted(accepted)}")
        return None, None
    try:
        if kind == "scalar":
            if any(key in value for key in ("min", "max", "typical")):
                errors.append(f"{where}: escalar com min/max/typical")
            if not _check_number(errors, f"{where}.value", value.get("value")):
                return None, None
            built = build_scalar_value(value["value"], unit, canonical)
            return built.normalized_value, built.normalized_value
        if kind == "interval":
            if slug != "limite_escoamento":
                errors.append(f"{where}: intervalo só em limite_escoamento")
            if "value" in value:
                errors.append(f"{where}: intervalo com value")
            numbers = [key for key in ("min", "max", "typical") if key in value]
            if not {"min", "max"} <= set(numbers):
                errors.append(f"{where}: intervalo sem min/max")
                return None, None
            if not all(_check_number(errors, f"{where}.{key}", value[key]) for key in numbers):
                return None, None
            built = build_interval_value(
                value["min"], value["max"], unit, canonical, value_typical=value.get("typical")
            )
            return built.normalized_value, built.normalized_max
    except ValueError as exc:  # inverted interval, typical outside, unit error
        errors.append(f"{where}: {exc}")
        return None, None
    errors.append(f"{where}: kind {kind!r} desconhecido")
    return None, None


def _in(band: tuple[float, float], number: float) -> bool:
    low, high = band
    return low * (1 - 1e-9) <= number <= high * (1 + 1e-9)


def validate_material(material: Mapping, *, lot: str = "?") -> list[str]:
    """Every rule one material breaks, as text (empty list = valid)."""
    errors: list[str] = []
    name = material.get("name")
    tag = f"{lot} {name!r}"
    keys = set(material)
    if not keys <= MATERIAL_KEYS or not (MATERIAL_KEYS - {"curve_hint"}) <= keys:
        errors.append(f"{tag}: chaves {sorted(keys ^ MATERIAL_KEYS)}")
        return errors
    if not isinstance(name, str) or not name.strip() or len(name) > 200:
        errors.append(f"{tag}: nome inválido")
    class_slug = material["class_slug"]
    subclass = material["subclass"]
    if class_slug not in CLASS_SLUGS:
        errors.append(f"{tag}: classe {class_slug!r} não existe (não se cria MaterialClass)")
        return errors
    if subclass not in _KNOWN_SUBCLASSES[class_slug]:
        errors.append(f"{tag}: subclasse {subclass!r} sem regra de família em {class_slug}")
        return errors
    if "demo" not in material["keywords"]:
        errors.append(f"{tag}: keywords sem 'demo'")

    designations = material["designations"]
    if not 1 <= len(designations) <= 3:
        errors.append(f"{tag}: {len(designations)} designações (1 a 3)")
    for raw in designations:
        try:
            parsed = parse_designation(raw)
        except DemoIdentityDataError as exc:
            errors.append(f"{tag}: {exc}")
            continue
        prefix = "Demo" if parsed["system"] is DesignationSystem.COMERCIAL else "DEMO-"
        if not parsed["code"].startswith(prefix):
            errors.append(f"{tag}: designação {raw!r} não começa com {prefix!r}")

    try:
        entries = [
            build_composition_entry(
                spec["element"],
                value_min=spec.get("min"),
                value_max=spec.get("max"),
                value_nominal=spec.get("nominal"),
                unit=spec.get("unit"),
                is_balance=spec.get("balance", False),
                is_missing=spec.get("missing", False),
            )
            for spec in parse_composition(material["composition"])
        ]
        validate_composition(entries)
        if not entries or all(entry.is_missing for entry in entries):
            errors.append(f"{tag}: composição sem nenhum elemento informado")
    except ValueError as exc:
        errors.append(f"{tag}: composição — {exc}")

    hint = material.get("curve_hint")
    rule = family_rule(class_slug, subclass)
    if hint is not None:
        shape = hint.get("shape")
        if shape not in rule.shapes:
            errors.append(f"{tag}: curve_hint {shape!r} não cabe em {class_slug}")
        if "softening" in hint and not (shape == "brittle" and 0.02 <= hint["softening"] <= 0.30):
            errors.append(f"{tag}: softening {hint['softening']!r} (frágil, 0,02–0,30)")
        if "break_strain" in hint and not (
            shape == "elastomer" and 2.0 <= hint["break_strain"] <= 6.0
        ):
            errors.append(f"{tag}: break_strain {hint['break_strain']!r} (elastômero, 2–6)")
    elif class_slug in ("ceramicas", "elastomeros"):
        errors.append(f"{tag}: {class_slug} exige curve_hint")

    slugs = [value.get("slug") for value in material["values"]]
    if sorted(slugs, key=str) != sorted(UNITS):
        errors.append(f"{tag}: precisa de uma linha por propriedade; tem {sorted(slugs, key=str)}")
        return errors

    gray_iron = _is_gray_iron(material)
    canon: dict[str, float] = {}
    upper: dict[str, float] = {}
    for value in material["values"]:
        representative, high = _check_value(errors, tag, value, gray_iron)
        if representative is not None and high is not None:
            canon[value["slug"]] = representative
            upper[value["slug"]] = high
    if errors:
        return errors

    # Physical coherence (spec §5.5), in canonical units.
    tensile = canon["resistencia_tracao"]
    if "limite_escoamento" in canon:
        if (
            upper["limite_escoamento"] > tensile * (1 + 1e-9)
            or canon["limite_escoamento"] > tensile
        ):
            errors.append(f"{tag}: escoamento acima da resistência à tração")
        if rule.yield_ratio and not _in(rule.yield_ratio, canon["limite_escoamento"] / tensile):
            errors.append(
                f"{tag}: σy/σu {canon['limite_escoamento'] / tensile:.2f} fora de "
                f"{rule.yield_ratio} para {subclass}"
            )
    if (
        "energia_reciclagem" in canon
        and canon["energia_reciclagem"] >= canon["energia_incorporada"]
    ):
        errors.append(f"{tag}: energia de reciclagem não é menor que a incorporada")
    if "co2_reciclagem" in canon and canon["co2_reciclagem"] >= canon["pegada_co2"]:
        errors.append(f"{tag}: CO₂ da reciclagem não é menor que a pegada")
    if not 0 < canon["coef_poisson"] < 0.5:
        errors.append(f"{tag}: Poisson fora de (0; 0,5)")
    if canon["temp_max_servico"] <= _kelvin(25.0):
        errors.append(f"{tag}: temperatura máxima de serviço não passa da ambiente")

    checks = (
        ("E/ρ", rule.specific_stiffness, canon["modulo_young"] / canon["densidade"]),
        ("Poisson", rule.poisson, canon["coef_poisson"]),
        ("expansão térmica", rule.expansion, canon["coef_expansao_termica"]),
        ("CO₂/energia", rule.co2_per_mj, canon["pegada_co2"] / canon["energia_incorporada"]),
    )
    for label, band, number in checks:
        if not _in(band, number):
            errors.append(f"{tag}: {label} {number:.4g} fora de {band} para {subclass}")
    if rule.tmax_k is not None and canon["temp_max_servico"] > rule.tmax_k * (1 + 1e-9):
        errors.append(f"{tag}: temperatura máxima acima do teto de {subclass}")
    if rule.max_youngs_pa is not None and canon["modulo_young"] >= rule.max_youngs_pa:
        errors.append(f"{tag}: módulo acima do teto de {class_slug}")
    return errors


def _codes(material: Mapping) -> list[str]:
    codes = []
    for raw in material.get("designations", ()):
        code = raw.partition(":")[2].partition("@")[0]
        codes.append(normalize_name(code))
    return codes


def validate_lot(
    lot: Mapping,
    *,
    reserved_names: Iterable[str] = (),
    reserved_codes: Iterable[str] = (),
    _seen_names: dict[str, str] | None = None,
    _seen_codes: dict[str, str] | None = None,
) -> list[str]:
    """Every rule one lot breaks, as text (empty list = valid).

    ``reserved_names`` / ``reserved_codes`` are names and designation codes the
    lot may not reuse (the rest of the demo catalogue); comparison ignores case
    and accents.
    """
    errors: list[str] = []
    lot_id = str(lot.get("lote", "?"))
    if set(lot) != LOT_KEYS:
        errors.append(f"{lot_id}: chaves de topo {sorted(set(lot) ^ LOT_KEYS)}")
        return errors
    if not isinstance(lot["versao"], int) or isinstance(lot["versao"], bool):
        errors.append(f"{lot_id}: versao não é inteiro")
    materials = lot["materiais"]
    if not isinstance(materials, list) or not materials:
        errors.append(f"{lot_id}: lote sem materiais")
        return errors
    names_taken = {normalize_name(name) for name in reserved_names}
    codes_taken = {normalize_name(code) for code in reserved_codes}
    seen_names = {} if _seen_names is None else _seen_names
    seen_codes = {} if _seen_codes is None else _seen_codes
    for material in materials:
        errors.extend(validate_material(material, lot=lot_id))
        name = str(material.get("name", ""))
        key = normalize_name(name)
        if key in names_taken:
            errors.append(f"{lot_id} {name!r}: nome já usado pelo catálogo demo")
        if key in seen_names:
            errors.append(f"{lot_id} {name!r}: nome repetido ({seen_names[key]})")
        seen_names.setdefault(key, f"{lot_id} {name!r}")
        for code in _codes(material):
            if code in codes_taken:
                errors.append(f"{lot_id} {name!r}: designação {code!r} já usada pelo demo")
            if code in seen_codes:
                errors.append(
                    f"{lot_id} {name!r}: designação {code!r} repetida ({seen_codes[code]})"
                )
            seen_codes.setdefault(code, f"{lot_id} {name!r}")
    return errors


def _canonical_of(material: Mapping, slug: str) -> float | None:
    for value in material["values"]:
        if value["slug"] != slug or value["kind"] == "missing":
            continue
        canonical = UNITS[slug][0]
        number = value.get("typical", value.get("value"))
        if number is None:
            number = (value["min"] + value["max"]) / 2
        return to_canonical(number, value["unit"], canonical)[0]
    return None


def _cross_family_errors(materials: Sequence[Mapping]) -> list[str]:
    """The QA's coherence between families (only where both sides are present)."""

    def values(predicate, slug: str) -> list[float]:
        found = [_canonical_of(m, slug) for m in materials if predicate(m)]
        return [x for x in found if x is not None]

    def sub(m: Mapping) -> str:
        return normalize_name(m["subclass"])

    steel = values(lambda m: m["class_slug"] == "metais" and sub(m).startswith("acos"), "densidade")
    aluminium = values(lambda m: "aluminio" in sub(m), "densidade")
    magnesium = values(lambda m: "magnesio" in sub(m), "densidade")
    titanium = values(lambda m: "titanio" in sub(m), "densidade")
    polymer_e = values(
        lambda m: m["class_slug"] == "polimeros" and "reforc" not in sub(m), "modulo_young"
    )
    metal_e = values(
        lambda m: m["class_slug"] == "metais" and "espuma" not in sub(m), "modulo_young"
    )
    pure_copper_k = values(lambda m: str(m["name"]).startswith("Cobre "), "condutividade_termica")
    stainless_k = values(
        lambda m: m["class_slug"] == "metais" and sub(m).startswith("acos inox"),
        "condutividade_termica",
    )
    checks = [
        ("ρ do magnésio < ρ do alumínio", magnesium, aluminium),
        ("ρ do alumínio < ρ do titânio", aluminium, titanium),
        ("ρ do titânio < ρ do aço", titanium, steel),
        ("E dos polímeros não reforçados < E dos metais maciços", polymer_e, metal_e),
        ("k dos inoxidáveis < k do cobre puro", stainless_k, pure_copper_k),
    ]
    return [
        f"coerência entre famílias: {label}"
        for label, low, high in checks
        if low and high and not max(low) < min(high)
    ]


def validate_lots(
    lots: Sequence[Mapping],
    *,
    reserved_names: Iterable[str] = (),
    reserved_codes: Iterable[str] = (),
) -> list[str]:
    """:func:`validate_lot` over every lot, plus uniqueness and coherence across lots."""
    reserved_names = list(reserved_names)
    reserved_codes = list(reserved_codes)
    seen_names: dict[str, str] = {}
    seen_codes: dict[str, str] = {}
    lot_ids: set[str] = set()
    errors: list[str] = []
    for lot in lots:
        lot_id = str(lot.get("lote", "?"))
        if lot_id in lot_ids:
            errors.append(f"{lot_id}: lote repetido")
        lot_ids.add(lot_id)
        errors.extend(
            validate_lot(
                lot,
                reserved_names=reserved_names,
                reserved_codes=reserved_codes,
                _seen_names=seen_names,
                _seen_codes=seen_codes,
            )
        )
    if not errors:
        errors.extend(_cross_family_errors([m for lot in lots for m in lot["materiais"]]))
    return errors


# --- loading ----------------------------------------------------------------------


def read_lot_files(directory: Path = LOT_DIR) -> list[dict]:
    """The lots as written, in file order (L01 … L09)."""
    paths = sorted(directory.glob(LOT_GLOB))
    return [json.loads(path.read_text(encoding="utf-8")) for path in paths]


def to_seed_spec(material: Mapping) -> dict:
    """One lot material as the dict ``seed_extended_materials`` writes."""
    values = []
    for value in material["values"]:
        spec = {key: item for key, item in value.items() if key != "quality"}
        spec["quality"] = DataQuality.ESTIMADO
        values.append(spec)
    return {
        "name": material["name"],
        "class_slug": material["class_slug"],
        "subclass": material["subclass"],
        "description": material["description"],
        "keywords": list(material["keywords"]),
        "designations": list(material["designations"]),
        "composition": material["composition"],
        "curve_hint": dict(material.get("curve_hint") or {}),
        "values": values,
    }


def load_lots(
    directory: Path = LOT_DIR,
    *,
    reserved_names: Iterable[str] = (),
    reserved_codes: Iterable[str] = (),
) -> list[dict]:
    """Read and validate every lot; return the seed specs, or raise on any violation.

    Fails loud, never skips: a material the rules refuse stops the whole load,
    so the log of ``semear_demo`` can never report a partial catalogue as done.
    """
    lots = read_lot_files(directory)
    if not lots:
        raise DemoCatalogError(f"Nenhum lote {LOT_GLOB} em {directory}")
    errors = validate_lots(lots, reserved_names=reserved_names, reserved_codes=reserved_codes)
    if errors:
        shown = "\n".join(errors[:30])
        more = f"\n… e mais {len(errors) - 30}" if len(errors) > 30 else ""
        raise DemoCatalogError(f"Catálogo demo ampliado inválido ({len(errors)}):\n{shown}{more}")
    return [to_seed_spec(material) for lot in lots for material in lot["materiais"]]
