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
