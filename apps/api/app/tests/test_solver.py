"""The Engineering Solver: masses, areas, refusals and what gets left out."""

from __future__ import annotations

import math

import pytest

from app.calculations.load_cases import by_key
from app.calculations.solver import SolverError, solve, structural_factors

_UNITS = {
    "densidade": "kg/m**3",
    "modulo_young": "Pa",
    "limite_escoamento": "Pa",
    "resistencia_tracao": "Pa",
}

_ALUMINIO = (1, "Alumínio 6061", {"modulo_young": 69e9, "densidade": 2700.0})
_ACO = (2, "Aço 1020", {"modulo_young": 205e9, "densidade": 7870.0})
_SEM_MODULO = (3, "Sem módulo", {"densidade": 1200.0, "modulo_young": None})


def _solve_beam(records=None, **overrides):
    case = by_key("viga-rigidez")
    assert case is not None
    kwargs = {
        "index_expression": "sqrt(modulo_young) / densidade",
        "index_goal": "maximize",
        "index_variables": {"modulo_young", "densidade"},
        "inputs": {"rigidez": 2.0e5, "comprimento": 0.8, "constante_apoio": 48.0},
        "records": records if records is not None else [_ALUMINIO, _ACO],
        "property_units": _UNITS,
    }
    kwargs.update(overrides)
    return solve(case, **kwargs)


def test_the_mass_is_the_structural_factor_over_the_index() -> None:
    result = _solve_beam()
    aluminio = next(record for record in result.solved if record.record_id == 1)
    index = math.sqrt(69e9) / 2700.0
    assert aluminio.index_value == pytest.approx(index)
    assert aluminio.objective_value == pytest.approx(result.structural_factor / index)


def test_the_mass_matches_mechanics_computed_independently() -> None:
    result = _solve_beam()
    aluminio = next(record for record in result.solved if record.record_id == 1)
    area = math.sqrt(12 * 2.0e5 * 0.8**3 / (48.0 * 69e9))
    assert aluminio.free_value == pytest.approx(area, rel=1e-12)
    assert aluminio.objective_value == pytest.approx(area * 0.8 * 2700.0, rel=1e-12)


def test_the_lightest_ranks_first() -> None:
    result = _solve_beam()
    assert [record.record_id for record in result.solved] == [1, 2]
    assert [record.rank for record in result.solved] == [1, 2]
    assert result.solved[0].objective_value < result.solved[1].objective_value


def test_the_structural_factor_is_the_same_for_every_material() -> None:
    """It has no material term; one number per run is the whole point."""
    objective, free = structural_factors(
        by_key("viga-rigidez"),
        {"rigidez": 2.0e5, "comprimento": 0.8, "constante_apoio": 48.0},
    )
    assert objective == pytest.approx(math.sqrt(12 * 2.0e5 * 0.8**5 / 48.0))
    assert free == pytest.approx(math.sqrt(12 * 2.0e5 * 0.8**3 / 48.0))
    result = _solve_beam()
    assert result.structural_factor == pytest.approx(objective)
    assert result.free_structural_factor == pytest.approx(free)


def test_a_material_missing_a_property_is_excluded_and_named() -> None:
    """Principle 3: absence is never a zero, and never silent."""
    result = _solve_beam(records=[_ALUMINIO, _SEM_MODULO])
    assert [record.record_id for record in result.solved] == [1]
    assert len(result.excluded) == 1
    excluded = result.excluded[0]
    assert excluded.record_id == 3
    assert excluded.missing_keys == ["modulo_young"]
    assert "modulo_young" in excluded.reason


def test_an_absent_property_key_counts_as_missing_too() -> None:
    """A slug that never appears is as absent as one explicitly None."""
    result = _solve_beam(records=[(4, "Só densidade", {"densidade": 900.0})])
    assert result.solved == []
    assert result.excluded[0].missing_keys == ["modulo_young"]


def test_the_units_are_derived_not_declared() -> None:
    result = _solve_beam()
    assert result.objective_dimension == "[mass]"
    assert result.free_dimension == "[length] ** 2"
    assert result.objective_unit == "kg"
    assert result.free_unit == "m**2"


def test_a_minimize_index_is_refused_with_the_reason() -> None:
    with pytest.raises(SolverError, match="maximizar"):
        _solve_beam(index_goal="minimize")


def test_a_non_positive_input_is_refused_by_its_label() -> None:
    with pytest.raises(SolverError, match="Comprimento"):
        _solve_beam(inputs={"rigidez": 2.0e5, "comprimento": 0.0, "constante_apoio": 48.0})


def test_a_missing_design_variable_is_refused_by_name() -> None:
    with pytest.raises(SolverError, match="constante_apoio"):
        _solve_beam(inputs={"rigidez": 2.0e5, "comprimento": 0.8})


def test_a_non_positive_index_is_excluded_not_ranked() -> None:
    """A negative mass would be printed with the authority of a computed number."""
    result = _solve_beam(
        records=[(5, "Densidade negativa", {"modulo_young": 1.0, "densidade": -1.0})]
    )
    assert result.solved == []
    assert "não positivo" in result.excluded[0].reason


def test_the_limit_caps_the_answer_but_not_the_exclusions() -> None:
    records = [
        (index, f"Material {index:02d}", {"modulo_young": 1e9 * index, "densidade": 1000.0})
        for index in range(1, 8)
    ] + [_SEM_MODULO]
    result = _solve_beam(records=records, limit=3)
    assert len(result.solved) == 3
    assert len(result.excluded) == 1


def test_the_tie_case_solves_by_its_own_index() -> None:
    case = by_key("tirante-rigidez")
    assert case is not None
    result = solve(
        case,
        index_expression="modulo_young / densidade",
        index_goal="maximize",
        index_variables={"modulo_young", "densidade"},
        inputs={"rigidez": 1.0e6, "comprimento": 1.2},
        records=[_ALUMINIO],
        property_units=_UNITS,
    )
    area = 1.0e6 * 1.2 / 69e9
    assert result.solved[0].free_value == pytest.approx(area, rel=1e-12)
    assert result.solved[0].objective_value == pytest.approx(area * 1.2 * 2700.0, rel=1e-12)
