# M5 + M6 Implementation Plan — Métodos multicritério e restrições aninhadas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver `docs/TODO.md`'s two "Média prioridade" items: M5 (TOPSIS, PROMETHEE II and AHP-derived weights, added to the existing generic ranking pipeline) and M6 (nested AND/OR groups in selection constraints, replacing the single global combinator).

**Architecture:** Two unrelated features bundled in one plan because both are backend-first with a thin frontend surface, but each is a real, independently-shippable increment — not one feature. M5 is purely additive (new functions alongside the existing `rank()`, a new `method` field defaulting to today's behavior); M6 changes how constraints combine (a new `ConstraintGroup` tree replacing the single global `combinator`), with a backfill migration so existing studies keep behaving exactly as before.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + Alembic (backend), Next.js + TanStack Query + TypeScript strict (frontend). No new dependency — both AHP's weight derivation and M6's tree evaluation are pure Python/stdlib, matching this project's established preference (see `app/domain/geometry.py::fitted_ellipse`'s closed-form 2×2 eigen-decomposition, chosen over pulling in numpy for the same reason).

**Spec:** `docs/TODO.md`'s M5 and M6 entries are the spec. M5's entry: "implementar sobre a estrutura já genérica de `domain/ranking.py`... a matriz de escores já está no formato certo." M6's entry: "grupos aninhados em vez de só AND/OR global... muda o schema de `SelectionConstraint` (precisa de migration)." `docs/04-metodologia-selecao.md` documents the current methodology and needs both features added.

## Global Constraints

- **Dado ausente nunca vira zero.** Every ranking function excludes a material missing any criterion value — never substitutes 0 or a mean. `app/domain/ranking.py`'s existing docstring states this; the new functions inherit it exactly.
- **Nenhum `eval`/`exec`.** Not touched by this plan (no expression parsing involved), but no task introduces one either.
- **Todo cálculo numérico é determinístico e vive no backend.** No ranking or constraint-evaluation math in a `.tsx` file.
- **PT-BR for user-facing text** (error messages, UI labels); English for identifiers/code/comments.
- **Alembic is the schema source of truth.** Any new table/column needs a real migration; verify `alembic heads` at execution time — do not hardcode a `down_revision` from this plan's text, which may be stale by the time a task runs (a prior task's own migration may have moved the chain).
- **Reprodutibilidade.** A saved `SelectionStudy` must always re-run to the same result — the ranking `method` (M5) and the constraint tree (M6) are both persisted, never inferred at read time.
- **Every cálculo needs a test.** Backend: pytest, SQLite in-memory. Frontend: Vitest.
- **ruff + black clean, line-length 100.** TypeScript strict + `noUncheckedIndexedAccess`, no `any`.
- Run the full local gate before each commit: backend `ruff check app && black --check app && pytest`; frontend `npm run typecheck && npm run lint && npm run test`.

---

### Task 1: M5 — TOPSIS and PROMETHEE II ranking methods

**Files:**
- Modify: `apps/api/app/domain/ranking.py` — add `rank_topsis`, `rank_promethee`, and their private `_score_*`/`_sensitivity_*` helpers; factor the existing missing-data split out of `rank()` into a shared `_split_complete_and_excluded` helper
- Test: `apps/api/app/tests/test_ranking.py`

**Interfaces:**
- Produces: `rank_topsis(materials: list[MaterialValues], criteria: list[Criterion], run_sensitivity: bool = True) -> RankingResult` and `rank_promethee(materials: list[MaterialValues], criteria: list[Criterion], run_sensitivity: bool = True) -> RankingResult`, matching `rank()`'s exact signature shape (module already defines `MaterialValues`, `Criterion`, `RankingResult`, `RankedMaterial`, `Contribution`, `ExcludedMaterial`, `SensitivityScenario`, `Direction`, `_renormalize` — reuse all of them, do not redefine).
- Task 3 imports both new functions by name and dispatches to them from `SelectionService._rank`.

- [ ] **Step 1: Read the current file in full**

Read `apps/api/app/domain/ranking.py` end to end before writing anything — you need the exact current text of `rank()`, `_score()`, `_sensitivity()`, `_renormalize()`, and every dataclass, both to factor out the shared helper correctly and to match this task's code below to the file's actual current line numbers (they may have shifted since this plan was written).

- [ ] **Step 2: Factor out the missing-data split**

Inside `rank()`, replace the inline loop that builds `complete`/`excluded` with a call to a new module-level helper:

```python
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
```

Run the existing test suite for this file (`pytest app/tests/test_ranking.py -v`) after this refactor, before adding anything new — every existing test must still pass unchanged, since this step only moves code, it doesn't change behavior.

- [ ] **Step 3: Write the failing tests for TOPSIS**

Add to `apps/api/app/tests/test_ranking.py`, matching the existing file's fixture/helper style (its `_crit()` helper, if present, builds a `Criterion` — reuse it):

```python
from app.domain.ranking import rank_topsis  # add to the existing import line


def test_topsis_ranks_by_closeness_to_ideal():
    materials = [
        (1, "A", {"rigidez": 200.0, "densidade": 8.0}),
        (2, "B", {"rigidez": 70.0, "densidade": 2.7}),
        (3, "C", {"rigidez": 400.0, "densidade": 19.0}),
    ]
    criteria = [
        _crit("rigidez", Direction.MAX, 1.0),
        _crit("densidade", Direction.MIN, 1.0),
    ]
    result = rank_topsis(materials, criteria, run_sensitivity=False)
    assert len(result.ranked) == 3
    assert result.normalization == "topsis"
    # Every score is the TOPSIS closeness coefficient, always in [0, 1].
    for material in result.ranked:
        assert 0.0 <= material.score <= 1.0
    # Ranks are assigned 1..n with no gaps, best (highest score) first.
    assert [m.rank for m in result.ranked] == sorted(m.rank for m in result.ranked)
    assert result.ranked[0].score >= result.ranked[-1].score


def test_topsis_excludes_missing_data_never_zero():
    materials = [
        (1, "A", {"rigidez": 200.0, "densidade": 8.0}),
        (2, "B", {"rigidez": None, "densidade": 2.7}),
    ]
    criteria = [_crit("rigidez", Direction.MAX, 1.0), _crit("densidade", Direction.MIN, 1.0)]
    result = rank_topsis(materials, criteria, run_sensitivity=False)
    assert len(result.ranked) == 1
    assert len(result.excluded) == 1
    assert result.excluded[0].missing_keys == ["rigidez"]


def test_topsis_identical_materials_tie_at_half():
    # Every material identical on every criterion: ideal best == ideal worst,
    # so the distance-ratio score is undefined by the raw formula — this
    # must resolve to a genuine tie (0.5, per the docstring), not a
    # ZeroDivisionError.
    materials = [(1, "A", {"x": 5.0}), (2, "B", {"x": 5.0})]
    criteria = [_crit("x", Direction.MAX, 1.0)]
    result = rank_topsis(materials, criteria, run_sensitivity=False)
    assert result.ranked[0].score == result.ranked[1].score == 0.5
    assert result.ranked[0].rank == result.ranked[1].rank == 1


def test_topsis_requires_at_least_one_criterion():
    with pytest.raises(ValidationError):
        rank_topsis([(1, "A", {})], [], run_sensitivity=False)
```

(`pytest`/`ValidationError` should already be imported at the top of the test file — check before adding a duplicate import.)

- [ ] **Step 4: Run to verify RED, then implement TOPSIS**

```bash
cd apps/api && .venv/bin/python -m pytest app/tests/test_ranking.py -k topsis -v
```
Expected: FAIL — `rank_topsis` doesn't exist.

Add to `apps/api/app/domain/ranking.py`, after `_sensitivity`:

```python
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
```

- [ ] **Step 5: Run to verify GREEN**

```bash
cd apps/api && .venv/bin/python -m pytest app/tests/test_ranking.py -k topsis -v
```

- [ ] **Step 6: Write the failing tests for PROMETHEE II**

Add to the same test file:

```python
from app.domain.ranking import rank_promethee  # add to the import line from Step 3


def test_promethee_contributions_sum_to_score():
    materials = [
        (1, "A", {"rigidez": 200.0, "densidade": 8.0}),
        (2, "B", {"rigidez": 70.0, "densidade": 2.7}),
        (3, "C", {"rigidez": 400.0, "densidade": 19.0}),
    ]
    criteria = [
        _crit("rigidez", Direction.MAX, 2.0),
        _crit("densidade", Direction.MIN, 1.0),
    ]
    result = rank_promethee(materials, criteria, run_sensitivity=False)
    assert result.normalization == "promethee"
    for material in result.ranked:
        total_contribution = sum(c.contribution for c in material.contributions)
        assert total_contribution == pytest.approx(material.score, abs=1e-9)
    # Net flow scores sum to (approximately) zero across all materials —
    # a structural property of PROMETHEE II's net flow (every pairwise
    # preference is counted once as +1 for the winner and once as -1 for
    # the loser, so the total cancels).
    assert sum(m.score for m in result.ranked) == pytest.approx(0.0, abs=1e-9)


def test_promethee_direction_min_prefers_lower_value():
    materials = [(1, "Leve", {"densidade": 2.0}), (2, "Pesado", {"densidade": 8.0})]
    criteria = [_crit("densidade", Direction.MIN, 1.0)]
    result = rank_promethee(materials, criteria, run_sensitivity=False)
    assert result.ranked[0].name == "Leve"
    assert result.ranked[0].score > result.ranked[1].score


def test_promethee_requires_at_least_two_materials_with_data():
    materials = [(1, "A", {"x": 5.0})]
    criteria = [_crit("x", Direction.MAX, 1.0)]
    with pytest.raises(ValidationError):
        rank_promethee(materials, criteria, run_sensitivity=False)


def test_promethee_requires_at_least_one_criterion():
    with pytest.raises(ValidationError):
        rank_promethee([(1, "A", {}), (2, "B", {})], [], run_sensitivity=False)
```

- [ ] **Step 7: Run to verify RED, then implement PROMETHEE II**

```bash
cd apps/api && .venv/bin/python -m pytest app/tests/test_ranking.py -k promethee -v
```
Expected: FAIL.

Add to `apps/api/app/domain/ranking.py`, after the TOPSIS functions:

```python
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
        raise ValidationError(
            "PROMETHEE compara materiais aos pares; é preciso ao menos dois "
            "materiais com todos os critérios preenchidos."
        )

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
```

- [ ] **Step 8: Run all ranking tests, verify green; full backend gate; commit**

```bash
cd apps/api
.venv/bin/python -m pytest app/tests/test_ranking.py -v
.venv/bin/python -m ruff check app && .venv/bin/python -m black --check app && .venv/bin/python -m pytest -q
git add apps/api/app/domain/ranking.py apps/api/app/tests/test_ranking.py
git commit -m "feat(ranking): adiciona TOPSIS e PROMETHEE II (M5)"
```

---

### Task 2: M5 — AHP weight derivation

**Depends on:** nothing from Task 1 (separate module).

**Files:**
- Create: `apps/api/app/domain/ahp.py`
- Test: `apps/api/app/tests/test_ahp.py`

**Interfaces:**
- Produces: `derive_weights(keys: list[str], matrix: list[list[float]]) -> AhpResult`, `AhpResult(weights: dict[str, float], lambda_max: float, consistency_index: float, consistency_ratio: float)`.
- Task 3's new router endpoint calls `derive_weights` directly; its returned `weights` dict is what a caller then assigns to each `Criterion.weight` before calling `rank`/`rank_topsis`/`rank_promethee` — `derive_weights` itself never touches ranking.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/app/tests/test_ahp.py`:

```python
import pytest

from app.domain.ahp import derive_weights
from app.domain.errors import ValidationError


def test_derive_weights_consistent_matrix_sums_to_one():
    # A perfectly consistent 3x3 matrix: criterion A is 2x criterion B,
    # B is 3x criterion C, so A is 6x C (2*3) — by construction consistent.
    keys = ["A", "B", "C"]
    matrix = [
        [1.0, 2.0, 6.0],
        [0.5, 1.0, 3.0],
        [1 / 6, 1 / 3, 1.0],
    ]
    result = derive_weights(keys, matrix)
    assert sum(result.weights.values()) == pytest.approx(1.0, abs=1e-9)
    # A > B > C, matching the judgments.
    assert result.weights["A"] > result.weights["B"] > result.weights["C"]
    assert result.consistency_ratio == pytest.approx(0.0, abs=1e-6)


def test_derive_weights_rejects_inconsistent_matrix():
    # A wildly self-contradictory matrix: A >> B >> C >> A.
    keys = ["A", "B", "C"]
    matrix = [
        [1.0, 9.0, 1 / 9],
        [1 / 9, 1.0, 9.0],
        [9.0, 1 / 9, 1.0],
    ]
    with pytest.raises(ValidationError):
        derive_weights(keys, matrix)


def test_derive_weights_rejects_non_reciprocal_matrix():
    keys = ["A", "B"]
    matrix = [[1.0, 2.0], [2.0, 1.0]]  # should be [1/2, 1], not [2, 1]
    with pytest.raises(ValidationError):
        derive_weights(keys, matrix)


def test_derive_weights_rejects_bad_diagonal():
    keys = ["A", "B"]
    matrix = [[1.0, 2.0], [0.5, 2.0]]  # diagonal should be 1
    with pytest.raises(ValidationError):
        derive_weights(keys, matrix)


def test_derive_weights_requires_at_least_two_keys():
    with pytest.raises(ValidationError):
        derive_weights(["A"], [[1.0]])


def test_derive_weights_wrong_shape_rejected():
    with pytest.raises(ValidationError):
        derive_weights(["A", "B"], [[1.0, 2.0]])  # only one row for two keys
```

- [ ] **Step 2: Run to verify RED**

```bash
cd apps/api && .venv/bin/python -m pytest app/tests/test_ahp.py -v
```
Expected: FAIL — `app/domain/ahp.py` doesn't exist.

- [ ] **Step 3: Implement**

Create `apps/api/app/domain/ahp.py`:

```python
"""AHP (Analytic Hierarchy Process) pairwise-comparison weight derivation.

Scope: AHP's own contribution is deriving criterion *weights* from a matrix
of pairwise importance judgments (Saaty's 1-9 scale) — not a new way to
combine already-weighted, already-normalized criterion values. That part is
exactly the existing generic ranking pipeline
(app.domain.ranking.rank/rank_topsis/rank_promethee), unchanged: a caller
gets weights from derive_weights() here, then passes them as each
Criterion.weight into whichever ranking method it already uses.

Method: normalized-column-average (Saaty's own documented approximation to
the principal eigenvector — exact when the matrix is perfectly consistent,
close for the mildly-inconsistent matrices the consistency-ratio check below
still accepts), not a numerical eigenvalue solver — so no numpy/scipy
dependency, matching this project's existing style (see
app.domain.geometry.fitted_ellipse's closed-form 2x2 eigen-decomposition,
chosen for the same reason: real math, no heavyweight linear-algebra
dependency for a problem small enough to solve in closed form).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.errors import ValidationError

# Saaty's Random Index: the average consistency index of many randomly
# generated reciprocal matrices of each size, used to scale the consistency
# index into a ratio so the 0.1 threshold means the same thing regardless of
# matrix size. Indices 0 and 1 (n=1, n=2) are 0 because a 1x1 or 2x2
# reciprocal matrix is always perfectly consistent — there is only one
# independent judgment, nothing for it to contradict.
_RANDOM_INDEX = [0.0, 0.0, 0.58, 0.90, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49]
_MAX_CONSISTENCY_RATIO = 0.1


@dataclass
class AhpResult:
    weights: dict[str, float]  # sums to 1
    lambda_max: float
    consistency_index: float
    consistency_ratio: float


def derive_weights(keys: list[str], matrix: list[list[float]]) -> AhpResult:
    """Derive normalized weights from a pairwise comparison matrix.

    ``matrix[i][j]`` is how much more important ``keys[i]`` is than
    ``keys[j]`` on Saaty's 1-9 scale (1 = equal importance, 9 = extreme);
    the matrix must be reciprocal (``matrix[j][i] == 1 / matrix[i][j]``) and
    its diagonal must be 1 — both checked here, never assumed from the
    caller.

    Raises:
        ValidationError: fewer than 2 keys, a non-square/wrong-diagonal/
            non-reciprocal matrix, or a consistency ratio above 0.1
            (Saaty's threshold) — an inconsistent matrix produces
            numerically valid but methodologically meaningless weights, so
            this project's "never invent a number" rule extends to never
            returning weights derived from a self-contradictory set of
            judgments.
    """
    n = len(keys)
    if n < 2:
        raise ValidationError("AHP precisa de ao menos dois critérios para comparar.")
    if len(matrix) != n or any(len(row) != n for row in matrix):
        raise ValidationError(f"A matriz de comparação precisa ser {n}×{n}.")
    for i in range(n):
        if abs(matrix[i][i] - 1.0) > 1e-9:
            raise ValidationError(f"A diagonal da matriz precisa ser 1 (linha {i} não é).")
        for j in range(n):
            if i == j:
                continue
            if matrix[i][j] <= 0:
                raise ValidationError("Todo julgamento de comparação precisa ser positivo.")
            expected_reciprocal = 1.0 / matrix[i][j]
            if abs(matrix[j][i] - expected_reciprocal) > 1e-6:
                raise ValidationError(
                    f"A matriz precisa ser recíproca: posição [{j}][{i}] deveria ser "
                    f"1/[{i}][{j}] = {expected_reciprocal:.4f}, não {matrix[j][i]}."
                )

    column_sums = [sum(matrix[i][j] for i in range(n)) for j in range(n)]
    weights_list = [sum(matrix[i][j] / column_sums[j] for j in range(n)) / n for i in range(n)]

    row_products = [sum(matrix[i][j] * weights_list[j] for j in range(n)) for i in range(n)]
    lambda_max = sum(row_products[i] / weights_list[i] for i in range(n)) / n
    consistency_index = (lambda_max - n) / (n - 1)
    random_index = _RANDOM_INDEX[n - 1] if n <= len(_RANDOM_INDEX) else _RANDOM_INDEX[-1]
    consistency_ratio = 0.0 if random_index == 0 else consistency_index / random_index

    if consistency_ratio > _MAX_CONSISTENCY_RATIO:
        raise ValidationError(
            f"Julgamentos inconsistentes demais (razão de consistência "
            f"{consistency_ratio:.2f}, limite {_MAX_CONSISTENCY_RATIO}). Revise as "
            "comparações — pesos derivados de uma matriz autocontraditória não "
            "seriam confiáveis."
        )

    return AhpResult(
        weights=dict(zip(keys, weights_list, strict=True)),
        lambda_max=lambda_max,
        consistency_index=consistency_index,
        consistency_ratio=consistency_ratio,
    )
```

Check `apps/api/app/domain/errors.py` for `ValidationError`'s exact import path before writing the import line — it should match `ranking.py`'s own `from app.domain.errors import ValidationError`.

- [ ] **Step 4: Run tests, verify green; full backend gate; commit**

```bash
cd apps/api
.venv/bin/python -m pytest app/tests/test_ahp.py -v
.venv/bin/python -m ruff check app && .venv/bin/python -m black --check app && .venv/bin/python -m pytest -q
git add apps/api/app/domain/ahp.py apps/api/app/tests/test_ahp.py
git commit -m "feat(ranking): deriva pesos por AHP a partir de matriz de comparação pareada (M5)"
```

---

### Task 3: M5 — Wire `method` selection into the schema, service, and a new AHP endpoint

**Depends on:** Task 1 (`rank_topsis`/`rank_promethee` must exist) and Task 2 (`derive_weights` must exist).

**Files:**
- Modify: `apps/api/app/schemas/selection.py` — extend the ranking request schema with a `method` field; add `AhpWeightsIn`/`AhpWeightsOut` schemas
- Modify: `apps/api/app/models/selection.py` — `SelectionStudy` gains a `method` column
- Create: migration `apps/api/alembic/versions/<new_hash>_selection_study_method.py`
- Modify: `apps/api/app/services/selection_service.py` — `_rank` dispatches on `method`; `create_study`/wherever `normalization` is persisted also persists `method`
- Modify: `apps/api/app/routers/selection.py` (or wherever the selection router lives — confirm the exact file first) — new `POST` endpoint for AHP weight derivation
- Test: extend `apps/api/app/tests/test_selection_api.py` (or wherever the selection API is tested — confirm the exact file first)

**Interfaces:**
- Produces: `SelectionStudy.method: Mapped[str]` (default `"weighted_sum"`), a new PT-BR-labelled `MethodLiteral = Literal["weighted_sum", "topsis", "promethee"]` in schemas, and a new endpoint (confirm the exact path convention from the router file, e.g. `POST /api/selection/ahp-weights`) taking `AhpWeightsIn {criteria: list[str], matrix: list[list[float]]}` and returning `AhpWeightsOut {weights: dict[str, float], lambda_max: float, consistency_index: float, consistency_ratio: float}` on success, or a 422 with the `ValidationError`'s PT-BR message on an inconsistent/malformed matrix.
- Task 4 (frontend) consumes both: the extended `method` field on the existing ranking request, and the new AHP endpoint.

- [ ] **Step 1: Read the current files before editing**

Read `apps/api/app/schemas/selection.py`, `apps/api/app/models/selection.py`, `apps/api/app/services/selection_service.py` (specifically `_rank`, confirmed at lines 308-370 as of this plan's writing — re-confirm), and the selection router file in full. Confirm the exact current `NormalizationLiteral`/`RankingIn` shape (reported at `schemas/selection.py:25` and `:63-66` as of this plan's writing) and `SelectionStudy.normalization`'s exact line (reported at `models/selection.py:51`) before changing anything — this plan's line numbers may have shifted.

- [ ] **Step 2: Extend the schema**

In `apps/api/app/schemas/selection.py`, add near `NormalizationLiteral`:

```python
MethodLiteral = Literal["weighted_sum", "topsis", "promethee"]
```

Add `method: MethodLiteral = "weighted_sum"` to `RankingIn` (and to `StudyIn`/`RunRequest`, wherever else `normalization` currently appears in a ranking-related schema — search for every occurrence of `normalization` in this file and add `method` alongside each one, so the two travel together). Keep `normalization: NormalizationLiteral = "minmax"` — it stays meaningful only when `method == "weighted_sum"` (TOPSIS/PROMETHEE have their own fixed normalization internally, per Task 1's docstrings).

Add two new schemas, near the other request/response pairs in this file:

```python
class AhpWeightsIn(BaseModel):
    """A pairwise comparison matrix (Saaty's 1-9 scale) to derive weights from."""

    criteria: list[str] = Field(min_length=2, max_length=MAX_COMPARE_PROPERTIES)  # reuse whatever max-count constant this file already defines for a similar list, or add a new one following its naming convention
    matrix: list[list[float]]


class AhpWeightsOut(BaseModel):
    weights: dict[str, float]
    lambda_max: float
    consistency_index: float
    consistency_ratio: float
```

(Check whether `MAX_COMPARE_PROPERTIES` or a similarly-named cap constant already exists in this file — the brief for Task 4 in `docs/superpowers/plans/2026-08-27-backlog-b1-b10.md` shows `schemas/charts.py` has one; this file may have its own equivalent. If none fits, define a new `MAX_AHP_CRITERIA` constant near the top, following the file's existing style.)

- [ ] **Step 3: Add the `method` column and migration**

In `apps/api/app/models/selection.py`, add next to `normalization`:

```python
method: Mapped[str] = mapped_column(String(20), default="weighted_sum", nullable=False)
```

```bash
cd apps/api
.venv/bin/python -m alembic heads   # confirm the real current head before writing down_revision
.venv/bin/python -m alembic revision --autogenerate -m "selection_study_method"
```
Read the generated file, confirm it only adds the `method` column with `server_default='weighted_sum'` (existing rows need a real default value written, not just a Python-side default that only applies to new rows — check how `normalization`'s own original migration handled this, if it's findable via `git log -p -- apps/api/app/models/selection.py` or the migrations directory, and mirror it). Apply:
```bash
.venv/bin/python -m alembic upgrade head
```

- [ ] **Step 4: Dispatch on `method` in the service**

In `apps/api/app/services/selection_service.py`'s `_rank` method (or wherever the `rank(...)` call at line ~325-327 as of this plan's writing actually lives — re-confirm), change the single call into a dispatch:

```python
from app.domain.ranking import Criterion, Direction, Normalization, rank, rank_promethee, rank_topsis
# ^ extend the existing import line from ranking, don't add a second one

...
if ranking.method == "topsis":
    result = rank_topsis(material_values, criteria, ranking.run_sensitivity)
elif ranking.method == "promethee":
    result = rank_promethee(material_values, criteria, ranking.run_sensitivity)
else:
    result = rank(
        material_values, criteria, Normalization(ranking.normalization), ranking.run_sensitivity
    )
```

Wherever `create_study`/the persistence path currently writes `normalization=payload.normalization` (reported at `selection_service.py:524` as of this plan's writing), add `method=payload.method` alongside it.

- [ ] **Step 5: Add the AHP endpoint**

In the selection router file, add (matching the file's existing endpoint style — dependency injection, response model, etc.):

```python
@router.post("/ahp-weights", response_model=AhpWeightsOut)
def derive_ahp_weights(payload: AhpWeightsIn, ...) -> AhpWeightsOut:  # match existing endpoints' exact dependency signature (db session? current user/project?) — this endpoint does no persistence and needs no project scoping, but every other route in this router likely still requires the standard auth dependency (CLAUDE.md: "toda rota exceto /entrar exige login") — copy whichever dependency the file's other GET/POST endpoints already declare, even though this one ignores the resulting session/project.
    result = derive_weights(payload.criteria, payload.matrix)
    return AhpWeightsOut(
        weights=result.weights,
        lambda_max=result.lambda_max,
        consistency_index=result.consistency_index,
        consistency_ratio=result.consistency_ratio,
    )
```
Import `derive_weights` from `app.domain.ahp` and `AhpWeightsIn`/`AhpWeightsOut` from `app.schemas.selection` at the top of the router file. A `ValidationError` raised by `derive_weights` should already be converted to a 422 by this app's existing global exception handler (confirm by finding how other domain-layer `ValidationError`s in this router already surface as HTTP errors — do not add a new try/except if one isn't already the pattern elsewhere in this file).

- [ ] **Step 6: Tests**

Add to the selection API test file (confirm its exact name/location first):

```python
def test_run_study_with_topsis_method(client, auth_headers, seeded_materials):
    payload = {..., "method": "topsis", ...}  # build on whatever existing "run a study" test payload already exists in this file — copy its shape, add "method": "topsis"
    response = client.post("/api/selection/studies/run", json=payload, headers=auth_headers)  # confirm exact path from the router
    assert response.status_code == 200
    assert response.json()["normalization"] == "topsis"


def test_ahp_weights_endpoint_returns_weights(client, auth_headers):
    payload = {
        "criteria": ["rigidez", "densidade"],
        "matrix": [[1.0, 3.0], [1 / 3, 1.0]],
    }
    response = client.post("/api/selection/ahp-weights", json=payload, headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert sum(body["weights"].values()) == pytest.approx(1.0, abs=1e-6)


def test_ahp_weights_endpoint_rejects_inconsistent_matrix(client, auth_headers):
    payload = {
        "criteria": ["A", "B", "C"],
        "matrix": [[1.0, 9.0, 1 / 9], [1 / 9, 1.0, 9.0], [9.0, 1 / 9, 1.0]],
    }
    response = client.post("/api/selection/ahp-weights", json=payload, headers=auth_headers)
    assert response.status_code == 422
```

- [ ] **Step 7: Run tests, verify green; full backend gate; commit**

```bash
cd apps/api
.venv/bin/python -m pytest -k "topsis or promethee or ahp" -v
.venv/bin/python -m ruff check app && .venv/bin/python -m black --check app && .venv/bin/python -m pytest -q
git add apps/api/app/schemas/selection.py apps/api/app/models/selection.py \
  apps/api/alembic/versions/*_selection_study_method.py apps/api/app/services/selection_service.py \
  apps/api/app/routers/selection.py apps/api/app/tests/
git commit -m "feat(ranking): liga TOPSIS/PROMETHEE/AHP ao serviço de seleção e a uma rota nova (M5)"
```

---

### Task 4: M5 — Frontend method selector and AHP pairwise-comparison UI

**Depends on:** Task 3 (schema/endpoint must exist).

**Files:**
- Modify: `apps/web/app/selecao/page.tsx` (or wherever the ranking-method/normalization picker currently lives — confirm first) — extend the method selector
- Create: `apps/web/components/selection/AhpMatrixInput.tsx` (or match whatever naming convention `ConstraintEditor.tsx`'s directory already uses)
- Modify: `apps/web/lib/api.ts` — add `deriveAhpWeights` client function
- Modify: `packages/shared-types/index.ts` — add `MethodLiteral`, `AhpWeightsIn`, `AhpWeightsOut` types matching the backend schemas exactly
- Modify: `apps/web/lib/i18n.ts` — new PT-BR labels
- Test: whatever frontend test file already covers the ranking-method picker, if one exists; otherwise a focused Vitest file for `AhpMatrixInput`'s pairwise-fill logic (Step 3 below)

**Interfaces:**
- Consumes: `POST /api/selection/ahp-weights` (Task 3).
- Produces: on submission, an array of derived weights the page applies to its existing per-criterion weight state — mirror however the page currently applies a weight to a `Criterion`-shaped object (read the file first).

- [ ] **Step 1: Read the current files**

Read `apps/web/app/selecao/page.tsx` in full (or wherever the ranking method/normalization picker and weight inputs actually live — the file structure may differ from this plan's guess; search for `normalization` and `NormalizationLiteral` across `apps/web/` first to find every call site that needs to learn about `method`). Read `apps/web/components/selection/ConstraintEditor.tsx` for this feature area's existing component style and file placement convention.

- [ ] **Step 2: Extend the method selector**

Wherever the page currently offers a normalization choice (likely a `ButtonGroup`/`MdOutlinedSelect`, matching the pattern the B1-B10 plan's Task 6 used for the envelope-shape toggle), add a `method` state (`useState<"weighted_sum" | "topsis" | "promethee">("weighted_sum")`), include it in whatever request object the page already builds for running a study, and add UI options for "TOPSIS" and "PROMETHEE II" alongside the existing weighted-sum choice. When `method !== "weighted_sum"`, the existing `normalization` (minmax/vector) picker should be hidden or disabled — it has no effect for those two methods (per Task 1's docstrings) and showing it as if it did would mislead the user.

Add the three method labels and any explanatory tooltip text to `apps/web/lib/i18n.ts`, following its existing structure.

- [ ] **Step 3: AHP pairwise-comparison matrix component**

Create `apps/web/components/selection/AhpMatrixInput.tsx`. Design: the user edits only the upper triangle (each pair once); the component computes and displays the lower triangle as the read-only reciprocal, and the diagonal is fixed at 1 (not editable). Props:

```typescript
interface AhpMatrixInputProps {
  criteria: { key: string; label: string }[];
  onDerived: (weights: Record<string, number>) => void;
}
```

Internal state: a `Record<string, number>` keyed by `"${keyA}|${keyB}"` for each upper-triangle pair (only pairs where `keyA` sorts before `keyB` in the `criteria` array), defaulting each to `1` (equal importance). Build the full `n×n` matrix for the API call by filling `matrix[i][j]` from the stored pair value when `i < j`, `1 / pairValue` when `i > j`, and `1` on the diagonal.

On every edit, call `deriveAhpWeights({criteria: criteria.map(c => c.key), matrix})` (debounced or on-blur — match whatever debounce pattern, if any, other live-computed inputs in this codebase already use) and show the returned `consistency_ratio` inline (e.g. "Consistência: 0.04 — ok" in a muted color when ≤0.1, or the backend's PT-BR error message in the danger/error color token when the request 422s). Only call `onDerived(result.weights)` on a successful (200) response — never on a 422, and never with partial/guessed weights.

Add `deriveAhpWeights(payload: AhpWeightsIn): Promise<AhpWeightsOut>` to `apps/web/lib/api.ts`, following the exact pattern of the file's other `POST` client functions (e.g. `getPropertyMap`).

Add `MethodLiteral`, `AhpWeightsIn`, `AhpWeightsOut` to `packages/shared-types/index.ts`, matching the backend schemas field-for-field.

- [ ] **Step 4: Wire it into the page**

When `method === "weighted_sum"` and the user opts into AHP for weight derivation (a checkbox or toggle — read the page's existing weight-input UI first to decide the least disruptive way to offer this as an alternative input mode for the *weights* specifically, not a fourth `method` value; AHP is a way of arriving at weights, not a fourth ranking algorithm, per Task 2's scope note), render `<AhpMatrixInput>` and apply its `onDerived` callback's weights onto the existing per-criterion weight state fields.

- [ ] **Step 5: Manual verification, full frontend gate, commit**

```bash
cd apps/web && npm run typecheck && npm run lint && npm run test && npm run build
```
Start the dev server, open the selection page, switch the method selector to TOPSIS and PROMETHEE and confirm a run completes; try the AHP matrix input with a consistent and an inconsistent judgment set and confirm the consistency-ratio feedback and the 422 rejection both render correctly. Stop the server.

```bash
git add apps/web/app/selecao/page.tsx apps/web/components/selection/AhpMatrixInput.tsx \
  apps/web/lib/api.ts apps/web/lib/i18n.ts packages/shared-types/index.ts
git commit -m "feat(selecao): seletor TOPSIS/PROMETHEE e entrada de matriz AHP (M5)"
```

---

### Task 5: M5 — Documentation

**Depends on:** Tasks 1-4 (describes what they built).

**Files:**
- Modify: `docs/04-metodologia-selecao.md`
- Modify: `docs/TODO.md` (move M5 out of "Média prioridade")

**Interfaces:** None — documentation only.

- [ ] **Step 1: Extend the methodology doc**

Read `docs/04-metodologia-selecao.md` in full, specifically the section around lines 74-82 (per this plan's research) that documents the weighted-sum method and already notes "a arquitetura... está preparada para TOPSIS/AHP/PROMETHEE." Replace that forward-looking note with three new subsections (matching the existing section's PT-BR technical writing style and level of detail), one per method, each stating: the method's core idea in a sentence or two, which project rule it inherits unchanged (missing-data exclusion, weight renormalization), and its one documented scope decision (TOPSIS: no per-criterion contribution-sums-to-score invariant; PROMETHEE: "usual" preference function only, no thresholds; AHP: normalized-column-average instead of a numerical eigenvector solver, and the hard 0.1 consistency-ratio rejection).

- [ ] **Step 2: Update TODO.md**

Move the M5 entry from "Média prioridade" to "Débitos já quitados", following the exact style of existing entries there (see the B1-B10 entry added in the previous session for the level of detail expected — file:function references, the scope decisions made, final test count). Note explicitly that this was implemented on request from the advisor, overriding the item's earlier "só faça se o orientador pedir" scope note — say so plainly, it's a fact worth recording, not something to omit.

- [ ] **Step 3: Commit**

```bash
git add docs/04-metodologia-selecao.md docs/TODO.md
git commit -m "docs: documenta TOPSIS, PROMETHEE II e AHP (M5)"
```

---

### Task 6: M6 — `ConstraintGroup` model, migration, and backfill

**Depends on:** nothing from Tasks 1-5 (independent feature). Must land before Tasks 7-10.

**Files:**
- Create: `apps/api/app/models/constraint_group.py` (or add to `apps/api/app/models/selection.py` alongside `SelectionConstraint` — match whichever this project's convention prefers; `SelectionConstraint`'s own file placement, from this plan's research, is `apps/api/app/models/selection.py`, so add `ConstraintGroup` there too, in the same file, rather than splitting)
- Modify: `apps/api/app/models/selection.py` — `SelectionConstraint` gains a `group_id` column
- Create: migration `apps/api/alembic/versions/<new_hash>_constraint_group.py`
- Test: extend whatever test file already covers `SelectionConstraint`/`SelectionStudy` model-level behavior

**Interfaces:**
- Produces: `ConstraintGroup(id, study_id, parent_group_id, operator, position)`; `SelectionConstraint.group_id` (FK to `ConstraintGroup.id`, NOT NULL after backfill).
- Task 7 (recursive evaluation) and Task 8 (schema/service wiring) both depend on this exact shape.

- [ ] **Step 1: Read the current model file**

Read `apps/api/app/models/selection.py` in full — you need `SelectionConstraint`'s exact current column list (reported at lines 67-89 by this plan's research: `id`, `study_id`, `position`, `operator`, `property_slug`, `value`, `value_min`, `value_max`, `unit`, `class_slugs`, `text`, `label` — re-confirm against the actual file) and `SelectionStudy.combinator`'s exact line (reported at line 44) before adding anything.

- [ ] **Step 2: Add the model**

In `apps/api/app/models/selection.py`, add near `SelectionConstraint`:

```python
class ConstraintGroup(Base):
    """One node of a constraint boolean-expression tree: either the root of
    a study's constraints, or a nested AND/OR sub-group (M6).

    A study's constraints used to combine under one global operator
    (SelectionStudy.combinator); every study now has exactly one root
    ConstraintGroup (parent_group_id NULL) whose operator is that same
    value, created by this migration's backfill for existing studies —
    reading a pre-M6 study still evaluates exactly as before. Nesting one
    sub-group inside another (parent_group_id pointing at a non-root group)
    is how "(A AND B) OR (C AND D)" is expressed: two child groups of a
    root OR-group, each an AND-group over its own constraints.
    """

    __tablename__ = "selection_constraint_group"

    id: Mapped[int] = mapped_column(primary_key=True)
    study_id: Mapped[int] = mapped_column(
        ForeignKey("selection_study.id", ondelete="CASCADE"), nullable=False, index=True
    )
    parent_group_id: Mapped[int | None] = mapped_column(
        ForeignKey("selection_constraint_group.id", ondelete="CASCADE"), nullable=True, index=True
    )
    operator: Mapped[str] = mapped_column(String(3), nullable=False)  # "AND" | "OR"
    position: Mapped[int] = mapped_column(nullable=False, default=0)
```

(Check the exact FK target table name for `SelectionStudy` — likely `selection_study`, confirm against `SelectionConstraint`'s own `study_id` FK definition, which already targets it, and copy that string verbatim. Check whether this file already imports `ForeignKey`/`Mapped`/`mapped_column`/`String` — it certainly does, for `SelectionConstraint` — reuse the existing import line, don't add a duplicate.)

Add to `SelectionConstraint`:

```python
    group_id: Mapped[int] = mapped_column(
        ForeignKey("selection_constraint_group.id", ondelete="CASCADE"), nullable=False, index=True
    )
```

- [ ] **Step 3: Migration with backfill**

```bash
cd apps/api
.venv/bin/python -m alembic heads   # confirm the real current head before writing down_revision — Task 3's migration may have landed first if tasks ran out of this plan's listed order
.venv/bin/python -m alembic revision --autogenerate -m "constraint_group"
```

The autogenerated migration will add the `selection_constraint_group` table and (if `group_id` is declared `nullable=False` in the model before any data exists to backfill) may fail to apply against a non-empty `selection_constraint` table, or add the column nullable and expect a follow-up `ALTER ... NOT NULL`. Handle this explicitly in the migration's `upgrade()`, in this order:
1. Create the `selection_constraint_group` table.
2. Add `selection_constraint.group_id` as **nullable** (regardless of what the model declares — the model's `nullable=False` describes steady state, not every intermediate step of this one migration).
3. For every existing `SelectionStudy` row, insert one `ConstraintGroup` row with `parent_group_id=NULL`, `operator=<that study's existing combinator value>`, `position=0`, then `UPDATE selection_constraint SET group_id = <that new group's id> WHERE study_id = <that study's id>`. Do this with raw SQL via `op.execute()`/`sa.text()` inside the migration (check `apps/api/alembic/versions/` for any prior migration that also did a data backfill, not just a schema change, as a style reference — if none exists, a straightforward `op.get_bind().execute(sa.text(...))` loop over studies is fine).
4. Alter `selection_constraint.group_id` to `NOT NULL` now that every row has been backfilled.

Read `SelectionStudy`'s exact table name and its `combinator` column's exact name/values (confirmed "AND"/"OR" strings by this plan's research, re-verify) before writing the backfill SQL.

Apply and verify against a scratch copy of the real dev database if one exists, or at minimum:
```bash
.venv/bin/python -m alembic upgrade head
```

- [ ] **Step 4: Tests**

Add a focused test confirming the backfill logic (either as a dedicated migration test, if this codebase has a pattern for those — check `apps/api/alembic/` and `apps/api/app/tests/` for one — or as a model/repository-level test that creates a `SelectionStudy` + `SelectionConstraint` rows directly, runs whatever backfill helper the migration's SQL corresponds to, and asserts every constraint now has a `group_id` pointing at a root `ConstraintGroup` whose `operator` matches the study's original `combinator`). If no existing precedent for testing a migration's data effects exists in this codebase, a plain unit test against the ORM models (bypassing the migration file itself, just verifying the shape is queryable and cascades correctly) is an acceptable, honestly-scoped substitute — note which you chose and why in the implementer's report.

- [ ] **Step 5: Run tests, verify green; full backend gate; commit**

```bash
cd apps/api
.venv/bin/python -m pytest -k "constraint_group or backfill" -v
.venv/bin/python -m ruff check app && .venv/bin/python -m black --check app && .venv/bin/python -m pytest -q
git add apps/api/app/models/selection.py apps/api/alembic/versions/*_constraint_group.py apps/api/app/tests/
git commit -m "feat(selecao): modelo ConstraintGroup e migration com backfill (M6)"
```

---

### Task 7: M6 — Recursive constraint-group evaluation

**Depends on:** Task 6 (`ConstraintGroup`/`SelectionConstraint.group_id` must exist).

**Files:**
- Modify: `apps/api/app/domain/filters.py` — add recursive group evaluation alongside the existing `evaluate_constraint`/`apply_constraints`
- Test: extend `apps/api/app/tests/test_filters.py`

**Interfaces:**
- Produces: a new function, e.g. `apply_constraint_tree(materials, root: ConstraintGroupNode) -> ...` — design the exact input tree shape (a plain in-memory dataclass, not the ORM model, so `domain/` stays free of SQLAlchemy per this project's architecture rule) in Step 2 below, matching whatever return shape `apply_constraints` already has (confirm from the file) so callers get the same kind of result (a filtered/passing set) either way.
- `evaluate_constraint` (the existing single-constraint evaluator) is reused unchanged as the tree's leaf evaluation — do not duplicate its logic.

- [ ] **Step 1: Read the current file**

Read `apps/api/app/domain/filters.py` in full — you need `evaluate_constraint`'s exact signature (reported at lines 104-151) and `apply_constraints`'s exact signature and return shape (reported at lines 154-202) before adding anything. Confirm whether `domain/filters.py` already imports SQLAlchemy or ORM types anywhere (it should not, per CLAUDE.md's "`domain` não importa SQLAlchemy nem FastAPI" rule) — the new tree-node type must be a plain dataclass, independent of `ConstraintGroup`/`SelectionConstraint` the ORM models.

- [ ] **Step 2: Design and write the failing tests**

Define the in-memory tree shape this task introduces (a dataclass in `domain/filters.py`, not imported from `models/`):

```python
@dataclass
class ConstraintGroupNode:
    """One node of a constraint tree, independent of the ORM — domain code
    never imports SQLAlchemy (CLAUDE.md §4). A leaf group has constraints
    and no children; an internal group combines its children (constraints
    evaluated directly, plus any nested sub-groups' own recursive result)
    with its own operator."""

    operator: str  # "AND" | "OR"
    constraints: list[Constraint]  # whatever the existing Constraint type in this file is called — confirm the exact name
    children: list["ConstraintGroupNode"]
```

Add to `apps/api/app/tests/test_filters.py` (matching the existing file's fixture/material style, e.g. reuse whatever helper builds a test `Material`/constraint the existing `test_and_funnel_is_cumulative`/`test_or_combines_union` tests already use):

```python
def test_nested_group_and_of_or():
    # (rigidez > 100 OR densidade < 3) AND (classe == "metais")
    # Material A: rigidez=150 (passes left OR via rigidez), classe=metais (passes right) -> True
    # Material B: rigidez=50, densidade=8 (fails left OR entirely) -> False regardless of classe
    # Material C: rigidez=150, classe=ceramicas (fails right AND branch) -> False
    left = ConstraintGroupNode(
        operator="OR",
        constraints=[_constraint("rigidez", "gt", 100), _constraint("densidade", "lt", 3)],
        children=[],
    )
    right = ConstraintGroupNode(
        operator="AND", constraints=[_constraint("classe", "in_class", ["metais"])], children=[]
    )
    root = ConstraintGroupNode(operator="AND", constraints=[], children=[left, right])

    materials = [
        _material("A", rigidez=150, densidade=8, classe="metais"),
        _material("B", rigidez=50, densidade=8, classe="metais"),
        _material("C", rigidez=150, densidade=8, classe="ceramicas"),
    ]
    passing = apply_constraint_tree(materials, root)
    assert {m.name for m in passing} == {"A"}


def test_single_root_group_matches_flat_apply_constraints():
    # A root group with no children and a flat constraint list must behave
    # identically to the existing apply_constraints — this is the backward-
    # compatibility guarantee the Task 6 migration's backfill depends on.
    constraints = [_constraint("rigidez", "gt", 100)]
    materials = [_material("A", rigidez=150), _material("B", rigidez=50)]
    root_and = ConstraintGroupNode(operator="AND", constraints=constraints, children=[])
    assert {m.name for m in apply_constraint_tree(materials, root_and)} == {
        m.name for m in apply_constraints(materials, constraints, "AND")
    }


def test_deeply_nested_group():
    # (A AND (B OR (C AND D)))
    innermost = ConstraintGroupNode(
        operator="AND", constraints=[_constraint("x", "gt", 0), _constraint("y", "gt", 0)], children=[]
    )
    mid = ConstraintGroupNode(
        operator="OR", constraints=[_constraint("z", "gt", 0)], children=[innermost]
    )
    root = ConstraintGroupNode(
        operator="AND", constraints=[_constraint("w", "gt", 0)], children=[mid]
    )
    # Just confirm this evaluates without error and returns a subset of the
    # input — the exact pass/fail set depends on _constraint/_material
    # helpers already in the file; adapt this test's specific values to
    # whatever those helpers actually accept once you've read the file.
    materials = [_material("A", w=1, x=1, y=1, z=1)]
    result = apply_constraint_tree(materials, root)
    assert isinstance(result, list)
```

Adapt `_constraint(...)`/`_material(...)` calls above to whatever helper names/signatures `test_filters.py` actually already defines — read the file first (Step 1) rather than inventing new ones.

- [ ] **Step 3: Run to verify RED, then implement**

```bash
cd apps/api && .venv/bin/python -m pytest app/tests/test_filters.py -k "nested or tree" -v
```
Expected: FAIL.

Add to `apps/api/app/domain/filters.py`:

```python
def _group_passes(material, group: ConstraintGroupNode) -> bool:
    """One group's own AND/OR of its direct constraints and child groups'
    recursive results — the tree-walk step apply_constraint_tree repeats
    per material."""
    results = [evaluate_constraint(material, c) for c in group.constraints]
    results.extend(_group_passes(material, child) for child in group.children)
    if not results:
        # An empty group (no constraints, no children) imposes no
        # restriction — vacuously true for AND (nothing to fail), and for OR
        # only if that's this codebase's existing convention for an empty
        # flat constraint list in apply_constraints; confirm and match it
        # rather than deciding independently here.
        return True
    if group.operator == "AND":
        return all(results)
    return any(results)


def apply_constraint_tree(materials, root: ConstraintGroupNode):
    """Filter materials by a nested AND/OR constraint tree — the M6
    generalization of apply_constraints's single global operator.

    A root group with an empty children list and a flat constraints list
    behaves identically to apply_constraints(materials, root.constraints,
    root.operator) — this is what lets a pre-M6 study (backfilled into one
    root group with no nesting) keep evaluating exactly as before.
    """
    return [material for material in materials if _group_passes(material, root)]
```

Match the return type/shape (a plain filtered list vs. something richer) to whatever `apply_constraints` actually returns — re-read it in Step 1 rather than assuming.

- [ ] **Step 4: Run tests, verify green; full backend gate; commit**

```bash
cd apps/api
.venv/bin/python -m pytest app/tests/test_filters.py -v
.venv/bin/python -m ruff check app && .venv/bin/python -m black --check app && .venv/bin/python -m pytest -q
git add apps/api/app/domain/filters.py apps/api/app/tests/test_filters.py
git commit -m "feat(selecao): avaliação recursiva de grupos AND/OR aninhados (M6)"
```

---

### Task 8: M6 — Schema and service wiring for nested constraint groups

**Depends on:** Task 6 (model) and Task 7 (`apply_constraint_tree`/`ConstraintGroupNode`).

**Files:**
- Modify: `apps/api/app/schemas/selection.py` — a recursive `ConstraintGroupIn` schema replacing (or extending, for backward compatibility — see Step 2) the flat `constraints: list[ConstraintIn]` + single `combinator`
- Modify: `apps/api/app/services/selection_service.py` — build/persist/read the `ConstraintGroup` tree; convert it to `ConstraintGroupNode` (Task 7's plain dataclass) before calling `apply_constraint_tree`
- Test: extend the selection API test file

**Interfaces:**
- Produces: `ConstraintGroupIn { operator: Literal["AND","OR"], constraints: list[ConstraintIn], groups: list["ConstraintGroupIn"] }` (Pydantic supports self-referencing models via `from __future__ import annotations` plus a `model_rebuild()` call if needed — check whether this file already does this anywhere, or needs it added).
- Task 9 (frontend) sends this shape when creating/updating a study; Task 8's service code is what turns it into `ConstraintGroup` rows (Task 6) and, at run time, into a `ConstraintGroupNode` tree (Task 7) to filter with.

- [ ] **Step 1: Read the current schema and service code**

Read `apps/api/app/schemas/selection.py`'s `ConstraintIn`/`StudyIn`/`FilterRequest`/`RunRequest` (reported at lines 32-44, 69-71, 79-84, 208-219 by this plan's research) and `apps/api/app/services/selection_service.py`'s `_build_constraint`/`create_study`/`filter` (reported at lines 123-180, 510-566, 208-228) in full before changing anything.

- [ ] **Step 2: Decide and document the compatibility approach**

Two ways to accept nested groups without breaking every existing caller of the flat shape: (a) add a new optional `root_group: ConstraintGroupIn | None = None` field alongside the existing flat `constraints`/`combinator`, where supplying it overrides the flat fields entirely and omitting it preserves today's exact behavior (simplest, most explicit, no ambiguity about which one wins when both are present — reject the request with a `ValidationError` if both are non-empty); or (b) always require the nested shape and have the service synthesize a flat-equivalent tree from the old shape at the boundary. Choose (a) — it is less invasive to every existing caller (including this project's own frontend before Task 9 lands) and makes the migration path visible in the API contract itself, not hidden inside service logic. Add:

```python
class ConstraintGroupIn(BaseModel):
    operator: CombinatorLiteral  # reuse whatever literal type "AND"/"OR" already uses elsewhere in this file
    constraints: list[ConstraintIn] = Field(default_factory=list)
    groups: list["ConstraintGroupIn"] = Field(default_factory=list)
```
Add `root_group: ConstraintGroupIn | None = None` to `StudyIn`/`FilterRequest`/`RunRequest` (wherever the flat `constraints`+`combinator` pair currently lives — every one of them).

- [ ] **Step 3: Service — build the tree on write, walk it on read/run**

In `selection_service.py`, wherever constraints are currently persisted from a flat list (`create_study`/`_build_constraint`), add a branch: if `payload.root_group` is present, recursively create `ConstraintGroup` rows (root first, then children depth-first, assigning each `SelectionConstraint`'s `group_id` to its owning group's id) instead of the flat path; if absent, keep today's exact flat-plus-global-combinator behavior unchanged (which, per Task 6's backfill, is equivalent to a single root group anyway — but do not silently route flat requests through the new tree-building code path in this task if it risks behavior drift; only build a real tree when the caller explicitly asks for one via `root_group`).

Wherever constraints are currently read back and passed to `apply_constraints` (the `filter`/run method, reported at `selection_service.py:208-228`), change it to: load the study's `ConstraintGroup` rows (a single query, then assemble the tree in Python by `parent_group_id`) and the study's `SelectionConstraint` rows (already grouped by `group_id`), convert them into a `ConstraintGroupNode` tree, and call `apply_constraint_tree` instead of `apply_constraints`. This is the one place that must handle EVERY study, old and new, uniformly — a pre-M6 study's backfilled single root group must produce the exact same filtering result it did before this task, which `test_single_root_group_matches_flat_apply_constraints` (Task 7) already proves at the domain-function level; this step is where you prove the service layer wires it through without losing that equivalence.

- [ ] **Step 4: Tests**

Add to the selection API test file:

```python
def test_run_study_with_nested_constraint_groups(client, auth_headers, seeded_materials):
    payload = {
        ...,  # whatever base fields the existing "run a study" test payload already needs
        "root_group": {
            "operator": "AND",
            "constraints": [],
            "groups": [
                {"operator": "OR", "constraints": [<a constraint dict>, <another>], "groups": []},
                {"operator": "AND", "constraints": [<a constraint dict>], "groups": []},
            ],
        },
    }
    response = client.post("/api/selection/studies/run", json=payload, headers=auth_headers)
    assert response.status_code == 200


def test_flat_constraints_still_work_without_root_group(client, auth_headers, seeded_materials):
    # Backward compatibility: omitting root_group entirely must behave
    # exactly as it did before this task.
    payload = {..., "constraints": [<a constraint dict>], "combinator": "AND"}
    response = client.post("/api/selection/studies/run", json=payload, headers=auth_headers)
    assert response.status_code == 200
```

Adapt the constraint dict shape and base payload fields to whatever the existing test file's helpers already produce — read it first.

- [ ] **Step 5: Run tests, verify green; full backend gate; commit**

```bash
cd apps/api
.venv/bin/python -m pytest -k "nested_constraint or root_group or flat_constraints" -v
.venv/bin/python -m ruff check app && .venv/bin/python -m black --check app && .venv/bin/python -m pytest -q
git add apps/api/app/schemas/selection.py apps/api/app/services/selection_service.py apps/api/app/tests/
git commit -m "feat(selecao): grupos de restrição aninhados no schema e no serviço (M6)"
```

---

### Task 9: M6 — Frontend nested constraint-group editor

**Depends on:** Task 8 (schema/service must accept `root_group`).

**Files:**
- Modify: `apps/web/components/selection/ConstraintEditor.tsx`
- Modify: `apps/web/app/selecao/page.tsx` (wherever it currently builds the flat constraint payload)
- Modify: `packages/shared-types/index.ts` — add the `ConstraintGroupIn`-equivalent recursive type
- Test: whatever frontend test already covers `ConstraintEditor`

**Interfaces:**
- Consumes: Task 8's `root_group` field on the study payload.

- [ ] **Step 1: Read the current component**

Read `apps/web/components/selection/ConstraintEditor.tsx` in full (reported structure: `ConstraintRow` interface at lines 50-60, flat `<ol>` rendering at 103-243, `toConstraintPayload()` at 246-285) and `apps/web/app/selecao/page.tsx`'s constraint-related state before changing anything.

- [ ] **Step 2: Design the nested UI**

This is the plan's most open-ended UI task — the existing component is a flat `<ol>` of constraint rows with no grouping concept, and introducing visual nesting (indentation, an explicit AND/OR toggle per group, add/remove group controls) is a real design surface, not a mechanical port. Scope this task narrowly and honestly:

- Represent the editor's internal state as a tree mirroring `ConstraintGroupIn` (operator, constraints, child groups), with the existing flat `ConstraintRow` becoming exactly one constraint inside some group.
- The root group's operator picker replaces today's page-level global "AND"/"OR" combinator picker (find it in `page.tsx`, likely near where `ConstraintEditor` is rendered) — moving that control from the page into the editor component itself, since operator is now a per-group property, not a study-level one.
- "Adicionar grupo" (add group) and "Adicionar restrição" (add constraint) become two distinct actions at any nesting level, each visually indented one level deeper than its parent group; a group's own AND/OR is a small toggle at its top-left corner, matching the visual weight of "abrir parêntese" — literal parentheses characters or a bracket/border are both reasonable, pick whichever reads more clearly against this project's existing card/border tokens (`border-edge-control` per D-34, since a group boundary is exactly the kind of "informação, não moldura" that rule is about).
- `toConstraintPayload()` becomes recursive, producing a `ConstraintGroupIn`-shaped tree instead of a flat array; the page sends it as `root_group` in the study payload (Task 8), no longer sending the old flat `constraints`/`combinator` pair.

- [ ] **Step 3: Implement, following the codebase's existing component patterns**

Build the nested editor as new sub-components inside `ConstraintEditor.tsx` or as siblings in the same directory (match whatever this codebase already does for a component with meaningfully-different render modes — check if `ConstraintEditor.tsx` already delegates to a child component per-row, and follow that same decomposition one level deeper for a group). Add `ConstraintGroupIn`'s frontend-side type to `packages/shared-types/index.ts`, matching Task 8's backend schema field-for-field. Add any new PT-BR labels ("Adicionar grupo", "E", "OU", etc.) to `apps/web/lib/i18n.ts`.

- [ ] **Step 4: Tests**

Extend whatever test file already covers `ConstraintEditor` with at least: adding a nested group renders it indented under its parent; toggling a group's operator updates the payload's `operator` for that node, not a sibling's; `toConstraintPayload()`'s output for a two-level-nested tree matches the expected `ConstraintGroupIn` shape exactly (a golden-output test, comparing the built object to a hand-written expected tree).

- [ ] **Step 5: Manual verification, full frontend gate, commit**

```bash
cd apps/web && npm run typecheck && npm run lint && npm run test && npm run build
```
Start the dev server, build a nested constraint set on the selection page (e.g. two groups under an OR root, one with two ANDed constraints), run the study, and confirm the result set matches hand-checked expectations against the seeded/demo data. Stop the server.

```bash
git add apps/web/components/selection/ConstraintEditor.tsx apps/web/app/selecao/page.tsx \
  packages/shared-types/index.ts apps/web/lib/i18n.ts
git commit -m "feat(selecao): editor de grupos de restrição aninhados na interface (M6)"
```

---

### Task 10: M6 — Documentation

**Depends on:** Tasks 6-9 (describes what they built).

**Files:**
- Modify: `docs/04-metodologia-selecao.md`
- Modify: `docs/TODO.md` (move M6 out of "Média prioridade")

**Interfaces:** None — documentation only.

- [ ] **Step 1: Extend the methodology doc**

Read `docs/04-metodologia-selecao.md`'s section on constraint filtering (find it by searching for the existing AND/OR combinator's documentation). Add a subsection describing the nested-group model: constraints combine within a group by that group's own AND/OR, groups nest inside groups, and a pre-existing flat study is exactly a one-group tree with no children — no behavior changed for it. Include one worked example, e.g. `(rigidez > 100 OU densidade < 3) E classe = "metais"`, matching the doc's existing example style.

- [ ] **Step 2: Update TODO.md**

Move the M6 entry from "Média prioridade" to "Débitos já quitados", in the same style as the existing entries (file:function references, the backward-compatibility guarantee from the backfill migration, final test count). Note that "Média prioridade" is now empty, matching how the B1-B10 session's own entry noted "Baixa prioridade" becoming empty.

- [ ] **Step 3: Commit**

```bash
git add docs/04-metodologia-selecao.md docs/TODO.md
git commit -m "docs: documenta grupos de restrição aninhados (M6)"
```

## Final step (after all 10 tasks land)

Update `docs/PROJECT_CONTEXT.md` and the root `CLAUDE.md`'s "Estado atual" with the new backend/frontend test counts (re-run both suites' full count — do not guess). Add a `docs/CHANGELOG_SESSION.md` entry for this session following the existing per-session format, explicitly noting that M5 was implemented despite its "só se o orientador pedir" scope note, on the advisor's confirmed request.
