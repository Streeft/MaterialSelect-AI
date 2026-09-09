"""Tests for the pure constraint-evaluation domain."""

from __future__ import annotations

from app.domain.filters import (
    Constraint,
    ConstraintGroupNode,
    MaterialSnapshot,
    Operator,
    SelectionStageNode,
    TreeSelection,
    apply_constraint_tree,
    apply_constraints,
    apply_stage,
    apply_stages,
    evaluate_constraint,
    matches_tree,
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


# --- Tree selection (P0-1): a folder carries its descendants ---------------


def _tree_snap(id_, name, class_path):
    """A snapshot whose class lineage is known — root→leaf, own slug last."""
    return MaterialSnapshot(
        id=id_,
        name=name,
        class_name=class_path[-1].title(),
        class_slug=class_path[-1],
        keywords=[],
        values={},
        class_path=list(class_path),
    )


TAXONOMY = [
    _tree_snap(1, "Aço 1020", ["metais", "acos", "acos_carbono"]),
    _tree_snap(2, "Aço inox 304", ["metais", "acos", "acos_inoxidaveis"]),
    _tree_snap(3, "Alumínio 6061", ["metais", "ligas_leves"]),
    _tree_snap(4, "PEAD", ["polimeros", "termoplasticos"]),
]


def test_lineage_falls_back_to_own_class_when_ancestry_unknown():
    # Every snapshot built before P0-1 has no class_path. It must still be
    # matchable by its own class — absent ancestry is absent, not an empty set
    # that matches nothing.
    m = _snap(9, "Vidro", "ceramicas", {})
    assert m.class_lineage == ("ceramicas",)


def test_lineage_is_root_to_leaf_with_own_slug_last():
    assert TAXONOMY[0].class_lineage == ("metais", "acos", "acos_carbono")


def test_tree_selection_of_a_folder_includes_descendants():
    selection = TreeSelection(class_slugs=["acos"])
    passed = [m.name for m in TAXONOMY if matches_tree(m, selection)]
    assert passed == ["Aço 1020", "Aço inox 304"]


def test_tree_selection_of_the_root_folder_includes_the_whole_subtree():
    selection = TreeSelection(class_slugs=["metais"])
    passed = [m.name for m in TAXONOMY if matches_tree(m, selection)]
    assert passed == ["Aço 1020", "Aço inox 304", "Alumínio 6061"]


def test_tree_selection_without_descendants_is_exact_membership():
    # This is what the pre-P0-1 `in_class` constraint already did: ticking
    # "acos" alone admits nothing, because no material sits directly in it.
    selection = TreeSelection(class_slugs=["acos"], include_descendants=False)
    assert [m.name for m in TAXONOMY if matches_tree(m, selection)] == []

    selection = TreeSelection(class_slugs=["acos_carbono"], include_descendants=False)
    assert [m.name for m in TAXONOMY if matches_tree(m, selection)] == ["Aço 1020"]


def test_tree_selection_unions_several_folders():
    selection = TreeSelection(class_slugs=["ligas_leves", "polimeros"])
    passed = [m.name for m in TAXONOMY if matches_tree(m, selection)]
    assert passed == ["Alumínio 6061", "PEAD"]


def test_empty_tree_selection_imposes_no_restriction():
    # Same convention as an empty constraint group: nothing ticked is not
    # "nothing passes", it is "this stage does not narrow anything".
    selection = TreeSelection(class_slugs=[])
    assert [m.name for m in TAXONOMY if matches_tree(m, selection)] == [m.name for m in TAXONOMY]


def test_tree_selection_of_an_unknown_slug_admits_nothing():
    selection = TreeSelection(class_slugs=["inexistente"])
    assert [m.name for m in TAXONOMY if matches_tree(m, selection)] == []


# --- Stage pipeline (P0-1): ordered, individually disableable ---------------


def _limit_stage(*constraints, label=None, enabled=True, operator="AND"):
    return SelectionStageNode(
        kind="limit",
        label=label,
        enabled=enabled,
        root=ConstraintGroupNode(operator=operator, constraints=list(constraints), children=[]),
        tree=None,
    )


def _tree_stage(*slugs, label=None, enabled=True, include_descendants=True):
    return SelectionStageNode(
        kind="tree",
        label=label,
        enabled=enabled,
        root=None,
        tree=TreeSelection(class_slugs=list(slugs), include_descendants=include_descendants),
    )


PIPELINE_MATERIALS = [
    _tree_snap(1, "Aço 1020", ["metais", "acos"]),
    _tree_snap(2, "Alumínio 6061", ["metais", "ligas_leves"]),
    _tree_snap(3, "PEAD", ["polimeros", "termoplasticos"]),
]
# Give them one property each so a limit stage has something to bite on.
PIPELINE_MATERIALS[0].values["densidade"] = 7850.0
PIPELINE_MATERIALS[1].values["densidade"] = 2700.0
PIPELINE_MATERIALS[2].values["densidade"] = 950.0


def test_one_limit_stage_equals_applying_its_tree_directly():
    stage = _limit_stage(Constraint(operator=Operator.LTE, property_slug="densidade", value=3000.0))
    assert [m.name for m in apply_stages(PIPELINE_MATERIALS, [stage])] == [
        m.name for m in apply_constraint_tree(PIPELINE_MATERIALS, stage.root)
    ]


def test_stages_intersect_in_order():
    stages = [
        _tree_stage("metais"),
        _limit_stage(Constraint(operator=Operator.LTE, property_slug="densidade", value=3000.0)),
    ]
    assert [m.name for m in apply_stages(PIPELINE_MATERIALS, stages)] == ["Alumínio 6061"]


def test_a_disabled_stage_does_not_narrow():
    stages = [
        _tree_stage("metais"),
        _limit_stage(
            Constraint(operator=Operator.LTE, property_slug="densidade", value=3000.0),
            enabled=False,
        ),
    ]
    assert [m.name for m in apply_stages(PIPELINE_MATERIALS, stages)] == [
        "Aço 1020",
        "Alumínio 6061",
    ]


def test_disabling_every_stage_admits_everything():
    stages = [_tree_stage("metais", enabled=False), _limit_stage(enabled=False)]
    assert len(apply_stages(PIPELINE_MATERIALS, stages)) == len(PIPELINE_MATERIALS)


def test_no_stages_at_all_admits_everything():
    assert len(apply_stages(PIPELINE_MATERIALS, [])) == len(PIPELINE_MATERIALS)


def test_stage_order_does_not_change_the_result_only_the_funnel():
    # Intersection commutes; what the order changes is the story the funnel
    # tells, which the service builds, not this function.
    forward = [
        _tree_stage("metais"),
        _limit_stage(Constraint(operator=Operator.LT, property_slug="densidade", value=3000.0)),
    ]
    assert [m.name for m in apply_stages(PIPELINE_MATERIALS, forward)] == [
        m.name for m in apply_stages(PIPELINE_MATERIALS, list(reversed(forward)))
    ]


def test_a_tree_stage_with_nothing_ticked_does_not_narrow():
    assert len(apply_stages(PIPELINE_MATERIALS, [_tree_stage()])) == len(PIPELINE_MATERIALS)


def test_apply_stage_evaluates_one_stage_standalone():
    # What the funnel needs to answer "how many would this stage admit on its
    # own", independently of the ones before it.
    stage = _tree_stage("polimeros")
    assert [m.name for m in apply_stage(PIPELINE_MATERIALS, stage)] == ["PEAD"]
