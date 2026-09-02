"""Multi-criteria ranking by weighted normalized sum.

Pure domain logic. Given, for each material, a raw value per criterion, this
module normalizes each criterion column, applies weights and produces a ranked
list with per-criterion contributions, plus a small sensitivity analysis.

Methodology guarantees:

* **Missing data is never invented.** A material lacking any criterion value is
  excluded from the ranking and reported separately (with which values were
  missing) — never silently filled with 0 or a mean.
* Weights are renormalized to sum 1; a zero total weight is a hard error.
* Two normalization methods are offered, both mapping to a "higher is better"
  score in [0, 1] regardless of the criterion's optimization direction:
  min-max and vector (Euclidean).

The architecture (criteria with direction + weight + normalization, a scoring
matrix) is deliberately generic so TOPSIS / AHP / PROMETHEE can be added later
without reshaping the inputs.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum

from app.domain.errors import ValidationError


class Direction(str, Enum):
    MAX = "max"
    MIN = "min"


class Normalization(str, Enum):
    MINMAX = "minmax"
    VECTOR = "vector"


@dataclass
class Criterion:
    """One ranking criterion."""

    key: str  # property slug, or "__index__" for the performance index
    label: str
    direction: Direction
    weight: float


@dataclass
class Contribution:
    key: str
    label: str
    raw: float
    normalized: float
    weight: float  # renormalized (sums to 1 across criteria)
    contribution: float  # weight * normalized


@dataclass
class RankedMaterial:
    material_id: int
    name: str
    score: float
    rank: int
    contributions: list[Contribution]


@dataclass
class ExcludedMaterial:
    material_id: int
    name: str
    missing_keys: list[str]  # stable identifiers, for callers that match on them
    missing_labels: list[str]  # the same criteria as a reader knows them


@dataclass
class SensitivityScenario:
    description: str
    weights: dict[str, float]
    top_material_id: int | None
    top_material_name: str | None
    changed: bool  # did the #1 material change vs the baseline?


@dataclass
class RankingResult:
    normalization: str
    criteria: list[str]
    ranked: list[RankedMaterial]
    excluded: list[ExcludedMaterial]
    sensitivity: list[SensitivityScenario]


# One material's raw values: (id, name, {criterion_key: value | None}).
MaterialValues = tuple[int, str, dict[str, float | None]]


def normalize_column(
    values: list[float], direction: Direction, method: Normalization
) -> list[float]:
    """Map a column of raw values to [0, 1] where higher is always better.

    Public because the comparison charts (radar, parallel coordinates, heatmap)
    must place a material on exactly the same normalized scale the ranking uses;
    duplicating the formula there would let the two drift apart.
    """
    n = len(values)
    if n == 0:
        return []

    if method is Normalization.VECTOR:
        # ``math.hypot`` and not ``sum(v * v for v in values) ** 0.5``: the sum of
        # squares overflows to +inf at ~1e154, less than half the exponent range
        # of a float, and every material then normalizes to 0.0 — the column
        # stops telling them apart and the ranking ties silently, with no
        # exception raised. A performance index is a product of powers of
        # properties (E**(1/2)/rho and its relatives), which is precisely how a
        # column of ordinary numbers becomes 1e200. hypot rescales internally and
        # is exact in the same cases the naive form was.
        norm = math.hypot(*values)
        if norm == 0:
            return [1.0] * n
        base = [v / norm for v in values]
        return base if direction is Direction.MAX else [1.0 - b for b in base]

    # MINMAX (default)
    lo, hi = min(values), max(values)
    span = hi - lo
    if span == 0:
        # All equal: they are equally good on this criterion.
        return [1.0] * n
    if direction is Direction.MAX:
        return [(v - lo) / span for v in values]
    return [(hi - v) / span for v in values]


def _score(
    complete: list[MaterialValues],
    criteria: list[Criterion],
    method: Normalization,
    weights: dict[str, float],
) -> list[RankedMaterial]:
    """Score and rank materials that have all criterion values."""
    if not complete:
        return []

    # Normalize each criterion column across the candidate set.
    normalized_columns: dict[str, list[float]] = {}
    for criterion in criteria:
        raw_column = [values[criterion.key] for _, _, values in complete]  # all present
        normalized_columns[criterion.key] = normalize_column(
            [float(v) for v in raw_column], criterion.direction, method  # type: ignore[arg-type]
        )

    ranked: list[RankedMaterial] = []
    for i, (material_id, name, values) in enumerate(complete):
        contributions: list[Contribution] = []
        score = 0.0
        for criterion in criteria:
            normalized = normalized_columns[criterion.key][i]
            weight = weights[criterion.key]
            contribution = weight * normalized
            score += contribution
            contributions.append(
                Contribution(
                    key=criterion.key,
                    label=criterion.label,
                    raw=float(values[criterion.key]),  # type: ignore[arg-type]
                    normalized=normalized,
                    weight=weight,
                    contribution=contribution,
                )
            )
        ranked.append(
            RankedMaterial(
                material_id=material_id, name=name, score=score, rank=0, contributions=contributions
            )
        )

    ranked.sort(key=lambda m: m.score, reverse=True)
    # Standard competition ranking (ties share a rank).
    previous_score: float | None = None
    for position, material in enumerate(ranked):
        if previous_score is None or abs(material.score - previous_score) > 1e-12:
            material.rank = position + 1
            previous_score = material.score
        else:
            material.rank = ranked[position - 1].rank
    return ranked


def _split_complete_and_excluded(
    materials: list[MaterialValues], criteria: list[Criterion]
) -> tuple[list[MaterialValues], list[ExcludedMaterial]]:
    """Split materials into those with every criterion value and those
    missing at least one — shared by every ranking method (rank,
    rank_topsis, rank_promethee): a material never enters a score
    computation with a gap silently treated as zero."""
    complete: list[MaterialValues] = []
    excluded: list[ExcludedMaterial] = []
    for material_id, name, values in materials:
        missing = [c for c in criteria if values.get(c.key) is None]
        if missing:
            excluded.append(
                ExcludedMaterial(
                    material_id, name, [c.key for c in missing], [c.label for c in missing]
                )
            )
        else:
            complete.append((material_id, name, values))
    return complete, excluded


def _renormalize(weights: dict[str, float]) -> dict[str, float]:
    total = sum(weights.values())
    if total <= 0:
        raise ValidationError("A soma dos pesos deve ser maior que zero.")
    return {k: v / total for k, v in weights.items()}


def _sensitivity(
    complete: list[MaterialValues],
    criteria: list[Criterion],
    method: Normalization,
    baseline_weights: dict[str, float],
    baseline_top: RankedMaterial,
) -> list[SensitivityScenario]:
    """Probe robustness by re-ranking under perturbed weight sets."""
    scenarios: list[SensitivityScenario] = []

    def scenario(description: str, raw_weights: dict[str, float]) -> SensitivityScenario:
        weights = _renormalize(raw_weights)
        ranked = _score(complete, criteria, method, weights)
        top = ranked[0] if ranked else None
        return SensitivityScenario(
            description=description,
            weights=weights,
            top_material_id=top.material_id if top else None,
            top_material_name=top.name if top else None,
            changed=bool(top and top.material_id != baseline_top.material_id),
        )

    # Equal weights across all criteria.
    scenarios.append(scenario("Pesos iguais", {c.key: 1.0 for c in criteria}))

    # Emphasise each criterion in turn (double its weight, renormalized).
    if len(criteria) > 1:
        for criterion in criteria:
            emphasised = dict(baseline_weights)
            emphasised[criterion.key] = baseline_weights[criterion.key] * 2.0
            scenarios.append(scenario(f"Ênfase em {criterion.label}", emphasised))

    return scenarios


def rank_topsis(
    materials: list[MaterialValues],
    criteria: list[Criterion],
    run_sensitivity: bool = True,
) -> RankingResult:
    """Rank materials by TOPSIS (Technique for Order Preference by Similarity
    to Ideal Solution).

    Unlike the weighted-sum method, TOPSIS's score (the "closeness
    coefficient") is not a weighted sum of per-criterion contributions — it
    is a ratio of distances to an ideal-best and an ideal-worst point in the
    weighted-normalized decision space. Each RankedMaterial's
    ``contributions`` still report each criterion's weighted normalized
    value for transparency and audit, but — unlike the weighted-sum method —
    they do not sum to ``score``; that invariant is specific to the
    weighted-sum method's linear aggregation and has no TOPSIS equivalent.

    Missing-data handling and weight renormalization are identical to
    :func:`rank`.

    Raises:
        ValidationError: if there are no criteria or the weights sum to zero.
    """
    if not criteria:
        raise ValidationError("Defina ao menos um critério de ranking.")
    weights = _renormalize({c.key: c.weight for c in criteria})
    complete, excluded = _split_complete_and_excluded(materials, criteria)

    ranked = _score_topsis(complete, criteria, weights)

    sensitivity: list[SensitivityScenario] = []
    if run_sensitivity and len(ranked) >= 2:
        sensitivity = _sensitivity_topsis(complete, criteria, weights, ranked[0])

    return RankingResult(
        normalization="topsis",
        criteria=[c.key for c in criteria],
        ranked=ranked,
        excluded=excluded,
        sensitivity=sensitivity,
    )


def _score_topsis(
    complete: list[MaterialValues],
    criteria: list[Criterion],
    weights: dict[str, float],
) -> list[RankedMaterial]:
    if not complete:
        return []

    # Vector-normalize each column (TOPSIS's own normalization is always
    # Euclidean — there is no TOPSIS equivalent of the weighted-sum method's
    # MINMAX option). Direction-neutral at this stage: TOPSIS picks its
    # ideal best/worst points per criterion by direction afterwards, rather
    # than baking direction into the normalization the way normalize_column
    # does for the weighted-sum method.
    normalized_columns: dict[str, list[float]] = {}
    weighted_columns: dict[str, list[float]] = {}
    for criterion in criteria:
        raw_column = [float(values[criterion.key]) for _, _, values in complete]  # type: ignore[arg-type]
        norm = math.hypot(*raw_column)
        r = [0.0] * len(raw_column) if norm == 0 else [v / norm for v in raw_column]
        normalized_columns[criterion.key] = r
        weighted_columns[criterion.key] = [weights[criterion.key] * v for v in r]

    ideal_best: dict[str, float] = {}
    ideal_worst: dict[str, float] = {}
    for criterion in criteria:
        column = weighted_columns[criterion.key]
        if criterion.direction is Direction.MAX:
            ideal_best[criterion.key] = max(column)
            ideal_worst[criterion.key] = min(column)
        else:
            ideal_best[criterion.key] = min(column)
            ideal_worst[criterion.key] = max(column)

    ranked: list[RankedMaterial] = []
    for i, (material_id, name, values) in enumerate(complete):
        dist_best_sq = 0.0
        dist_worst_sq = 0.0
        contributions: list[Contribution] = []
        for criterion in criteria:
            r = normalized_columns[criterion.key][i]
            v = weighted_columns[criterion.key][i]
            dist_best_sq += (v - ideal_best[criterion.key]) ** 2
            dist_worst_sq += (v - ideal_worst[criterion.key]) ** 2
            contributions.append(
                Contribution(
                    key=criterion.key,
                    label=criterion.label,
                    raw=float(values[criterion.key]),  # type: ignore[arg-type]
                    normalized=r,
                    weight=weights[criterion.key],
                    contribution=v,
                )
            )
        dist_best = math.sqrt(dist_best_sq)
        dist_worst = math.sqrt(dist_worst_sq)
        denom = dist_best + dist_worst
        # Both distances zero only when every material coincides on every
        # criterion (ideal best == ideal worst) — every material is equally
        # close to both, a genuine tie, not a division failure to mask.
        score = 0.5 if denom == 0 else dist_worst / denom
        ranked.append(
            RankedMaterial(
                material_id=material_id, name=name, score=score, rank=0, contributions=contributions
            )
        )

    ranked.sort(key=lambda m: m.score, reverse=True)
    previous_score: float | None = None
    for position, material in enumerate(ranked):
        if previous_score is None or abs(material.score - previous_score) > 1e-12:
            material.rank = position + 1
            previous_score = material.score
        else:
            material.rank = ranked[position - 1].rank
    return ranked


def _sensitivity_topsis(
    complete: list[MaterialValues],
    criteria: list[Criterion],
    baseline_weights: dict[str, float],
    baseline_top: RankedMaterial,
) -> list[SensitivityScenario]:
    scenarios: list[SensitivityScenario] = []

    def scenario(description: str, raw_weights: dict[str, float]) -> SensitivityScenario:
        weights = _renormalize(raw_weights)
        ranked = _score_topsis(complete, criteria, weights)
        top = ranked[0] if ranked else None
        return SensitivityScenario(
            description=description,
            weights=weights,
            top_material_id=top.material_id if top else None,
            top_material_name=top.name if top else None,
            changed=bool(top and top.material_id != baseline_top.material_id),
        )

    scenarios.append(scenario("Pesos iguais", {c.key: 1.0 for c in criteria}))
    if len(criteria) > 1:
        for criterion in criteria:
            emphasised = dict(baseline_weights)
            emphasised[criterion.key] = baseline_weights[criterion.key] * 2.0
            scenarios.append(scenario(f"Ênfase em {criterion.label}", emphasised))
    return scenarios


# The exact message rank_promethee raises for "fewer than two complete
# candidates" — a module-level constant so a caller (SelectionService) can
# tell this specific, expected-and-recoverable case apart from any other
# ValidationError the same call can raise (empty criteria; a zero total
# weight) without parsing prose. See degrade_promethee_for_few_candidates.
PROMETHEE_TOO_FEW_CANDIDATES = (
    "PROMETHEE compara materiais aos pares; é preciso ao menos dois "
    "materiais com todos os critérios preenchidos."
)


def rank_promethee(
    materials: list[MaterialValues],
    criteria: list[Criterion],
    run_sensitivity: bool = True,
) -> RankingResult:
    """Rank materials by PROMETHEE II (net outranking flow).

    Scope decision: uses the "usual" (Type I) preference function only — a
    material is either strictly preferred to another on a criterion or not,
    with no indifference/preference thresholds. PROMETHEE's full generality
    supports six preference function shapes with tunable thresholds per
    criterion; "usual" needs no extra parameters from the user beyond
    direction + weight, the same information the weighted-sum/TOPSIS methods
    already collect — staying inside the "generic structure, no reshaping"
    scope docs/TODO.md's M5 entry asks for. A threshold-tunable preference
    function is future work, not this task's.

    Each RankedMaterial's ``contributions`` sum to ``score`` exactly, unlike
    TOPSIS: net flow is, by construction, the weighted sum across criteria
    of each material's average pairwise preference margin — see the inline
    comment in :func:`_score_promethee`.

    Missing-data handling and weight renormalization are identical to
    :func:`rank`.

    Raises:
        ValidationError: if there are no criteria, the weights sum to zero,
            or fewer than two materials have complete data (PROMETHEE ranks
            by pairwise comparison; one material has nothing to compare
            against).
    """
    if not criteria:
        raise ValidationError("Defina ao menos um critério de ranking.")
    weights = _renormalize({c.key: c.weight for c in criteria})
    complete, excluded = _split_complete_and_excluded(materials, criteria)
    if len(complete) < 2:
        raise ValidationError(PROMETHEE_TOO_FEW_CANDIDATES)

    ranked = _score_promethee(complete, criteria, weights)

    sensitivity: list[SensitivityScenario] = []
    if run_sensitivity and len(ranked) >= 2:
        sensitivity = _sensitivity_promethee(complete, criteria, weights, ranked[0])

    return RankingResult(
        normalization="promethee",
        criteria=[c.key for c in criteria],
        ranked=ranked,
        excluded=excluded,
        sensitivity=sensitivity,
    )


def _score_promethee(
    complete: list[MaterialValues],
    criteria: list[Criterion],
    weights: dict[str, float],
) -> list[RankedMaterial]:
    if not complete:
        return []
    n = len(complete)

    values_by_key = {
        criterion.key: [float(values[criterion.key]) for _, _, values in complete]  # type: ignore[arg-type]
        for criterion in criteria
    }

    # net_by_criterion[key][i] = (1/(n-1)) * sum_{k != i} (P(i,k) - P(k,i))
    # for the "usual" preference function P(i,k) = 1 if i is strictly
    # preferred to k on this criterion, else 0 — each material's average
    # pairwise margin on that one criterion, before weighting. Preference is
    # mutually exclusive (i can't be preferred to k AND k preferred to i on
    # the same criterion), so P(i,k) - P(k,i) is exactly the sign of the
    # direction-adjusted deviation: +1, -1, or 0 for a tie.
    net_by_criterion: dict[str, list[float]] = {}
    for criterion in criteria:
        column = values_by_key[criterion.key]
        sign = 1.0 if criterion.direction is Direction.MAX else -1.0
        net = [0.0] * n
        for i in range(n):
            total = 0.0
            for k in range(n):
                if i == k:
                    continue
                deviation = sign * (column[i] - column[k])
                if deviation > 0:
                    total += 1.0
                elif deviation < 0:
                    total -= 1.0
            net[i] = total / (n - 1)
        net_by_criterion[criterion.key] = net

    ranked: list[RankedMaterial] = []
    for i, (material_id, name, values) in enumerate(complete):
        contributions: list[Contribution] = []
        score = 0.0
        for criterion in criteria:
            weight = weights[criterion.key]
            net = net_by_criterion[criterion.key][i]
            contribution = weight * net
            score += contribution
            contributions.append(
                Contribution(
                    key=criterion.key,
                    label=criterion.label,
                    raw=float(values[criterion.key]),  # type: ignore[arg-type]
                    normalized=net,
                    weight=weight,
                    contribution=contribution,
                )
            )
        ranked.append(
            RankedMaterial(
                material_id=material_id, name=name, score=score, rank=0, contributions=contributions
            )
        )

    ranked.sort(key=lambda m: m.score, reverse=True)
    previous_score: float | None = None
    for position, material in enumerate(ranked):
        if previous_score is None or abs(material.score - previous_score) > 1e-12:
            material.rank = position + 1
            previous_score = material.score
        else:
            material.rank = ranked[position - 1].rank
    return ranked


def _sensitivity_promethee(
    complete: list[MaterialValues],
    criteria: list[Criterion],
    baseline_weights: dict[str, float],
    baseline_top: RankedMaterial,
) -> list[SensitivityScenario]:
    scenarios: list[SensitivityScenario] = []

    def scenario(description: str, raw_weights: dict[str, float]) -> SensitivityScenario:
        weights = _renormalize(raw_weights)
        ranked = _score_promethee(complete, criteria, weights)
        top = ranked[0] if ranked else None
        return SensitivityScenario(
            description=description,
            weights=weights,
            top_material_id=top.material_id if top else None,
            top_material_name=top.name if top else None,
            changed=bool(top and top.material_id != baseline_top.material_id),
        )

    scenarios.append(scenario("Pesos iguais", {c.key: 1.0 for c in criteria}))
    if len(criteria) > 1:
        for criterion in criteria:
            emphasised = dict(baseline_weights)
            emphasised[criterion.key] = baseline_weights[criterion.key] * 2.0
            scenarios.append(scenario(f"Ênfase em {criterion.label}", emphasised))
    return scenarios


def degrade_promethee_for_few_candidates(
    materials: list[MaterialValues],
    criteria: list[Criterion],
) -> RankingResult:
    """Build the RankingResult ``rank_promethee`` cannot produce for fewer
    than two complete candidates, instead of letting its ``ValidationError``
    (see ``PROMETHEE_TOO_FEW_CANDIDATES``) propagate and discard the whole
    selection run.

    That raise is correct on its own terms — a pairwise method genuinely has
    nothing to compare a single material against — so this is not a relaxed
    version of ``rank_promethee``; it is the caller's fallback for a case
    ``rank_promethee`` refuses to handle, mirroring how ``rank``/
    ``rank_topsis`` already degrade gracefully at 0-1 candidates instead of
    raising. Weight renormalization still runs first (and can still raise on
    a zero total — that failure mode is shared by every ranking method,
    unrelated to how many candidates survived filtering).

    * Zero complete candidates: an empty ranking, same as the other methods.
    * One complete candidate: reported with a neutral (zero) score and a
      zero-contribution row per criterion — PROMETHEE has no peer to compare
      it against, so "outranks nobody, is outranked by nobody" is the honest
      answer, not an invented one.

    Callers must check ``len(complete) < 2`` themselves (via
    ``PROMETHEE_TOO_FEW_CANDIDATES``-matching the caught error, or by
    counting complete candidates directly) before calling this — it does not
    re-check and will happily build a nonsensical "degenerate" result for
    two or more.
    """
    if not criteria:
        raise ValidationError("Defina ao menos um critério de ranking.")
    weights = _renormalize({c.key: c.weight for c in criteria})
    complete, excluded = _split_complete_and_excluded(materials, criteria)

    ranked: list[RankedMaterial] = []
    if complete:
        material_id, name, values = complete[0]
        contributions = [
            Contribution(
                key=c.key,
                label=c.label,
                raw=float(values[c.key]),  # type: ignore[arg-type]
                normalized=0.0,
                weight=weights[c.key],
                contribution=0.0,
            )
            for c in criteria
        ]
        ranked = [
            RankedMaterial(
                material_id=material_id, name=name, score=0.0, rank=1, contributions=contributions
            )
        ]

    return RankingResult(
        normalization="promethee",
        criteria=[c.key for c in criteria],
        ranked=ranked,
        excluded=excluded,
        sensitivity=[],
    )


def rank(
    materials: list[MaterialValues],
    criteria: list[Criterion],
    method: Normalization = Normalization.MINMAX,
    run_sensitivity: bool = True,
) -> RankingResult:
    """Rank materials by weighted normalized sum.

    Raises:
        ValidationError: if there are no criteria or the weights sum to zero.
    """
    if not criteria:
        raise ValidationError("Defina ao menos um critério de ranking.")

    weights = _renormalize({c.key: c.weight for c in criteria})

    complete, excluded = _split_complete_and_excluded(materials, criteria)

    ranked = _score(complete, criteria, method, weights)

    sensitivity: list[SensitivityScenario] = []
    if run_sensitivity and len(ranked) >= 2:
        sensitivity = _sensitivity(complete, criteria, method, weights, ranked[0])

    return RankingResult(
        normalization=method.value,
        criteria=[c.key for c in criteria],
        ranked=ranked,
        excluded=excluded,
        sensitivity=sensitivity,
    )
