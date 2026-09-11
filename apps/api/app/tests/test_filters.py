"""Tests for the pure constraint-evaluation domain."""

from __future__ import annotations

import pytest

from app.domain.filters import (
    Constraint,
    ConstraintGroupNode,
    MaterialSnapshot,
    Operator,
    ProcessReach,
    ProcessSelection,
    ProcessSnapshot,
    SelectionStageNode,
    TreeSelection,
    apply_constraint_tree,
    apply_constraints,
    apply_stage,
    apply_stages,
    evaluate_constraint,
    matches_linked_tree,
    matches_processes,
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


# --- Process selection (P0-2): the join into the process universe -----------


def _process_snap(id_, name, *processes):
    """A snapshot whose process side of the join is known.

    Each entry is ``(process_slug, class_path)`` — the process and the folders
    it sits in, root→leaf, which is what lets a folder pick its descendants
    without this module knowing the taxonomy.
    """
    return MaterialSnapshot(
        id=id_,
        name=name,
        class_name="Metais",
        class_slug="metais",
        keywords=[],
        values={},
        processes=[ProcessReach(slug, tuple(path)) for slug, path in processes],
    )


# A tiny process universe: two families, one of them with a sub-folder.
#
#   conformacao ── conformacao_liquido ── fundicao-areia
#                └─ conformacao_solido ─── forjamento
#   uniao ─────────────────────────────── solda-mig
UNIVERSE = [
    _process_snap(
        1,
        "Aço 1020",
        ("fundicao-areia", ["conformacao", "conformacao_liquido"]),
        ("solda-mig", ["uniao"]),
    ),
    _process_snap(2, "Alumínio 6061", ("forjamento", ["conformacao", "conformacao_solido"])),
    _process_snap(3, "PEAD", ("injecao", ["conformacao", "conformacao_liquido"])),
    # No process linked at all — the fourth state of the data, not a zero.
    _process_snap(4, "Vidro sodo-cálcico"),
]


def _passing(selection):
    return [m.name for m in UNIVERSE if matches_processes(m, selection)]


def test_a_picked_process_admits_the_materials_it_applies_to():
    assert _passing(ProcessSelection(process_slugs=["solda-mig"])) == ["Aço 1020"]


def test_picked_processes_are_any_of_not_all_of():
    # A material linked to only one of the two still passes: this is the union,
    # and "both" is expressed by two stages, which the pipeline intersects.
    selection = ProcessSelection(process_slugs=["solda-mig", "forjamento"])
    assert _passing(selection) == ["Aço 1020", "Alumínio 6061"]


def test_a_process_folder_includes_its_descendants():
    selection = ProcessSelection(process_class_slugs=["conformacao_liquido"])
    assert _passing(selection) == ["Aço 1020", "PEAD"]


def test_a_process_root_folder_includes_the_whole_family():
    selection = ProcessSelection(process_class_slugs=["conformacao"])
    assert _passing(selection) == ["Aço 1020", "Alumínio 6061", "PEAD"]


def test_a_process_folder_without_descendants_is_exact_membership():
    # "conformacao" holds no process directly — every one of them is filed in a
    # sub-folder — so ticking it without descendants admits nobody. Same shape
    # as the material tree stage, and the same reason.
    assert (
        _passing(ProcessSelection(process_class_slugs=["conformacao"], include_descendants=False))
        == []
    )
    assert _passing(
        ProcessSelection(process_class_slugs=["conformacao_solido"], include_descendants=False)
    ) == ["Alumínio 6061"]


def test_a_material_with_no_process_linked_never_passes_a_process_stage():
    # Same rule a numeric constraint follows: you cannot select on data you do
    # not have. Absence is not a silent pass, and it is not a zero either.
    assert "Vidro sodo-cálcico" not in _passing(
        ProcessSelection(process_class_slugs=["conformacao"])
    )
    assert "Vidro sodo-cálcico" not in _passing(ProcessSelection(process_slugs=["solda-mig"]))


def test_an_empty_process_selection_imposes_no_restriction():
    assert _passing(ProcessSelection()) == [m.name for m in UNIVERSE]


def test_an_unknown_process_slug_admits_nothing():
    assert _passing(ProcessSelection(process_slugs=["inexistente"])) == []
    assert _passing(ProcessSelection(process_class_slugs=["inexistente"])) == []


def test_processes_and_folders_union_within_one_stage():
    selection = ProcessSelection(
        process_slugs=["solda-mig"], process_class_slugs=["conformacao_solido"]
    )
    assert _passing(selection) == ["Aço 1020", "Alumínio 6061"]


def _process_stage(*, processes=(), folders=(), label=None, enabled=True, include_descendants=True):
    return SelectionStageNode(
        kind="process",
        label=label,
        enabled=enabled,
        processes=ProcessSelection(
            process_slugs=list(processes),
            process_class_slugs=list(folders),
            include_descendants=include_descendants,
        ),
    )


def test_apply_stage_runs_a_process_stage_standalone():
    stage = _process_stage(folders=["conformacao_liquido"])
    assert [m.name for m in apply_stage(UNIVERSE, stage)] == ["Aço 1020", "PEAD"]


def test_two_process_stages_intersect_into_all_of():
    # The claim ProcessSelection's docstring makes: "weldable AND forgeable" is
    # two stages, not a flag. Only a material linked to both survives.
    both = [_process_stage(processes=["solda-mig"]), _process_stage(folders=["conformacao"])]
    assert [m.name for m in apply_stages(UNIVERSE, both)] == ["Aço 1020"]


def test_a_disabled_process_stage_does_not_narrow():
    stages = [_process_stage(processes=["solda-mig"], enabled=False)]
    assert len(apply_stages(UNIVERSE, stages)) == len(UNIVERSE)


def test_a_process_stage_with_nothing_ticked_does_not_narrow():
    assert len(apply_stages(UNIVERSE, [_process_stage()])) == len(UNIVERSE)


def test_a_process_stage_with_no_selection_object_does_not_narrow():
    # Defensive, mirroring the tree stage: a node whose payload never got built
    # must not reject the catalogue.
    stage = SelectionStageNode(kind="process", label=None, enabled=True)
    assert len(apply_stage(UNIVERSE, stage)) == len(UNIVERSE)


# --- The process universe as the result (P0-3) --------------------------------


def _process(id_, name, class_path, *material_paths):
    """A process record: its own folder lineage, and the material lineages it serves."""
    return ProcessSnapshot(
        id=id_,
        name=name,
        class_name=class_path[-1].title(),
        class_slug=class_path[-1],
        class_path=list(class_path),
        material_paths=[tuple(p) for p in material_paths],
    )


#   conformacao ── liquido ── Injeção      → polimeros/termoplasticos
#               └─ solido  ── Forjamento   → metais/acos
#   uniao ─────────────────── Solda MIG    → metais/acos, metais/ligas_leves
#   uniao ─────────────────── Adesivagem   → (nenhum material)
PROCESSES = [
    _process(1, "Injeção", ["conformacao", "liquido"], ["polimeros", "termoplasticos"]),
    _process(2, "Forjamento", ["conformacao", "solido"], ["metais", "acos"]),
    _process(3, "Solda MIG", ["uniao"], ["metais", "acos"], ["metais", "ligas_leves"]),
    _process(4, "Adesivagem", ["uniao"]),
]


def _serving(selection):
    return [p.name for p in PROCESSES if matches_linked_tree(p.material_paths, selection)]


def test_a_material_folder_keeps_the_processes_that_serve_it():
    assert _serving(TreeSelection(class_slugs=["metais"])) == ["Forjamento", "Solda MIG"]


def test_a_material_leaf_folder_is_exact():
    assert _serving(TreeSelection(class_slugs=["termoplasticos"])) == ["Injeção"]


def test_linked_folders_are_any_of_not_all_of():
    # Solda MIG serves aços *and* ligas leves; Forjamento only aços. Picking both
    # folders keeps a process that serves either.
    selection = TreeSelection(class_slugs=["acos", "ligas_leves"])
    assert _serving(selection) == ["Forjamento", "Solda MIG"]


def test_without_descendants_a_material_folder_means_its_own_leaf():
    # No material sits directly in "metais" — they are all in leaves — so ticking
    # it without descendants admits no process at all.
    assert _serving(TreeSelection(class_slugs=["metais"], include_descendants=False)) == []
    assert _serving(TreeSelection(class_slugs=["acos"], include_descendants=False)) == [
        "Forjamento",
        "Solda MIG",
    ]


def test_a_process_that_serves_no_material_never_passes():
    # Same rule as everywhere: you cannot select on data you do not have.
    assert "Adesivagem" not in _serving(TreeSelection(class_slugs=["metais", "polimeros"]))


def test_an_empty_material_selection_does_not_narrow():
    assert _serving(TreeSelection()) == [p.name for p in PROCESSES]


def test_an_unknown_material_folder_admits_nothing():
    assert _serving(TreeSelection(class_slugs=["inexistente"])) == []


def _material_stage(*slugs, enabled=True, include_descendants=True):
    return SelectionStageNode(
        kind="material",
        label=None,
        enabled=enabled,
        materials=TreeSelection(class_slugs=list(slugs), include_descendants=include_descendants),
    )


def _process_tree_stage(*slugs):
    """A tree stage in a process study selects folders of the *process* taxonomy."""
    return SelectionStageNode(
        kind="tree", label=None, enabled=True, tree=TreeSelection(class_slugs=list(slugs))
    )


def test_a_tree_stage_walks_the_process_taxonomy_in_a_process_study():
    # The same `matches_tree` that walks the material taxonomy in a material
    # study — the record's own lineage is what it reads, whichever universe.
    stage = _process_tree_stage("conformacao")
    assert [p.name for p in apply_stage(PROCESSES, stage)] == ["Injeção", "Forjamento"]


def test_the_manual_exercise_11_shape_runs_end_to_end():
    """Process Universe, narrowed to a family, then to the material folder —
    the pipeline of the manual's exercise 11, steps 1 and 3."""
    stages = [_process_tree_stage("uniao"), _material_stage("metais")]
    assert [p.name for p in apply_stages(PROCESSES, stages)] == ["Solda MIG"]


def test_a_disabled_material_stage_does_not_narrow():
    assert len(apply_stages(PROCESSES, [_material_stage("metais", enabled=False)])) == len(
        PROCESSES
    )


def test_a_material_stage_with_nothing_ticked_does_not_narrow():
    assert len(apply_stages(PROCESSES, [_material_stage()])) == len(PROCESSES)


def test_a_material_stage_over_materials_fails_loudly():
    """A wiring bug, not a user input: the silent alternative — "links to
    nothing", so nothing passes — reads exactly like a legitimately empty
    result."""
    with pytest.raises(TypeError, match="process study"):
        apply_stage(PIPELINE_MATERIALS, _material_stage("metais"))


def test_the_record_base_gives_both_universes_the_same_lineage_rule():
    # A process with no ancestry is matchable by its own class alone — the same
    # fallback a material has.
    lone = ProcessSnapshot(id=9, name="Solda", class_name="União", class_slug="uniao")
    assert lone.class_lineage == ("uniao",)
    assert matches_tree(lone, TreeSelection(class_slugs=["uniao"]))


# --- P0-4: capability envelopes and discrete labels ------------------------
#
# The two shapes of datum a process attribute brought. What is under test here is
# not "does the comparison work" but "does it answer the right question": an
# envelope compared by its midpoint quietly rejects capability the record has,
# and a label compared by a numeric operator has no meaning at all.


def _process(id_, name, *, values=None, envelopes=None, labels=None, class_slug="conformacao"):
    return ProcessSnapshot(
        id=id_,
        name=name,
        class_name=class_slug.title(),
        class_slug=class_slug,
        values=values or {},
        envelopes=envelopes or {},
        labels=labels or {},
    )


def test_a_threshold_is_met_when_the_envelope_reaches_it() -> None:
    """0,1–10 kg meets "≥ 5 kg" — the whole point of the envelope rule."""
    process = _process(1, "Moldagem", envelopes={"faixa-massa": (0.1, 10.0)})
    constraint = Constraint(operator=Operator.GTE, property_slug="faixa-massa", value=5.0)

    assert evaluate_constraint(constraint, process) is True


def test_the_midpoint_rule_would_have_rejected_a_reachable_envelope() -> None:
    """The regression this rule exists for, stated as a comparison.

    A 0,1–4 kg envelope reaches 3 kg, so it passes "≥ 3 kg". Its midpoint is
    2,05, which does not — which is exactly the wrong answer a collapsed
    representative point produces.
    """
    process = _process(1, "Fundição", envelopes={"faixa-massa": (0.1, 4.0)})
    midpoint = (0.1 + 4.0) / 2.0
    assert midpoint < 3.0  # the collapsed value fails...

    constraint = Constraint(operator=Operator.GTE, property_slug="faixa-massa", value=3.0)
    assert evaluate_constraint(constraint, process) is True  # ...the envelope does not


def test_an_envelope_that_does_not_reach_the_threshold_fails() -> None:
    process = _process(1, "Fundição", envelopes={"faixa-massa": (0.1, 4.0)})
    constraint = Constraint(operator=Operator.GTE, property_slug="faixa-massa", value=8.0)

    assert evaluate_constraint(constraint, process) is False


def test_an_upper_bound_reads_the_envelope_lower_end() -> None:
    """ "≤ 2 kg" asks whether the process can make something that light."""
    process = _process(1, "Moldagem", envelopes={"faixa-massa": (0.1, 10.0)})

    assert evaluate_constraint(
        Constraint(operator=Operator.LTE, property_slug="faixa-massa", value=2.0), process
    )
    assert not evaluate_constraint(
        Constraint(operator=Operator.LTE, property_slug="faixa-massa", value=0.05), process
    )


def test_strict_operators_exclude_the_bound_they_touch() -> None:
    process = _process(1, "Moldagem", envelopes={"faixa-massa": (1.0, 10.0)})

    assert evaluate_constraint(
        Constraint(operator=Operator.GT, property_slug="faixa-massa", value=9.99), process
    )
    assert not evaluate_constraint(
        Constraint(operator=Operator.GT, property_slug="faixa-massa", value=10.0), process
    )
    assert not evaluate_constraint(
        Constraint(operator=Operator.LT, property_slug="faixa-massa", value=1.0), process
    )


def test_between_over_an_envelope_is_overlap_and_not_containment() -> None:
    """ "Peças de 5 a 20 kg" is satisfiable by a process reaching 10."""
    process = _process(1, "Moldagem", envelopes={"faixa-massa": (0.1, 10.0)})

    assert evaluate_constraint(
        Constraint(
            operator=Operator.BETWEEN,
            property_slug="faixa-massa",
            value_min=5.0,
            value_max=20.0,
        ),
        process,
    )
    # No overlap at all: the window starts above everything the process reaches.
    assert not evaluate_constraint(
        Constraint(
            operator=Operator.BETWEEN,
            property_slug="faixa-massa",
            value_min=50.0,
            value_max=80.0,
        ),
        process,
    )


def test_outside_over_an_envelope_asks_whether_some_point_escapes_the_window() -> None:
    process = _process(1, "Moldagem", envelopes={"faixa-massa": (0.1, 10.0)})

    assert evaluate_constraint(
        Constraint(
            operator=Operator.OUTSIDE,
            property_slug="faixa-massa",
            value_min=1.0,
            value_max=5.0,
        ),
        process,
    )
    # The envelope sits entirely inside the window, so nothing escapes it.
    assert not evaluate_constraint(
        Constraint(
            operator=Operator.OUTSIDE,
            property_slug="faixa-massa",
            value_min=0.0,
            value_max=20.0,
        ),
        process,
    )


def test_a_scalar_process_attribute_keeps_the_ordinary_rule() -> None:
    """The envelope rule is chosen by the datum, not by the universe: a scalar
    attribute on a process compares exactly as a material property does."""
    process = _process(1, "Usinagem", values={"tolerancia": 0.05})

    assert evaluate_constraint(
        Constraint(operator=Operator.LTE, property_slug="tolerancia", value=0.1), process
    )
    assert not evaluate_constraint(
        Constraint(operator=Operator.LTE, property_slug="tolerancia", value=0.01), process
    )


def test_an_absent_envelope_fails_a_numeric_constraint() -> None:
    """The rule that outranks the other two: you cannot select on data you do
    not have — a process with no mass range recorded is not admitted by one."""
    process = _process(1, "Adesivagem")

    assert not evaluate_constraint(
        Constraint(operator=Operator.GTE, property_slug="faixa-massa", value=5.0), process
    )


def test_exists_sees_all_three_shapes_of_datum() -> None:
    """Before P0-4 completeness read only ``values``, which would have reported a
    process holding an envelope and a set of labels as having no data at all."""
    envelope_only = _process(1, "Moldagem", envelopes={"faixa-massa": (0.1, 10.0)})
    labels_only = _process(2, "Fundição", labels={"forma": ("Maciço 3D",)})
    scalar_only = _process(3, "Usinagem", values={"tolerancia": 0.05})
    nothing = _process(4, "Adesivagem")

    for record, slug in (
        (envelope_only, "faixa-massa"),
        (labels_only, "forma"),
        (scalar_only, "tolerancia"),
    ):
        assert evaluate_constraint(Constraint(operator=Operator.EXISTS, property_slug=slug), record)
        assert not evaluate_constraint(
            Constraint(operator=Operator.NOT_EXISTS, property_slug=slug), record
        )

    assert evaluate_constraint(
        Constraint(operator=Operator.NOT_EXISTS, property_slug="faixa-massa"), nothing
    )


def test_has_any_label_is_set_membership() -> None:
    process = _process(1, "Fundição", labels={"forma": ("Maciço 3D", "Oco 3D")})

    assert evaluate_constraint(
        Constraint(operator=Operator.HAS_ANY_LABEL, property_slug="forma", labels=["Maciço 3D"]),
        process,
    )
    assert evaluate_constraint(
        Constraint(
            operator=Operator.HAS_ANY_LABEL,
            property_slug="forma",
            labels=["Chapa conformada", "Oco 3D"],
        ),
        process,
    )
    assert not evaluate_constraint(
        Constraint(
            operator=Operator.HAS_ANY_LABEL, property_slug="forma", labels=["Chapa conformada"]
        ),
        process,
    )


def test_has_no_label_rejects_a_process_holding_any_of_them() -> None:
    process = _process(1, "Fundição", labels={"forma": ("Maciço 3D",)})

    assert evaluate_constraint(
        Constraint(
            operator=Operator.HAS_NO_LABEL, property_slug="forma", labels=["Chapa conformada"]
        ),
        process,
    )
    assert not evaluate_constraint(
        Constraint(operator=Operator.HAS_NO_LABEL, property_slug="forma", labels=["Maciço 3D"]),
        process,
    )


def test_the_negative_label_operator_does_not_wave_absence_through() -> None:
    """A process with no ``forma`` recorded is not "a process whose shape is not
    solid" — it is a process whose shape nobody wrote down. Passing it would be
    selecting on data that does not exist, which NOT_EXISTS is for."""
    process = _process(1, "Adesivagem")

    assert not evaluate_constraint(
        Constraint(operator=Operator.HAS_NO_LABEL, property_slug="forma", labels=["Maciço 3D"]),
        process,
    )


def test_a_label_criterion_naming_nothing_does_not_narrow() -> None:
    """Same convention an empty TreeSelection and an empty ProcessSelection
    follow: a criterion with nothing ticked does not reject everyone."""
    process = _process(1, "Fundição", labels={"forma": ("Maciço 3D",)})

    assert evaluate_constraint(
        Constraint(operator=Operator.HAS_ANY_LABEL, property_slug="forma", labels=[]), process
    )


def test_a_material_snapshot_still_has_no_envelope_or_label() -> None:
    """The maps live on the base, but nothing populates them for a material yet
    — so a material study evaluates exactly as it did before P0-4."""
    material = MaterialSnapshot(
        id=1, name="Aço", class_name="Metais", class_slug="metais", values={"densidade": 7800.0}
    )

    assert material.envelopes == {}
    assert material.labels == {}
    assert evaluate_constraint(
        Constraint(operator=Operator.GTE, property_slug="densidade", value=7000.0), material
    )


def test_an_envelope_constraint_runs_through_a_stage_pipeline() -> None:
    """The envelope rule is not a special case bolted onto evaluate_constraint:
    it has to hold through the group tree and the stage pipeline the service
    actually calls."""
    reaches = _process(1, "Moldagem", envelopes={"faixa-massa": (0.1, 10.0)})
    does_not = _process(2, "Micro-usinagem", envelopes={"faixa-massa": (0.001, 0.05)})
    no_data = _process(3, "Adesivagem")

    stage = SelectionStageNode(
        kind="limit",
        label="Massa da peça",
        enabled=True,
        root=ConstraintGroupNode(
            operator="AND",
            constraints=[Constraint(operator=Operator.GTE, property_slug="faixa-massa", value=5.0)],
            children=[],
        ),
    )

    kept = apply_stage([reaches, does_not, no_data], stage)
    assert [record.id for record in kept] == [1]
