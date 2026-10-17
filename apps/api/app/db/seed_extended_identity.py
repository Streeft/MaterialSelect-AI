"""Designations, compositions and curves for every demo material (D-105, D-106, D-107).

The 75 demo materials (5 in ``app.db.seed`` + 70 in ``app.db.seed_extended``) all
get at least one designation and one composition entry, and all 3 engineering curves
(stress–strain, temperature and fatigue S–N), so the author can open every screen with
everything filled in. It is fictitious and marked, as docs/15 requires: every
row is written ``is_demo=True`` against the demo source, and ``clear_demo``
removes it by that mark.

This is *not* a parallel module (D-71): ``python -m app.db.seed_extended`` — the
command ``semear_demo`` runs after ``app.db.seed`` — calls
:func:`seed_extended_identity`. It lives apart from ``seed_extended.py`` only to
keep that file about materials; the baseline ``app.db.seed`` that every test
re-runs is left alone, so no fixed count in the suite moves.

How the curves are made. They are **derived from the material's own fictitious
properties**, read from the database at seed time — Young's modulus, yield and
tensile strength (their canonical values, in Pa), and the maximum service
temperature — instead of being typed as loose numbers. The generator only
decides the *shape* by class (ductile metal with 0.2 % offset yield and necking;
ductile or brittle polymer; brittle ceramic and composite; hyperelastic
elastomer). Units go through ``app.calculations.units`` (Pint) and the curves
through ``build_curve``/``curve_rows`` like every other curve. Where the
fictitious scalars contradict each other (the extended generator draws them
independently, so a yield above the tensile strength happens) the curve says in
its description which premise it took; where a property is absent the curve
either states the premise or adopts a deterministic fallback.

The demo catalogue has zero known gaps (:data:`DEMO_KNOWN_GAPS`); the coverage
report (``python -m app.db.demo_coverage``) prints 100% complete across all 75 materials.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.calculations.units import to_canonical
from app.db.demo_identity_data import composition_table, designation_table
from app.db.seed import (
    DEMO_DESIGNATIONS,
    DEMO_SOURCE_LABEL,
    _seed_demo_curves,
    _seed_demo_identity,
)
from app.models.enums import CurveKind
from app.models.material import Material
from app.models.material_curve import MaterialCurve
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition
from app.models.source import Source

#: Materials that have no curve of a kind, and the reason — written, not silent
#: (D-24). All 75 demo materials are 100% covered, leaving zero known gaps.
DEMO_KNOWN_GAPS: dict[str, dict[str, str]] = {}

AMBIENT_C = 20.0

_STRAIN_LABEL = "Deformação de engenharia"
_STRESS_LABEL = "Tensão de engenharia"
_CITATION_NOTE = "Derivada das propriedades cadastradas do próprio material."


@dataclass(frozen=True)
class Inputs:
    """The canonical (SI) fictitious properties a curve is anchored on."""

    youngs_pa: float | None
    yield_pa: float | None
    tensile_pa: float | None
    tmax_k: float | None


#: Shape by material name where the class default would be wrong. ``c`` is the
#: softening of a near-linear brittle curve: sigma(s) = su (s (1 + c) - c s^2).
_BRITTLE_C: dict[str, float] = {
    "Ferro Fundido Cinzento FC250": 0.30,
    "Concreto Armado Padrão": 0.25,
    "Madeira Compensada (Pinho)": 0.20,
    "Compósito Linho / Resina Bio": 0.15,
    "Cermet (WC-Co)": 0.06,
    "Compósito Aramida (Kevlar) / Epóxi": 0.06,
    "Vidro Borossilicato": 0.005,
    "Vidro Soda-Cal": 0.005,
    "Poliestireno (PS)": 0.08,
    "Poli(metacrilato de metila) (PMMA)": 0.06,
    "Resina Epóxi Padrão": 0.06,
    "Resina Fenólica": 0.08,
    "Poliéster Insaturado": 0.08,
}
_BRITTLE_DEFAULT_C: dict[str, float] = {"ceramicas": 0.02, "compositos": 0.03}
_CMC = "Compósito Matriz Cerâmica (SiC/SiC)"
_DUCTILE_COMPOSITE = "Compósito de Boro / Alumínio"
#: Strain at break of the elastomer curves (dimensionless, 4.5 = 450 %).
_ELASTOMER_BREAK: dict[str, float] = {
    "Borracha Natural (NR)": 5.5,
    "Silicone (VMQ)": 3.5,
    "Neoprene (CR)": 4.5,
    "Borracha Nitrílica (NBR)": 4.0,
    "EPDM": 4.0,
    "Poliuretano Termoplástico (TPU)": 5.5,
    "Fluorelastômero (FKM)": 2.5,
    "Borracha Estireno-Butadieno (SBR)": 4.5,
}
_ELASTOMER_BREAK_DEFAULT = 4.0

#: Fatigue strength as a fraction of tensile strength at 10^3 ... 10^8 cycles —
#: the shape of the baseline aluminium S–N curve, applied to all materials.
_FATIGUE_N = (1e3, 1e4, 1e5, 1e6, 1e7, 1e8)
_FATIGUE_FRACTION = (0.84, 0.66, 0.52, 0.40, 0.32, 0.29)
_FATIGUE_BAND = 0.08


def _sig(value: float, digits: int = 4) -> float:
    return float(f"{value:.{digits}g}")


def _to(value: float, source_unit: str, target_unit: str) -> float:
    return to_canonical(value, source_unit, target_unit)[0]


def _pct(strain: float) -> float:
    """A dimensionless strain in percent, through Pint (never a literal factor)."""
    return _sig(_to(strain, "dimensionless", "percent"))


def _mpa(stress_pa: float) -> float:
    return _sig(_to(stress_pa, "Pa", "MPa"))


def _gpa(modulus_pa: float) -> float:
    return _sig(_to(modulus_pa, "Pa", "GPa"))


def _fmt(value: float, digits: int = 3) -> str:
    return f"{value:.{digits}g}".replace(".", ",")


# --- shapes --------------------------------------------------------------------
#
# Each returns ``[(strain, stress_pa), ...]``: strain dimensionless, strictly
# increasing; stress in Pa. Conversion to the stored units happens once, in
# ``_points``.


def _ductile_shape(youngs: float, yield_: float, tensile: float, uniform: float) -> list:
    """Elastic line, 0.2 % offset yield, hardening to ``tensile``, necking, fracture."""
    elastic = yield_ / youngs
    yield_strain = elastic + 0.002
    uniform = max(uniform, yield_strain + 0.02)
    points = [(0.0, 0.0), (0.8 * elastic, 0.8 * yield_), (yield_strain, yield_)]
    for s in (0.1, 0.3, 0.6, 1.0):
        points.append(
            (
                yield_strain + s * (uniform - yield_strain),
                yield_ + (tensile - yield_) * (1 - (1 - s) ** 2),
            )
        )
    points.append((uniform * 1.15, 0.97 * tensile))
    points.append((uniform * 1.35, 0.85 * tensile))
    return points


def _uniform_strain(yield_: float, tensile: float) -> float:
    """Uniform elongation of the fictitious ductile curve: more hardening, more strain."""
    return 0.04 + 0.30 * (1 - yield_ / tensile)


def _brittle_shape(youngs: float, strength: float, softening: float) -> list:
    """Near-linear to fracture; the initial slope is exactly ``youngs``."""
    fracture = (1 + softening) * strength / youngs
    return [
        (s * fracture, strength * (s * (1 + softening) - softening * s * s))
        for s in (0.0, 0.2, 0.4, 0.6, 0.8, 1.0)
    ]


def _polymer_ductile_shape(youngs: float, yield_: float, break_stress: float) -> list:
    """Yield peak, drop to a drawing plateau, hardening to break."""
    yield_strain = yield_ / youngs
    plateau = 0.84 * yield_
    draw_start = max(0.25, 6 * yield_strain)
    break_strain = max(1.0, draw_start + 0.5)
    return [
        (0.0, 0.0),
        (0.5 * yield_strain, 0.55 * yield_),
        (yield_strain, yield_),
        (1.5 * yield_strain, 0.93 * yield_),
        (3 * yield_strain, 0.86 * yield_),
        (draw_start, plateau),
        ((draw_start + break_strain) / 2, (plateau + break_stress) / 2),
        (break_strain, break_stress),
    ]


def _elastomer_shape(youngs: float, tensile: float, break_strain: float) -> list:
    """Initial slope ``youngs``, softening, then the upturn to break."""
    first_stress = min(0.10 * youngs, 0.2 * tensile)
    first_strain = first_stress / youngs
    points = [(0.0, 0.0), (first_strain, first_stress)]
    for fraction, share in ((0.2, 0.30), (0.4, 0.40), (0.6, 0.52), (0.8, 0.70), (1.0, 1.0)):
        points.append((fraction * break_strain, share * tensile))
    return points


def _cmc_shape(youngs: float, matrix_cracking: float, tensile: float) -> list:
    """Linear to matrix cracking, then a pseudo-ductile rise to failure."""
    crack_strain = matrix_cracking / youngs
    points = [
        (0.0, 0.0),
        (0.5 * crack_strain, 0.5 * matrix_cracking),
        (crack_strain, matrix_cracking),
    ]
    for s in (0.25, 0.5, 0.75, 1.0):
        points.append(
            (
                crack_strain * (1 + 2 * s),
                matrix_cracking + (tensile - matrix_cracking) * (1 - (1 - s) ** 2),
            )
        )
    return points


def _points(shape: list) -> list[tuple[float, float]]:
    return [(_pct(strain), _mpa(stress)) for strain, stress in shape]


# --- reading the material --------------------------------------------------------


def _inputs(db: Session, material_id: int) -> Inputs:
    wanted = {
        "modulo_young": "youngs",
        "limite_escoamento": "yield",
        "resistencia_tracao": "tensile",
        "temp_max_servico": "tmax",
    }
    found: dict[str, float | None] = {key: None for key in wanted.values()}
    rows = db.execute(
        select(PropertyDefinition.slug, MaterialPropertyValue.normalized_value)
        .join(MaterialPropertyValue, MaterialPropertyValue.property_id == PropertyDefinition.id)
        .where(
            MaterialPropertyValue.material_id == material_id,
            PropertyDefinition.slug.in_(list(wanted)),
            MaterialPropertyValue.is_missing.is_(False),
            MaterialPropertyValue.normalized_value.is_not(None),
        )
    )
    for slug, value in rows:
        found[wanted[slug]] = float(value)
    return Inputs(found["youngs"], found["yield"], found["tensile"], found["tmax"])


def _round_to_5(value: float) -> float:
    return round(value / 5) * 5.0


def _description(base: str, notes: list[str]) -> str:
    return " ".join([base, *notes, _CITATION_NOTE])


def _stress_strain_spec(name: str, class_slug: str, inp: Inputs) -> dict | None:
    """The tensile curve (or family) for one material, or ``None`` if it cannot exist."""
    youngs = inp.youngs_pa if inp.youngs_pa is not None else 10e9
    anchor = (
        f"Ancorada no módulo ({_fmt(_gpa(youngs))} GPa)"
        + (f", no escoamento ({_fmt(_mpa(inp.yield_pa))} MPa)" if inp.yield_pa else "")
        + (f" e na resistência ({_fmt(_mpa(inp.tensile_pa))} MPa)" if inp.tensile_pa else "")
        + " cadastrados neste material."
    )
    notes: list[str] = []
    family_unit = ("temperatura", "degC")
    series: list[dict]
    parameter = None

    if class_slug == "elastomeros":
        tensile = inp.tensile_pa
        if tensile is None:
            tensile = 25e6
            notes.append(
                "A resistência à tração está ausente no cadastro; a resistência "
                "(25 MPa) é premissa da própria curva."
            )
        break_strain = _ELASTOMER_BREAK.get(name, _ELASTOMER_BREAK_DEFAULT)
        notes.append(
            "O escoamento cadastrado não entra: elastômero não tem patamar de escoamento; "
            "o módulo é a inclinação inicial e a resistência, o pico na ruptura."
        )
        series = [
            {
                "conditions": "Tração uniaxial; temperatura ambiente.",
                "points": _points(_elastomer_shape(youngs, tensile, break_strain)),
            }
        ]
    elif class_slug == "metais" or name == _DUCTILE_COMPOSITE:
        if name in _BRITTLE_C:
            return _brittle_spec(name, inp, anchor, _BRITTLE_C[name])
        yield_eff = inp.yield_pa
        if yield_eff is None:
            yield_eff = 200e6
            notes.append(
                "O limite de escoamento está ausente no cadastro deste material; a tensão de "
                "escoamento (200 MPa) é premissa da própria curva."
            )
        tensile = inp.tensile_pa
        if tensile is None:
            tensile = 1.2 * yield_eff
            notes.append(
                "A resistência à tração está ausente no cadastro deste material; o pico da "
                "curva (1,2 × o escoamento) é premissa da própria curva, não "
                "propriedade do material."
            )
        if yield_eff > 0.9 * tensile:
            yield_eff = 0.9 * tensile
            notes.append(
                f"O escoamento cadastrado ({_fmt(_mpa(inp.yield_pa))} MPa) não é menor que a "
                "resistência; a curva escoa em 0,9 × a resistência."
            )
        tmax_c = _to(inp.tmax_k, "K", "degC") if inp.tmax_k is not None else None
        if tmax_c is None or tmax_c <= AMBIENT_C + 100:
            notes.append(
                "A temperatura máxima de serviço está ausente (ou é baixa demais para uma "
                "família): só a curva à temperatura ambiente."
            )
            series = [
                {
                    "conditions": "Tração uniaxial; temperatura ambiente.",
                    "points": _points(
                        _ductile_shape(
                            youngs, yield_eff, tensile, _uniform_strain(yield_eff, tensile)
                        )
                    ),
                }
            ]
        else:
            parameter = family_unit
            temperatures = [
                AMBIENT_C,
                _round_to_5(AMBIENT_C + 0.5 * (tmax_c - AMBIENT_C)),
                _round_to_5(tmax_c),
            ]
            notes.append(
                "A família varre da temperatura ambiente até a temperatura máxima de serviço "
                "cadastrada; módulo e resistências caem com a temperatura (premissa da curva)."
            )
            series = []
            for temperature in temperatures:
                theta = (temperature - AMBIENT_C) / (tmax_c - AMBIENT_C)
                e_t = youngs * (1 - 0.25 * theta)
                y_t = yield_eff * (1 - 0.45 * theta)
                u_t = tensile * (1 - 0.40 * theta)
                series.append(
                    {
                        "parameter": temperature,
                        "conditions": (
                            "Tração uniaxial; forno."
                            if temperature > AMBIENT_C
                            else "Tração uniaxial; temperatura ambiente."
                        ),
                        "points": _points(
                            _ductile_shape(
                                e_t, y_t, u_t, _uniform_strain(y_t, u_t) * (1 + 0.5 * theta)
                            )
                        ),
                    }
                )
    elif class_slug == "polimeros":
        if name in _BRITTLE_C:
            return _brittle_spec(name, inp, anchor, _BRITTLE_C[name])
        yield_val = inp.yield_pa
        if yield_val is None:
            yield_val = 30e6
            notes.append(
                "O limite de escoamento está ausente no cadastro; o valor de 30 MPa é premissa "
                "da própria curva."
            )
        break_stress = inp.tensile_pa
        if break_stress is None:
            break_stress = 1.15 * yield_val
            notes.append(
                "A resistência à tração está ausente no cadastro; a tensão de ruptura "
                "(1,15 × o escoamento) é premissa da própria curva."
            )
        elif break_stress < yield_val:
            notes.append(
                "A resistência cadastrada é menor que o escoamento: a curva termina nela, "
                "abaixo do patamar de estiramento."
            )
        series = [
            {
                "conditions": "Tração uniaxial; temperatura ambiente.",
                "points": _points(_polymer_ductile_shape(youngs, yield_val, break_stress)),
            }
        ]
    elif name == _CMC:
        tensile = inp.tensile_pa
        if tensile is None:
            tensile = 300e6
            notes.append(
                "A resistência à tração está ausente no cadastro; a tensão de 300 MPa é premissa "
                "da curva."
            )
        if inp.yield_pa is not None and inp.yield_pa < tensile:
            matrix = inp.yield_pa
            notes.append(
                "O limite de escoamento cadastrado é lido como tensão de fissuração da matriz "
                "(comportamento pseudo-dúctil)."
            )
            series = [
                {
                    "conditions": "Tração uniaxial; temperatura ambiente.",
                    "points": _points(_cmc_shape(youngs, matrix, tensile)),
                }
            ]
        else:
            return _brittle_spec(name, inp, anchor, 0.03)
    else:
        softening = _BRITTLE_C.get(name, _BRITTLE_DEFAULT_C.get(class_slug, 0.03))
        return _brittle_spec(name, inp, anchor, softening)

    return {
        "material": name,
        "kind": CurveKind.TENSAO_DEFORMACAO,
        "title": "Tensão–deformação de engenharia (fictícia)",
        "description": _description(
            "Curva de tração. " + anchor,
            notes,
        ),
        "x": ("deformacao", _STRAIN_LABEL, "%"),
        "y": ("tensao", _STRESS_LABEL, "MPa"),
        "parameter": parameter,
        "series": series,
    }


def _brittle_spec(name: str, inp: Inputs, anchor: str, softening: float) -> dict | None:
    youngs = inp.youngs_pa if inp.youngs_pa is not None else 100e9
    strength = inp.tensile_pa
    notes = [
        "Ruptura frágil: a curva é quase linear até a resistência à tração cadastrada, sem "
        "escoamento."
    ]
    if strength is None:
        strength = inp.yield_pa
        if strength is None:
            strength = 350e6
            notes.append(
                "A resistência à tração e o limite de escoamento estão ausentes no cadastro; "
                "a resistência de ruptura de 350 MPa é premissa da própria curva."
            )
        else:
            notes.append(
                "A resistência à tração está ausente; o limite de escoamento cadastrado faz as "
                "vezes de resistência de ruptura (premissa da própria curva)."
            )
    elif inp.yield_pa is not None:
        notes.append("O escoamento cadastrado não entra: o material rompe antes de escoar.")
    return {
        "material": name,
        "kind": CurveKind.TENSAO_DEFORMACAO,
        "title": "Tensão–deformação de engenharia (fictícia)",
        "description": _description(
            "Curva de tração. " + anchor,
            notes,
        ),
        "x": ("deformacao", _STRAIN_LABEL, "%"),
        "y": ("tensao", _STRESS_LABEL, "MPa"),
        "parameter": None,
        "series": [
            {
                "conditions": "Tração uniaxial; temperatura ambiente.",
                "points": _points(_brittle_shape(youngs, strength, softening)),
            }
        ],
    }


def _modulus_temperature_spec(name: str, inp: Inputs) -> dict | None:
    youngs = inp.youngs_pa if inp.youngs_pa is not None else 10e9
    notes: list[str] = []
    if inp.youngs_pa is None:
        notes.append("O módulo de elasticidade está ausente; 10 GPa assumido como premissa.")
    if inp.tmax_k is not None:
        tmax_c = _to(inp.tmax_k, "K", "degC")
    else:
        tmax_c = 300.0
        notes.append("A temperatura máxima de serviço está ausente; 300 °C assumido.")
    top = max(_round_to_5(tmax_c), AMBIENT_C + 30.0)
    points = []
    for step in range(6):
        temperature = AMBIENT_C + step * (top - AMBIENT_C) / 5.0
        theta = step / 5.0
        points.append((round(temperature, 1), _gpa(youngs * (1 - 0.25 * theta))))
    return {
        "material": name,
        "kind": CurveKind.TEMPERATURA,
        "title": "Módulo de elasticidade × temperatura (fictícia)",
        "description": _description(
            "Curva da queda do módulo com a temperatura, da ambiente à máxima de "
            f"serviço cadastrada; parte do módulo cadastrado ({_fmt(_gpa(youngs))} GPa) "
            "e perde 25 % ao chegar nela.",
            notes,
        ),
        "x": ("temperatura", "Temperatura", "degC"),
        "y": ("modulo", "Módulo de elasticidade", "GPa"),
        "parameter": None,
        "series": [{"conditions": "Módulo dinâmico.", "points": points}],
    }


def _fatigue_spec(name: str, inp: Inputs) -> dict | None:
    tensile = inp.tensile_pa
    notes: list[str] = []
    if tensile is None:
        if inp.yield_pa is not None:
            tensile = 1.2 * inp.yield_pa
            notes.append(
                "A resistência à tração está ausente no cadastro; a curva parte de 1,2 × o "
                "escoamento (premissa da própria curva)."
            )
        else:
            tensile = 350e6
            notes.append(
                "A resistência à tração e o limite de escoamento estão ausentes no cadastro; "
                "a resistência de 350 MPa é premissa da própria curva."
            )
    points = []
    for cycles, fraction in zip(_FATIGUE_N, _FATIGUE_FRACTION, strict=True):
        stress = _mpa(tensile * fraction)
        points.append(
            (
                cycles,
                stress,
                _sig(stress * (1 - _FATIGUE_BAND)),
                _sig(stress * (1 + _FATIGUE_BAND)),
            )
        )
    return {
        "material": name,
        "kind": CurveKind.FADIGA,
        "title": "Curva S–N com faixa de dispersão (fictícia)",
        "description": _description(
            "Curva de fadiga com faixa mín.–máx. declarada. Parte da resistência à "
            f"tração ({_fmt(_mpa(tensile))} MPa) e cai com o número de ciclos.",
            notes,
        ),
        "x": ("ciclos", "Número de ciclos até a falha, N", "dimensionless"),
        "y": ("tensao", "Amplitude de tensão", "MPa"),
        "parameter": ("razao_tensao", "dimensionless"),
        "series": [
            {
                "parameter": -1,
                "conditions": "Flexão rotativa, R = −1; corpos de prova polidos.",
                "points": points,
            }
        ],
    }


def build_curve_specs(db: Session) -> list[dict]:
    """Every curve the demo catalogue should have and does not yet, as seed specs.

    Reads each demo material's own fictitious properties. A material that already
    has a curve of a kind (the baseline ones from ``app.db.seed``) gets no second
    one of that kind, so the baseline curves stay the baseline's.
    """
    catalog_names = set(designation_table()) | set(DEMO_DESIGNATIONS)
    existing: dict[int, set[CurveKind]] = {}
    for material_id, kind in db.execute(select(MaterialCurve.material_id, MaterialCurve.kind)):
        existing.setdefault(material_id, set()).add(kind)

    specs: list[dict] = []
    materials = (
        db.execute(
            select(Material)
            .where(Material.name.in_(catalog_names), Material.is_demo.is_(True))
            .order_by(Material.id)
        )
        .scalars()
        .all()
    )
    for material in materials:
        have = existing.get(material.id, set())
        inp = _inputs(db, material.id)
        class_slug = material.material_class.slug
        candidates = [
            _stress_strain_spec(material.name, class_slug, inp),
            _modulus_temperature_spec(material.name, inp),
            _fatigue_spec(material.name, inp),
        ]
        for spec in candidates:
            if spec is not None and spec["kind"] not in have:
                specs.append(spec)
    return specs


def seed_extended_identity(db: Session, source: Source | None = None) -> dict[str, int]:
    """Give every demo material its designations, composition and curves. Idempotent.

    Returns the counts the ``semear_demo`` log prints: ``designations_created``,
    ``composition_entries_created`` and ``curves_created``.
    """
    if source is None:
        source = db.execute(select(Source).where(Source.label == DEMO_SOURCE_LABEL)).scalar_one()
    identity = _seed_demo_identity(
        db,
        source,
        designations_by_material=designation_table(),
        compositions_by_material=composition_table(),
    )
    curves = _seed_demo_curves(db, source, build_curve_specs(db))
    return {**identity, "curves_created": curves}
