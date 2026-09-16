"""Tests for turning a parent map into root→leaf class lineages (P0-1)."""

from __future__ import annotations

from app.domain.taxonomy import lineages


def test_root_class_is_its_own_lineage():
    assert lineages({"metais": None}) == {"metais": ("metais",)}


def test_child_carries_its_ancestors_root_first():
    parents = {"metais": None, "acos": "metais", "acos_carbono": "acos"}
    assert lineages(parents)["acos_carbono"] == ("metais", "acos", "acos_carbono")


def test_siblings_do_not_share_each_other():
    parents = {"metais": None, "acos": "metais", "ligas_leves": "metais"}
    result = lineages(parents)
    assert result["acos"] == ("metais", "acos")
    assert result["ligas_leves"] == ("metais", "ligas_leves")


def test_parent_outside_the_map_stops_the_walk():
    # A class whose parent row is not in the map (filtered query, deleted row)
    # yields the deepest lineage that is actually known — never a KeyError, and
    # never a silent empty path that would make the class unmatchable.
    assert lineages({"acos": "desaparecido"})["acos"] == ("acos",)


def test_a_cycle_does_not_hang_and_stops_at_the_repetition():
    # parent_id is a self-referential FK with no constraint against cycles, so
    # corrupt data can describe one. The walk must terminate; which node it
    # stops at matters less than that it stops and reports a usable path.
    parents = {"a": "b", "b": "a"}
    result = lineages(parents)
    assert result["a"][-1] == "a"
    assert len(result["a"]) <= 2
    assert result["b"][-1] == "b"


def test_empty_map_is_empty():
    assert lineages({}) == {}
