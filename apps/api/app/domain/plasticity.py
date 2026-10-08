"""From a declared stress–strain series to a plastic hardening table (D-119, TM5-b).

A solver's plastic card (``*PLASTIC``, ``TB,PLAS``/MISO, ``MATS1``,
``*MAT_PIECEWISE_LINEAR_PLASTICITY``) does not read a tensile curve as a source
publishes it: it reads **true stress against plastic strain**, starting at the
yield point with plastic strain zero. Getting there takes three choices, and
each one is made here, once, deterministically, and stated in the file the user
receives:

1. **Which measure the series is in.** Declared by the curve
   (``strain_measure``); never presumed. Engineering (nominal) values become
   true ones by ``σ_t = σ(1 + ε)`` and ``ε_t = ln(1 + ε)``, which hold only
   while the strain is uniform — up to the maximum engineering stress, where
   necking starts. Points after the first maximum are dropped and counted:
   converting them would print a true stress the specimen never carried.
2. **Which E separates elastic from plastic strain.** ``ε_p = ε_t − σ_t/E``,
   with E of the **same material at the temperature of the series**, read by
   the caller from an exact point (:func:`match_temperature`) — never
   interpolated. The same E is written in the card's elastic field, so the
   elastic line and the plastic table cannot disagree.
3. **Where the plastic table starts.** Points on the elastic line
   (``ε_p`` within :data:`YIELD_TOLERANCE` of the point's elastic strain) are
   elastic; the **last** of them, right before the first clearly plastic
   point, is the elastic limit and is anchored at ``ε_p = 0`` with its own
   stress. A series whose first point is already plastic, or whose last
   elastic point lies left of the elastic line (a curve stiffer than E), does
   not start at the elastic limit — and the yield point is never invented, so
   the table is refused. After the yield, a point with ``ε_p < 0`` is dropped
   and counted; plastic strain that does not grow is refused, never reordered.

Everything is canonical (strain dimensionless, stress in Pa): unit conversion
into the user's system happens in ``app.exporters.cae`` through
``app.calculations.units``, never here.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

#: A point is on the elastic line when ``|ε_p| <= YIELD_TOLERANCE · σ_t/E``:
#: within 5 % of its own elastic strain. It absorbs the rounding of a published
#: table (a strain printed as 0.13 % for 0.125 %) and the gap between the E of
#: the catalogue and the slope of the specimen, and nothing else. Larger would
#: let a point already hardening be anchored as yield; zero would refuse every
#: real curve. Argument, not data: changing it is a reviewed code change.
YIELD_TOLERANCE = 0.05

#: Two temperatures are "the same point" when they differ by less than this, in
#: kelvin: the residue of a unit conversion (68 °F is 293.15000000000003 K),
#: not a neighbourhood. Nothing is interpolated between points.
TEMPERATURE_MATCH_K = 1e-6


class PlasticityError(ValueError):
    """A series that cannot become a plastic table honestly; the message says why."""


@dataclass(frozen=True)
class PlasticPoint:
    """One row of the plastic table, canonical."""

    plastic_strain: float
    true_stress: float
    #: The point's ``position`` in the stored series (0-based), for the trail.
    source_position: int


@dataclass(frozen=True)
class PlasticTable:
    points: tuple[PlasticPoint, ...]
    youngs_modulus: float
    strain_measure: str
    #: Points before the elastic limit (the elastic stretch and the origin).
    discarded_elastic: int
    #: Points after the first maximum engineering stress (necking).
    discarded_after_necking: int
    #: Points after the yield with ``ε_p < 0``.
    discarded_negative: int
    #: The elastic limit's ``ε_p`` before it was anchored at zero.
    anchor_residual: float

    @property
    def yield_stress(self) -> float:
        return self.points[0].true_stress


def _finite(value: float, what: str) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float) or not math.isfinite(value):
        raise PlasticityError(f"{what}: valor não finito ou não numérico ({value!r}).")
    return float(value)


def plastic_table(
    points: Sequence[tuple[float, float]],
    *,
    strain_measure: str | None,
    youngs_modulus: float,
) -> PlasticTable:
    """The hardening table of one series, or the reason it cannot be built.

    ``points`` are (strain, stress) pairs in canonical units (dimensionless,
    Pa), in the stored order. ``youngs_modulus`` in Pa.
    """
    if strain_measure not in ("engineering", "true"):
        raise PlasticityError(
            "A curva não declara se é de engenharia ou verdadeira; a conversão para a "
            "tabela plástica não presume nenhuma das duas."
        )
    e_mod = _finite(youngs_modulus, "Módulo de Young")
    if e_mod <= 0:
        raise PlasticityError(f"Módulo de Young não positivo ({e_mod!r} Pa).")
    if len(points) < 2:
        raise PlasticityError("A série tem menos de dois pontos.")

    raw: list[tuple[int, float, float]] = []
    for index, (strain, stress) in enumerate(points):
        eps = _finite(strain, f"Ponto {index + 1}, deformação")
        sig = _finite(stress, f"Ponto {index + 1}, tensão")
        if eps < 0 or sig < 0:
            raise PlasticityError(
                f"Ponto {index + 1}: deformação ou tensão negativa. A tabela plástica dos "
                "cartões é de tração; uma curva de compressão não é convertida."
            )
        raw.append((index, eps, sig))

    after_necking = 0
    if strain_measure == "engineering":
        peak = max(sig for _, _, sig in raw)
        first_peak = next(i for i, (_, _, sig) in enumerate(raw) if sig == peak)
        after_necking = len(raw) - first_peak - 1
        raw = raw[: first_peak + 1]
        true_points = [(pos, math.log1p(eps), sig * (1.0 + eps)) for pos, eps, sig in raw]
    else:
        true_points = raw

    plastic = [(pos, eps_t - sig_t / e_mod, sig_t) for pos, eps_t, sig_t in true_points]

    def tolerance(sig_t: float) -> float:
        return YIELD_TOLERANCE * sig_t / e_mod

    first_plastic = next(
        (i for i, (_, eps_p, sig_t) in enumerate(plastic) if eps_p > tolerance(sig_t)), None
    )
    if first_plastic is None:
        raise PlasticityError(
            "Nenhum ponto da série passa do limite elástico com este módulo de Young: "
            "não há trecho plástico para escrever."
        )
    if first_plastic == 0:
        _, eps_p, _ = plastic[0]
        raise PlasticityError(
            "A série não começa no limite elástico: o primeiro ponto já tem deformação "
            f"plástica {eps_p:.6g}. O ponto de escoamento não é inventado."
        )
    yield_pos, yield_eps_p, yield_sig = plastic[first_plastic - 1]
    if yield_eps_p < -tolerance(yield_sig):
        raise PlasticityError(
            "A série não começa no limite elástico: o último ponto antes do trecho plástico "
            f"fica à esquerda da reta elástica (deformação plástica {yield_eps_p:.6g}), o que "
            "indica um módulo de Young incompatível com a curva."
        )
    if yield_sig <= 0:
        raise PlasticityError(
            "A série não registra o limite elástico: ela salta da origem direto para o "
            "trecho plástico, e a tensão de escoamento não é inventada."
        )

    table = [PlasticPoint(0.0, yield_sig, yield_pos)]
    negative = 0
    for pos, eps_p, sig_t in plastic[first_plastic:]:
        if eps_p < 0:
            negative += 1
            continue
        if sig_t <= 0:
            raise PlasticityError(
                f"Ponto {pos + 1}: tensão nula depois do escoamento; ruptura registrada na "
                "curva não é encruamento."
            )
        if eps_p <= table[-1].plastic_strain:
            raise PlasticityError(
                f"Ponto {pos + 1}: a deformação plástica não cresce ao longo da série; os "
                "pontos não são reordenados."
            )
        table.append(PlasticPoint(eps_p, sig_t, pos))

    return PlasticTable(
        points=tuple(table),
        youngs_modulus=e_mod,
        strain_measure=strain_measure,
        discarded_elastic=first_plastic - 1,
        discarded_after_necking=after_necking,
        discarded_negative=negative,
        anchor_residual=yield_eps_p,
    )


@dataclass(frozen=True)
class ModulusPoint:
    """One stored point of a Young's-modulus-versus-temperature curve, canonical."""

    curve_id: int
    temperature: float
    modulus: float


def match_temperature(temperature: float, candidates: Sequence[ModulusPoint]) -> ModulusPoint:
    """The one stored point at exactly ``temperature`` (K), or the reason there is none.

    Exactly: within :data:`TEMPERATURE_MATCH_K`. A temperature between two
    points is not read (that would be interpolation, docs/18 §6), and two
    points at the same temperature are not chosen between.
    """
    hits = [c for c in candidates if abs(c.temperature - temperature) <= TEMPERATURE_MATCH_K]
    if not hits:
        raise PlasticityError(
            "Não há módulo de Young deste material cadastrado exatamente na temperatura "
            "da série; ele não é interpolado nem tomado de outra temperatura."
        )
    if len({(h.curve_id, h.modulus) for h in hits}) > 1:
        curves = ", ".join(sorted({str(h.curve_id) for h in hits}))
        raise PlasticityError(
            "Há mais de um módulo de Young deste material na temperatura da série "
            f"(curvas {curves}); a exportação não escolhe entre eles."
        )
    return hits[0]
