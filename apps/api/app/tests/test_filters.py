"""Tests for the pure constraint-evaluation domain."""

from __future__ import annotations

from app.domain.filters import (
    Constraint,
    MaterialSnapshot,
    Operator,
    apply_constraints,
    evaluate_constraint,
)


def _snap(id_, name, class_slug, values, keywords=None):
    return MaterialSnapshot(
        id=id_, name=name, class_name=class_slug.title(), class_slug=class_slug,
        keywords=keywords or [], values=values,
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
    inside = Constraint(operator=Operator.BETWEEN, property_slug="densidade", value_min=2000.0, value_max=3000.0)
    assert evaluate_constraint(inside, MATERIALS[0]) is True
    assert evaluate_constraint(inside, MATERIALS[1]) is False
    outside = Constraint(operator=Operator.OUTSIDE, property_slug="densidade", value_min=2000.0, value_max=3000.0)
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
        Constraint(operator=Operator.LTE, label="ρ ≤ 3000", property_slug="densidade", value=3000.0),
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
