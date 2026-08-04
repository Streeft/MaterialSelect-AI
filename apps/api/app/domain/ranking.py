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
    missing_keys: list[str]


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


def normalize_column(values: list[float], direction: Direction, method: Normalization) -> list[float]:
    """Map a column of raw values to [0, 1] where higher is always better.

    Public because the comparison charts (radar, parallel coordinates, heatmap)
    must place a material on exactly the same normalized scale the ranking uses;
    duplicating the formula there would let the two drift apart.
    """
    n = len(values)
    if n == 0:
        return []

    if method is Normalization.VECTOR:
        norm = sum(v * v for v in values) ** 0.5
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

    complete: list[MaterialValues] = []
    excluded: list[ExcludedMaterial] = []
    for material_id, name, values in materials:
        missing = [c.key for c in criteria if values.get(c.key) is None]
        if missing:
            excluded.append(ExcludedMaterial(material_id, name, missing))
        else:
            complete.append((material_id, name, values))

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
