"""Chemical composition, as a rule (D-105): how a row is built and how a search reads it.

Pure domain, no database. The search semantics are tested here because this is
the one place the reach rule is written; the repository only compiles the
verdicts these functions return.
"""

from __future__ import annotations

import pytest

from app.domain.composition import (
    Comparison,
    CompositionCondition,
    CompositionError,
    EntryFacts,
    UndeterminedReason,
    admitted_interval,
    build_composition_entry,
    evaluate,
    parse_condition,
    validate_composition,
)
from app.domain.designation import DesignationError, designation_key, resolve_system
from app.domain.elements import ELEMENTS, SYMBOLS, element_for
from app.models.enums import DesignationSystem


class TestTheElementList:
    def test_it_is_the_118_named_elements_in_order(self) -> None:
        assert len(ELEMENTS) == 118
        assert [e.number for e in ELEMENTS] == list(range(1, 119))
        assert (ELEMENTS[0].symbol, ELEMENTS[25].symbol, ELEMENTS[-1].symbol) == ("H", "Fe", "Og")

    def test_symbols_are_unique_ignoring_case(self) -> None:
        # What lets `comp:cr>=12` mean chromium without ambiguity.
        assert len({s.casefold() for s in SYMBOLS}) == len(SYMBOLS)

    def test_lookup_ignores_case_and_returns_the_canonical_symbol(self) -> None:
        element = element_for("cr")
        assert element is not None and element.symbol == "Cr" and element.name == "Cromo"
        assert element_for("Xx") is None


class TestBuildingARow:
    def test_a_range_keeps_the_original_and_adds_mass_percent(self) -> None:
        row = build_composition_entry("cr", value_min=17.5, value_max=19.5, unit="%")
        assert row.element == "Cr"
        assert (row.value_min, row.value_max, row.original_unit) == (17.5, 19.5, "%")
        assert (row.normalized_min, row.normalized_max) == (17.5, 19.5)
        assert row.canonical_unit == "percent"
        assert row.conversion_method == "identity:percent"

    def test_ppm_is_converted_and_the_trail_says_so(self) -> None:
        row = build_composition_entry("Ti", value_max=1500, unit="ppm")
        assert row.value_max == 1500 and row.original_unit == "ppm"
        assert row.normalized_max == pytest.approx(0.15)
        assert row.conversion_method == "pint:ppm->percent"

    def test_a_maximum_alone_does_not_invent_a_minimum(self) -> None:
        row = build_composition_entry("C", value_max=0.08, unit="%")
        assert row.value_min is None and row.normalized_min is None

    @pytest.mark.parametrize("state", [{"is_balance": True}, {"is_missing": True}])
    def test_balance_and_absence_carry_no_number(self, state: dict) -> None:
        row = build_composition_entry("Fe", **state)
        assert all(
            v is None
            for v in (row.value_min, row.value_max, row.value_nominal, row.normalized_nominal)
        )

    @pytest.mark.parametrize("state", [{"is_balance": True}, {"is_missing": True}])
    def test_a_number_on_balance_or_absence_is_refused(self, state: dict) -> None:
        # "Fe: resto = 71,2" would be 100 − Σ written down as if a source had said it.
        with pytest.raises(CompositionError, match="não carrega número"):
            build_composition_entry("Fe", value_nominal=71.2, unit="%", **state)

    def test_balance_and_missing_at_once_is_a_contradiction(self) -> None:
        with pytest.raises(CompositionError, match="resto e ausente"):
            build_composition_entry("Fe", is_balance=True, is_missing=True)

    @pytest.mark.parametrize(
        ("kwargs", "message"),
        [
            ({}, "informe mínimo, máximo ou valor nominal"),
            ({"value_max": 1.0}, "falta a unidade"),
            ({"value_min": 20.0, "value_max": 18.0, "unit": "%"}, "faixa invertida"),
            ({"value_min": 1.0, "value_max": 2.0, "value_nominal": 3.0, "unit": "%"}, "nominal"),
            ({"value_max": 120.0, "unit": "%"}, "0–100"),
            ({"value_max": 1.0, "unit": "at%"}, "Unidade de composição não aceita"),
            ({"value_max": float("nan"), "unit": "%"}, "não finito"),
        ],
    )
    def test_invalid_rows_are_refused_with_a_reason(self, kwargs: dict, message: str) -> None:
        with pytest.raises(CompositionError, match=message):
            build_composition_entry("Ni", **kwargs)

    def test_an_unknown_symbol_is_refused(self) -> None:
        with pytest.raises(CompositionError, match="não é símbolo"):
            build_composition_entry("Xy", value_max=1.0, unit="%")


class TestAWholeComposition:
    def test_one_row_per_element(self) -> None:
        rows = [build_composition_entry("Cr", value_max=1.0, unit="%")] * 2
        with pytest.raises(CompositionError, match="mais de uma vez"):
            validate_composition(rows)

    def test_one_balance_at_most(self) -> None:
        rows = [
            build_composition_entry("Fe", is_balance=True),
            build_composition_entry("Ni", is_balance=True),
        ]
        with pytest.raises(CompositionError, match="Só um elemento"):
            validate_composition(rows)

    def test_minima_cannot_add_past_100(self) -> None:
        rows = [
            build_composition_entry("Cu", value_min=60.0, unit="%"),
            build_composition_entry("Zn", value_min=45.0, unit="%"),
        ]
        with pytest.raises(CompositionError, match="somam mais de 100"):
            validate_composition(rows)


class TestParsingACondition:
    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("Cr", CompositionCondition("Cr", Comparison.CONTAINS)),
            ("cr>=12", CompositionCondition("Cr", Comparison.GE, low=12.0)),
            ("Cr≥12%", CompositionCondition("Cr", Comparison.GE, low=12.0)),
            ("C<=0,08", CompositionCondition("C", Comparison.LE, high=0.08)),
            ("C<0.08", CompositionCondition("C", Comparison.LT, high=0.08)),
            ("Mo>2", CompositionCondition("Mo", Comparison.GT, low=2.0)),
            ("Ni=9", CompositionCondition("Ni", Comparison.EQ, low=9.0)),
            ("Ni:8-10", CompositionCondition("Ni", Comparison.BETWEEN, low=8.0, high=10.0)),
            ("Ni:8,5–10,5", CompositionCondition("Ni", Comparison.BETWEEN, low=8.5, high=10.5)),
        ],
    )
    def test_valid_conditions(self, text: str, expected: CompositionCondition) -> None:
        assert parse_condition(text) == expected

    @pytest.mark.parametrize(
        ("text", "message"),
        [
            ("", "precisa de um elemento"),
            ("Xx>=1", "não é símbolo"),
            ("Cr>=", "Não entendi"),
            ("Cr>=abc", "Não entendi"),
            ("Cr>=120", "0 a 100"),
            ("Ni:10-8", "Faixa invertida"),
            ("Cr=>12", "Não entendi"),
        ],
    )
    def test_invalid_conditions_say_why(self, text: str, message: str) -> None:
        with pytest.raises(CompositionError, match=message):
            parse_condition(text)

    def test_the_label_is_written_in_portuguese(self) -> None:
        assert parse_condition("Cr>=12").label() == "Cr ≥ 12 %"
        assert parse_condition("C<=0,08").label() == "C ≤ 0,08 %"
        assert parse_condition("Ni:8-10").label() == "Ni entre 8 e 10 %"
        assert parse_condition("Fe").label() == "contém Fe"


def _range(low=None, high=None, nominal=None) -> EntryFacts:
    return EntryFacts(
        is_balance=False,
        is_missing=False,
        normalized_min=low,
        normalized_max=high,
        normalized_nominal=nominal,
    )


BALANCE = EntryFacts(True, False, None, None, None)
ABSENT = EntryFacts(False, True, None, None, None)


class TestTheReachRule:
    def test_what_each_declared_shape_admits(self) -> None:
        assert admitted_interval(_range(17.5, 19.5)) == (17.5, 19.5)
        # "≤ máx." is [0, máx.]: that is what a maximum in a standard means.
        assert admitted_interval(_range(high=0.08)) == (0.0, 0.08)
        assert admitted_interval(_range(low=99.9)) == (99.9, 100.0)
        assert admitted_interval(_range(nominal=1.0)) == (1.0, 1.0)
        # A nominal does not narrow a declared range.
        assert admitted_interval(_range(0.8, 1.2, 1.0)) == (0.8, 1.2)

    def test_a_range_reaching_the_threshold_satisfies_it(self) -> None:
        condition = parse_condition("Cr>=12")
        assert evaluate(condition, _range(10.5, 12.5), has_composition=True).value is True
        assert evaluate(condition, _range(0.04, 0.35), has_composition=True).value is False

    def test_the_midpoint_rule_would_have_rejected_a_reachable_range(self) -> None:
        # The D-59 case, for composition: 10,5–12,5 % reaches 12 %, its midpoint
        # (11,5) does not. The rule that ran is reach, and the response says so.
        entry = _range(10.5, 12.5)
        assert (entry.normalized_min + entry.normalized_max) / 2 < 12
        assert evaluate(parse_condition("Cr>=12"), entry, has_composition=True).value is True

    def test_negating_the_complement_asks_for_a_guarantee(self) -> None:
        # NOT comp:Cr<12 == "no conforming heat below 12 %" == min ≥ 12.
        below = parse_condition("Cr<12")
        guaranteed = evaluate(below, _range(17.5, 19.5), has_composition=True)
        only_reaching = evaluate(below, _range(10.5, 12.5), has_composition=True)
        assert guaranteed.value is False  # so NOT … is True
        assert only_reaching.value is True  # so NOT … is False

    def test_comparisons_on_each_side(self) -> None:
        entry = _range(8.0, 10.5)
        cases = {
            "Ni>10.5": False,
            "Ni>=10.5": True,
            "Ni<8": False,
            "Ni<=8": True,
            "Ni=9": True,
            "Ni=11": False,
            "Ni:10-12": True,
            "Ni:11-12": False,
            "Ni": True,
        }
        for text, expected in cases.items():
            assert evaluate(parse_condition(text), entry, has_composition=True).value is expected

    def test_a_maximum_only_reaches_down_to_zero(self) -> None:
        carbon = _range(high=0.07)
        assert evaluate(parse_condition("C<=0,03"), carbon, has_composition=True).value is True
        assert evaluate(parse_condition("C>=0,1"), carbon, has_composition=True).value is False

    def test_contains_is_false_only_when_the_source_declared_zero(self) -> None:
        assert evaluate(parse_condition("Pb"), _range(high=0.0), has_composition=True).value is (
            False
        )

    def test_a_balance_contains_its_element_and_cannot_be_compared(self) -> None:
        assert evaluate(parse_condition("Fe"), BALANCE, has_composition=True).value is True
        verdict = evaluate(parse_condition("Fe>=50"), BALANCE, has_composition=True)
        assert verdict.value is None
        assert verdict.reason is UndeterminedReason.RESTO_SEM_NUMERO

    @pytest.mark.parametrize(
        ("entry", "has_composition", "reason"),
        [
            (ABSENT, True, UndeterminedReason.DECLARADO_AUSENTE),
            (None, True, UndeterminedReason.ELEMENTO_NAO_DECLARADO),
            (None, False, UndeterminedReason.SEM_COMPOSICAO),
        ],
    )
    def test_absence_is_undetermined_never_zero(
        self, entry: EntryFacts | None, has_composition: bool, reason: UndeterminedReason
    ) -> None:
        # A material with no Ni row does not have 0 % Ni: `comp:Ni<=1` cannot
        # be answered for it, and neither can `comp:Ni`.
        for text in ("Ni<=1", "Ni"):
            verdict = evaluate(parse_condition(text), entry, has_composition=has_composition)
            assert verdict.value is None and verdict.reason is reason


class TestDesignationRules:
    def test_the_key_folds_case_and_spacing_and_nothing_else(self) -> None:
        assert designation_key(" s 30400 ") == "S30400"
        assert designation_key("x5CrNi18-10") == "X5CRNI18-10"
        # Punctuation stays: 1.4301 and 14301 are not made the same by looks.
        assert designation_key("1.4301") != designation_key("14301")

    def test_an_empty_code_is_refused(self) -> None:
        with pytest.raises(DesignationError):
            designation_key("   ")

    @pytest.mark.parametrize(
        ("typed", "system"),
        [
            ("UNS", DesignationSystem.UNS),
            ("aisi", DesignationSystem.AISI_SAE),
            ("SAE", DesignationSystem.AISI_SAE),
            ("NBR", DesignationSystem.ABNT),
            ("Comercial", DesignationSystem.COMERCIAL),
        ],
    )
    def test_systems_by_the_names_a_reader_types(
        self, typed: str, system: DesignationSystem
    ) -> None:
        assert resolve_system(typed) is system

    def test_an_unknown_system_lists_the_known_ones(self) -> None:
        with pytest.raises(DesignationError, match="As normas aceitas são UNS"):
            resolve_system("XYZ")
