"""The load-case catalogue: its algebra, its units and its links to the catalogue.

These tests are the reason a new load case can be added safely. The derivation
in the docstring of ``load_cases`` is prose; the four proofs here are what stop
prose and code from drifting apart:

* the structural half never names a material property (namespace purity);
* the factorisation is dimensionally sound — mass really comes out in kilograms;
* every case points at an index that exists in the seeded catalogue and can be
  inverted (``maximize``);
* the factorisation agrees, to floating-point tolerance, with the closed form
  computed straight from mechanics — an independent implementation of the same
  physics, which is what makes this a check rather than a restatement.
"""

from __future__ import annotations

import math

import pytest

from app.calculations.expressions import evaluate, result_dimension, variables_in
from app.calculations.load_cases import LOAD_CASES, by_key
from app.calculations.units import ureg
from app.db.seed import PERFORMANCE_INDICES, PROPERTIES

_INDEX_BY_SLUG = {index["slug"]: index for index in PERFORMANCE_INDICES}
_PROPERTY_UNITS = {prop["slug"]: prop["canonical_unit"] for prop in PROPERTIES}


def test_the_catalogue_is_not_empty() -> None:
    """A sweep over an empty catalogue passes while proving nothing."""
    assert len(LOAD_CASES) >= 7


@pytest.mark.parametrize("case", LOAD_CASES, ids=lambda case: case.key)
def test_structural_expressions_name_only_design_variables(case) -> None:
    """The two namespaces must not mix, or a design input could shadow a property."""
    for expression in (case.objective_structural, case.free_structural):
        assert variables_in(expression) <= case.variable_keys
    assert not (case.variable_keys & set(_PROPERTY_UNITS))


@pytest.mark.parametrize("case", LOAD_CASES, ids=lambda case: case.key)
def test_material_expression_names_only_properties(case) -> None:
    assert variables_in(case.free_material) <= set(_PROPERTY_UNITS)


@pytest.mark.parametrize("case", LOAD_CASES, ids=lambda case: case.key)
def test_every_case_points_at_a_seeded_index_that_can_be_inverted(case) -> None:
    """A case whose index is absent would offer a flow that dead-ends."""
    index = _INDEX_BY_SLUG.get(case.index_slug)
    assert index is not None, f"{case.key} aponta para índice inexistente"
    assert index["goal"] == "maximize"


def _dimension_of(unit: str) -> str:
    """The dimension a declared unit stands for — what the algebra must produce."""
    return str(ureg.Quantity(1.0, unit).dimensionality)


@pytest.mark.parametrize("case", LOAD_CASES, ids=lambda case: case.key)
def test_the_objective_comes_out_in_the_unit_the_case_declares(case) -> None:
    """Mass = structural factor / index. If the algebra slips, so does the dimension.

    The expectation is read from ``objective_unit`` rather than hard-coded, so a
    case that declares one unit and derives another fails here — which is the
    only way a wrong exponent in a new derivation gets caught before a reader
    sees a number in kilograms that is not one.
    """
    index = _INDEX_BY_SLUG[case.index_slug]
    units = {**case.design_units, **_PROPERTY_UNITS}
    dimension = result_dimension(f"({case.objective_structural}) / ({index['expression']})", units)
    assert dimension == _dimension_of(case.objective_unit) == "[mass]"


@pytest.mark.parametrize("case", LOAD_CASES, ids=lambda case: case.key)
def test_the_free_variable_comes_out_in_the_unit_the_case_declares(case) -> None:
    """Area for a section, length for a plate thickness — the case says which."""
    units = {**case.design_units, **_PROPERTY_UNITS}
    dimension = result_dimension(f"({case.free_structural}) * ({case.free_material})", units)
    assert dimension == _dimension_of(case.free_unit)


@pytest.mark.parametrize("case", LOAD_CASES, ids=lambda case: case.key)
def test_every_case_writes_its_derivation_out(case) -> None:
    """The number has to be re-derivable by hand from what the screen shows."""
    assert len(case.derivation) >= 4
    assert case.reference


@pytest.mark.parametrize("case", LOAD_CASES, ids=lambda case: case.key)
def test_support_conditions_fill_a_variable_of_their_own_case(case) -> None:
    for support in case.supports:
        assert support.variable_key in case.variable_keys
        assert support.value > 0


def test_by_key_finds_and_misses() -> None:
    assert by_key("viga-rigidez") is not None
    assert by_key("nao-existe") is None


# --- the factorisation against closed-form mechanics -----------------------
#
# Each check below recomputes the mass straight from the constraint equation —
# solve for the area, then m = A·L·ρ — and compares it with
# structural factor / index. Two independent routes to one number.

_E = 70e9  # Pa
_RHO = 2700.0  # kg/m**3
_SIGMA = 250e6  # Pa


def _factorised(case_key: str, inputs: dict[str, float], properties: dict[str, float]) -> float:
    case = by_key(case_key)
    assert case is not None
    index = _INDEX_BY_SLUG[case.index_slug]
    structural = evaluate(case.objective_structural, inputs)
    index_value = evaluate(
        index["expression"], {k: properties[k] for k in variables_in(index["expression"])}
    )
    return structural / index_value


def test_tie_stiffness_matches_the_closed_form() -> None:
    stiffness, length = 1.0e6, 1.2
    area = stiffness * length / _E
    expected = area * length * _RHO
    got = _factorised(
        "tirante-rigidez",
        {"rigidez": stiffness, "comprimento": length},
        {"modulo_young": _E, "densidade": _RHO},
    )
    assert got == pytest.approx(expected, rel=1e-12)


def test_tie_strength_matches_the_closed_form() -> None:
    load, length = 5.0e4, 2.0
    area = load / _SIGMA
    expected = area * length * _RHO
    got = _factorised(
        "tirante-resistencia",
        {"carga": load, "comprimento": length},
        {"resistencia_tracao": _SIGMA, "densidade": _RHO},
    )
    assert got == pytest.approx(expected, rel=1e-12)


def test_beam_stiffness_matches_the_closed_form() -> None:
    stiffness, length, constant = 2.0e5, 0.8, 48.0
    area = math.sqrt(12 * stiffness * length**3 / (constant * _E))
    expected = area * length * _RHO
    got = _factorised(
        "viga-rigidez",
        {"rigidez": stiffness, "comprimento": length, "constante_apoio": constant},
        {"modulo_young": _E, "densidade": _RHO},
    )
    assert got == pytest.approx(expected, rel=1e-12)


def test_beam_strength_matches_the_closed_form() -> None:
    moment, length = 900.0, 1.5
    area = (6 * moment / _SIGMA) ** (2 / 3)
    expected = area * length * _RHO
    got = _factorised(
        "viga-resistencia",
        {"momento": moment, "comprimento": length},
        {"limite_escoamento": _SIGMA, "densidade": _RHO},
    )
    assert got == pytest.approx(expected, rel=1e-12)


def test_column_buckling_matches_the_closed_form() -> None:
    load, length, fixity = 3.0e4, 2.5, 1.0
    area = math.sqrt(12 * load * length**2 / (fixity * math.pi**2 * _E))
    expected = area * length * _RHO
    got = _factorised(
        "coluna-flambagem",
        {"carga": load, "comprimento": length, "constante_flambagem": fixity},
        {"modulo_young": _E, "densidade": _RHO},
    )
    assert got == pytest.approx(expected, rel=1e-9)


def test_beam_and_column_share_one_index_on_purpose() -> None:
    """Both are elastic constraints with the area entering squared — same grouping."""
    beam = by_key("viga-rigidez")
    column = by_key("coluna-flambagem")
    assert beam is not None and column is not None
    assert beam.index_slug == column.index_slug == "viga-leve-rigidez"


def test_the_plate_case_frees_a_thickness_not_an_area() -> None:
    """The free variable is whatever the geometry leaves open, and it is declared."""
    plate = by_key("placa-rigidez")
    beam = by_key("viga-rigidez")
    assert plate is not None and beam is not None
    assert plate.free_unit == "m"
    assert beam.free_unit == "m**2"


def test_plate_stiffness_matches_the_closed_form() -> None:
    stiffness, length, width, constant = 5.0e4, 0.6, 0.3, 48.0
    thickness = (12 * stiffness * length**3 / (constant * _E * width)) ** (1 / 3)
    expected = width * length * thickness * _RHO
    got = _factorised(
        "placa-rigidez",
        {
            "rigidez": stiffness,
            "comprimento": length,
            "largura": width,
            "constante_apoio": constant,
        },
        {"modulo_young": _E, "densidade": _RHO},
    )
    assert got == pytest.approx(expected, rel=1e-9)


def test_axial_yield_matches_the_closed_form() -> None:
    load, length = 2.0e4, 0.9
    area = load / _SIGMA
    expected = area * length * _RHO
    got = _factorised(
        "tirante-escoamento",
        {"carga": load, "comprimento": length},
        {"limite_escoamento": _SIGMA, "densidade": _RHO},
    )
    assert got == pytest.approx(expected, rel=1e-12)


def test_every_seeded_index_is_reachable_through_some_load_case() -> None:
    """An index the Finder cannot reach is a flow that dead-ends in the catalogue."""
    reachable = {case.index_slug for case in LOAD_CASES}
    reachable |= {case.cost_index_slug for case in LOAD_CASES}
    assert reachable == set(_INDEX_BY_SLUG)


# --- the cost twin (D-65) --------------------------------------------------
#
# One derivation, read twice. The claims below are the whole of that: the cost
# index is the mass index with ρ·Cm in place of ρ, the structural factor does
# not move, and therefore the cost of the part is its mass times the cost of a
# kilogram. Nothing here re-authors an expression — each check evaluates the two
# catalogued indices against the same numbers and compares the results, so a
# mistyped twin in the seed fails here rather than on a reader's screen.

_CUSTO = 8.4  # monetary units per kg; any positive number proves the relation


@pytest.mark.parametrize("case", LOAD_CASES, ids=lambda case: case.key)
def test_every_case_points_at_a_seeded_cost_index_that_can_be_inverted(case) -> None:
    index = _INDEX_BY_SLUG.get(case.cost_index_slug)
    assert index is not None, f"{case.key} aponta para índice de custo inexistente"
    assert index["goal"] == "maximize"


@pytest.mark.parametrize("case", LOAD_CASES, ids=lambda case: case.key)
def test_the_cost_index_is_the_mass_index_divided_by_the_cost_of_a_kilogram(case) -> None:
    """The swap is ρ → ρ·Cm and nothing else, which is why one factor serves both."""
    properties = {
        "modulo_young": _E,
        "densidade": _RHO,
        "limite_escoamento": _SIGMA,
        "resistencia_tracao": _SIGMA * 1.3,
        "custo_massa": _CUSTO,
    }
    mass_index = _INDEX_BY_SLUG[case.index_slug]["expression"]
    cost_index = _INDEX_BY_SLUG[case.cost_index_slug]["expression"]
    # The cost expression must reference Cm; without it this comparison would
    # pass on a twin that is simply a copy of the mass index.
    assert "custo_massa" in variables_in(cost_index)
    mass_value = evaluate(mass_index, {k: properties[k] for k in variables_in(mass_index)})
    cost_value = evaluate(cost_index, {k: properties[k] for k in variables_in(cost_index)})
    assert cost_value == pytest.approx(mass_value / _CUSTO, rel=1e-12)


@pytest.mark.parametrize("case", LOAD_CASES, ids=lambda case: case.key)
def test_the_cost_objective_comes_out_with_the_dimension_of_a_mass(case) -> None:
    """Not a defect: money is in no unit system, so Pint cannot tell the two apart.

    ``custo_massa`` is catalogued as dimensionless on purpose, so the derived
    dimension proves the *algebra* of the cost twin and says nothing about what
    the answer is denominated in. That is why the solver names the objective in
    words and carries ``objective_note`` — see ``app.calculations.solver``.
    """
    index = _INDEX_BY_SLUG[case.cost_index_slug]
    units = {**case.design_units, **_PROPERTY_UNITS}
    dimension = result_dimension(f"({case.objective_structural}) / ({index['expression']})", units)
    assert dimension == "[mass]"


def test_the_cost_of_the_part_is_its_mass_times_the_cost_of_a_kilogram() -> None:
    """The reader-facing consequence, on one case, end to end."""
    inputs = {"rigidez": 1.0e6, "comprimento": 1.2}
    case = by_key("tirante-rigidez")
    assert case is not None
    structural = evaluate(case.objective_structural, inputs)
    properties = {"modulo_young": _E, "densidade": _RHO, "custo_massa": _CUSTO}

    def value(slug: str) -> float:
        expression = _INDEX_BY_SLUG[slug]["expression"]
        return evaluate(expression, {k: properties[k] for k in variables_in(expression)})

    mass = structural / value(case.index_slug)
    cost = structural / value(case.cost_index_slug)
    assert cost == pytest.approx(mass * _CUSTO, rel=1e-12)


def test_index_slug_for_refuses_an_objective_the_case_does_not_have() -> None:
    """A caller never names an index, so an unknown objective has no fallback."""
    case = by_key("tirante-rigidez")
    assert case is not None
    with pytest.raises(ValueError):
        case.index_slug_for("carbono")
    with pytest.raises(ValueError):
        case.objective_label_for("carbono")
