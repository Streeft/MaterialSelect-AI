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
