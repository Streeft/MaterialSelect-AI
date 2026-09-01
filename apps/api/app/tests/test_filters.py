"""Tests for the pure constraint-evaluation domain."""

from __future__ import annotations

from app.domain.filters import (
    Constraint,
    ConstraintGroupNode,
    MaterialSnapshot,
    Operator,
    apply_constraint_tree,
    apply_constraints,
    evaluate_constraint,
)


def _snap(id_, name, class_slug, values, keywords=None):
    return MaterialSnapshot(
        id=id_,
        name=name,
        class_name=class_slug.title(),
        class_slug=class_slug,
        keywords=keywords or [],
        values=values,
    )


MATERIALS = [
    _snap(1, "Alumínio", "metais", {"densidade": 2700.0, "modulo_young": 69e9}, ["leve"]),
    _snap(2, "Aço", "metais", {"densidade": 7850.0, "modulo_young": 210e9}),
    _snap(3, "Polímero", "polimeros", {"densidade": 1050.0}),  # no modulo_young
]


def test_less_than_or_equal():
    c = Constraint(operator=Operator.LTE, property_slug="densidade", value=3000.0)
    passed = [m.name for m in MATERIALS if evaluate_constraint(c, m)]
    assert passed == ["Alumínio", "Polímero"]


def test_numeric_constraint_excludes_missing_property():
    # Polímero has no modulo_young -> cannot satisfy a numeric constraint on it.
    c = Constraint(operator=Operator.GTE, property_slug="modulo_young", value=1.0)
    assert evaluate_constraint(c, MATERIALS[2]) is False


def test_between_and_outside():
    inside = Constraint(
        operator=Operator.BETWEEN, property_slug="densidade", value_min=2000.0, value_max=3000.0
    )
    assert evaluate_constraint(inside, MATERIALS[0]) is True
    assert evaluate_constraint(inside, MATERIALS[1]) is False
    outside = Constraint(
        operator=Operator.OUTSIDE, property_slug="densidade", value_min=2000.0, value_max=3000.0
    )
    assert evaluate_constraint(outside, MATERIALS[1]) is True


def test_exists_and_not_exists():
    exists = Constraint(operator=Operator.EXISTS, property_slug="modulo_young")
    assert [m.name for m in MATERIALS if evaluate_constraint(exists, m)] == ["Alumínio", "Aço"]
    not_exists = Constraint(operator=Operator.NOT_EXISTS, property_slug="modulo_young")
    assert [m.name for m in MATERIALS if evaluate_constraint(not_exists, m)] == ["Polímero"]


def test_class_filters():
    in_class = Constraint(operator=Operator.IN_CLASS, class_slugs=["metais"])
    assert [m.name for m in MATERIALS if evaluate_constraint(in_class, m)] == ["Alumínio", "Aço"]
    not_in = Constraint(operator=Operator.NOT_IN_CLASS, class_slugs=["metais"])
    assert [m.name for m in MATERIALS if evaluate_constraint(not_in, m)] == ["Polímero"]


def test_text_contains_searches_name_and_keywords():
    c = Constraint(operator=Operator.TEXT_CONTAINS, text="leve")
    assert [m.name for m in MATERIALS if evaluate_constraint(c, m)] == ["Alumínio"]


def test_and_funnel_is_cumulative():
    constraints = [
        Constraint(
            operator=Operator.LTE, label="ρ ≤ 3000", property_slug="densidade", value=3000.0
        ),
        Constraint(operator=Operator.EXISTS, label="E definido", property_slug="modulo_young"),
    ]
    result = apply_constraints(MATERIALS, constraints, "AND")
    assert result.initial_count == 3
    assert [s.remaining for s in result.steps] == [2, 1]  # ρ filter -> 2, then E exists -> 1
    assert result.candidate_ids == [1]


def test_or_combines_union():
    constraints = [
        Constraint(operator=Operator.IN_CLASS, class_slugs=["polimeros"]),
        Constraint(operator=Operator.GTE, property_slug="modulo_young", value=200e9),
    ]
    result = apply_constraints(MATERIALS, constraints, "OR")
    assert set(result.candidate_ids) == {2, 3}  # Aço (E>=200G) or Polímero (class)


def test_no_constraints_returns_all():
    result = apply_constraints(MATERIALS, [], "AND")
    assert result.final_count == 3


def test_all_eliminated():
    c = [Constraint(operator=Operator.LT, property_slug="densidade", value=1.0)]
    result = apply_constraints(MATERIALS, c, "AND")
    assert result.final_count == 0


# Helpers for tree-based constraint tests
def _constraint(
    property_slug, operator_str, value=None, value_min=None, value_max=None, class_slugs=None
):
    """Helper to create a Constraint with less boilerplate."""
    op_map = {
        "gt": Operator.GT,
        "gte": Operator.GTE,
        "lt": Operator.LT,
        "lte": Operator.LTE,
        "between": Operator.BETWEEN,
        "outside": Operator.OUTSIDE,
        "exists": Operator.EXISTS,
        "not_exists": Operator.NOT_EXISTS,
        "in_class": Operator.IN_CLASS,
        "not_in_class": Operator.NOT_IN_CLASS,
        "text_contains": Operator.TEXT_CONTAINS,
    }
    return Constraint(
        operator=op_map[operator_str],
        property_slug=property_slug,
        value=value,
        value_min=value_min,
        value_max=value_max,
        class_slugs=class_slugs or [],
    )


def _material(name, class_slug="metais", **values):
    """Helper to create a MaterialSnapshot with less boilerplate."""
    return _snap(
        id_=hash(name) % 10000,
        name=name,
        class_slug=class_slug,
        values=values,
    )


def test_nested_group_and_of_or():
    # (densidade < 3000 OR densidade > 7000) AND (density exists)
    # Material A: densidade=2700.0 (passes left OR via first condition) -> True
    # Material B: densidade=7850.0 (passes left OR via second condition) -> True
    # Material C: densidade=1050.0 (passes left OR via first condition) -> True
    # So we add another constraint to differentiate: only metais pass
    # Final: (densidade < 3000 OR densidade > 7000) AND (class in metais)
    # Material A (metais, 2700): passes left OR, passes right AND -> True
    # Material B (metais, 7850): passes left OR, passes right AND -> True
    # Material C (polimeros, 1050): passes left OR, fails right AND -> False
    left = ConstraintGroupNode(
        operator="OR",
        constraints=[
            _constraint("densidade", "lt", 3000),
            _constraint("densidade", "gt", 7000),
        ],
        children=[],
    )
    right = ConstraintGroupNode(
        operator="AND",
        constraints=[Constraint(operator=Operator.IN_CLASS, class_slugs=["metais"])],
        children=[],
    )
    root = ConstraintGroupNode(operator="AND", constraints=[], children=[left, right])

    materials = [
        _snap(1, "A", "metais", {"densidade": 2700.0}),
        _snap(2, "B", "metais", {"densidade": 7850.0}),
        _snap(3, "C", "polimeros", {"densidade": 1050.0}),
    ]
    passing = apply_constraint_tree(materials, root)
    assert {m.name for m in passing} == {"A", "B"}


def test_single_root_group_matches_flat_apply_constraints():
    # A root group with no children and a flat constraint list must behave
    # identically to the existing apply_constraints — this is the backward-
    # compatibility guarantee the Task 6 migration's backfill depends on.
    constraints = [_constraint("densidade", "lte", 3000.0)]
    materials = [
        _snap(1, "A", "metais", {"densidade": 2700.0}),
        _snap(2, "B", "metais", {"densidade": 7850.0}),
    ]
    root_and = ConstraintGroupNode(operator="AND", constraints=constraints, children=[])

    tree_passing = {m.id for m in apply_constraint_tree(materials, root_and)}
    flat_passing = set(apply_constraints(materials, constraints, "AND").candidate_ids)

    assert tree_passing == flat_passing


def test_deeply_nested_group():
    # (A AND (B OR (C AND D)))
    innermost = ConstraintGroupNode(
        operator="AND",
        constraints=[
            _constraint("modulo_young", "gt", 0),
            _constraint("modulo_young", "gt", 0),
        ],
        children=[],
    )
    mid = ConstraintGroupNode(
        operator="OR",
        constraints=[_constraint("class_slug", "in_class", class_slugs=["metais"])],
        children=[innermost],
    )
    root = ConstraintGroupNode(
        operator="AND",
        constraints=[_constraint("densidade", "gt", 0)],
        children=[mid],
    )
    # Just confirm this evaluates without error and returns a subset of the input
    materials = [
        _snap(1, "Alumínio", "metais", {"densidade": 2700.0, "modulo_young": 69e9}),
        _snap(2, "Aço", "metais", {"densidade": 7850.0, "modulo_young": 210e9}),
        _snap(3, "Polímero", "polimeros", {"densidade": 1050.0}),
    ]
    result = apply_constraint_tree(materials, root)
    assert isinstance(result, list)
    assert len(result) <= len(materials)
