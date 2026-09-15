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


# --- the cost objective (D-65) ---------------------------------------------
#
# The arithmetic does not change: the caller hands over the cost twin of the
# index and the same structural factor divides by it. What changes is what the
# answer *is*, and the tests below are about saying so — the unit, the note, and
# the ordering, which is the only observable difference in the numbers.

_CUSTO_UNITS = {**_UNITS, "custo_massa": "dimensionless"}
_COST_EXPRESSION = "sqrt(modulo_young) / (densidade * custo_massa)"
#: Aluminium is lighter and dearer; steel is heavier and cheap. The pair exists
#: so that the two objectives cannot agree by accident.
_ALUMINIO_CARO = (
    1,
    "Alumínio 6061",
    {"modulo_young": 69e9, "densidade": 2700.0, "custo_massa": 12.0},
)
_ACO_BARATO = (2, "Aço 1020", {"modulo_young": 205e9, "densidade": 7870.0, "custo_massa": 1.2})


def _solve_beam_cost(records=None, **overrides):
    return _solve_beam(
        records=records if records is not None else [_ALUMINIO_CARO, _ACO_BARATO],
        index_expression=_COST_EXPRESSION,
        index_variables={"modulo_young", "densidade", "custo_massa"},
        property_units=_CUSTO_UNITS,
        objective="custo",
        **overrides,
    )


def test_the_cost_is_the_same_structural_factor_over_the_cost_index() -> None:
    mass = _solve_beam(records=[_ALUMINIO_CARO])
    cost = _solve_beam_cost(records=[_ALUMINIO_CARO])
    # The factor is geometry and load; it cannot know which objective ran.
    assert cost.structural_factor == pytest.approx(mass.structural_factor)
    assert cost.free_structural_factor == pytest.approx(mass.free_structural_factor)
    assert cost.solved[0].objective_value == pytest.approx(
        mass.solved[0].objective_value * 12.0, rel=1e-12
    )


def test_the_free_variable_does_not_move_with_the_objective() -> None:
    """The section area is geometry: asking about money does not resize the part."""
    mass = _solve_beam(records=[_ALUMINIO_CARO])
    cost = _solve_beam_cost(records=[_ALUMINIO_CARO])
    assert cost.solved[0].free_value == pytest.approx(mass.solved[0].free_value, rel=1e-12)


def test_the_cheapest_ranks_first_and_it_is_not_the_lightest() -> None:
    """If the two objectives ordered alike, the item would be answering nothing."""
    assert [
        record.record_id for record in _solve_beam(records=[_ALUMINIO_CARO, _ACO_BARATO]).solved
    ] == [1, 2]
    assert [record.record_id for record in _solve_beam_cost().solved] == [2, 1]


def test_a_cost_answer_says_what_it_is_denominated_in() -> None:
    """Money is in no unit system, so the unit is a sentence, never a symbol."""
    result = _solve_beam_cost()
    assert result.objective == "custo"
    assert result.objective_unit == "unidade monetária não especificada"
    assert "R$" not in result.objective_unit


def test_a_cost_answer_explains_why_its_dimension_reads_as_a_mass() -> None:
    """The derived dimension proves the algebra and does not name the answer."""
    result = _solve_beam_cost()
    assert result.objective_dimension == "[mass]"
    assert result.objective_note is not None
    assert "adimensional" in result.objective_note


def test_a_mass_answer_carries_no_note() -> None:
    """The note exists to disown a dimension; a mass run has nothing to disown."""
    result = _solve_beam()
    assert result.objective == "massa"
    assert result.objective_note is None


def test_the_exclusion_reason_does_not_promise_a_mass_on_a_cost_run() -> None:
    result = _solve_beam_cost(
        records=[
            (5, "Custo negativo", {"modulo_young": 1.0, "densidade": 1.0, "custo_massa": -1.0})
        ]
    )
    assert result.solved == []
    assert "o custo seria negativo" in result.excluded[0].reason


def test_a_material_without_a_catalogued_cost_is_excluded_and_named() -> None:
    """Principle 3 again: no catalogued price is not a price of zero."""
    result = _solve_beam_cost(
        records=[_ACO_BARATO, (6, "Sem custo", {"modulo_young": 1e11, "densidade": 2000.0})]
    )
    assert [record.record_id for record in result.solved] == [2]
    assert result.excluded[0].missing_keys == ["custo_massa"]


def test_an_unknown_objective_is_refused_rather_than_treated_as_a_mass() -> None:
    with pytest.raises(SolverError, match="Objetivo desconhecido"):
        _solve_beam(objective="carbono")
