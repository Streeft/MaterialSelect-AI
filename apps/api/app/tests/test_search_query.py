"""The query language of the catalogue search.

The operators are the ones a materials engineer expects from a selection tool —
`AND`, `OR`, `NOT`, phrase, parentheses and wildcards — and the default when
none is written is `AND`, because two words typed together mean "both", not
"either". That default is the one decision here that changes results silently,
so it has its own test.
"""

from __future__ import annotations

import pytest

from app.domain.composition import Comparison, CompositionCondition
from app.domain.search_query import (
    And,
    CompositionAtom,
    DesignationAtom,
    Not,
    Or,
    SearchQueryError,
    SystemAtom,
    Term,
    composition_conditions,
    extract_positive_terms,
    parse_query,
    positive_designations,
    to_designation_pattern,
    to_like_pattern,
)
from app.models.enums import DesignationSystem


class TestTheDefaultIsAnd:
    def test_two_bare_words_mean_both(self) -> None:
        assert parse_query("aco inox") == And((Term("aco"), Term("inox")))

    def test_one_word_is_just_that_word(self) -> None:
        assert parse_query("aluminio") == Term("aluminio")

    def test_case_does_not_matter_for_operators_or_terms(self) -> None:
        assert parse_query("Aco and Inox") == parse_query("aco AND inox")


class TestOperators:
    def test_or_keeps_either_side(self) -> None:
        assert parse_query("aco OR aluminio") == Or((Term("aco"), Term("aluminio")))

    def test_not_excludes(self) -> None:
        assert parse_query("aco NOT inox") == And((Term("aco"), Not(Term("inox"))))

    def test_parentheses_group(self) -> None:
        assert parse_query("ferro AND (minerio OR fundido)") == And(
            (Term("ferro"), Or((Term("minerio"), Term("fundido"))))
        )

    def test_and_binds_tighter_than_or(self) -> None:
        # `a OR b AND c` is `a OR (b AND c)`; reading it as `(a OR b) AND c`
        # would quietly drop records the user asked for.
        assert parse_query("a OR b AND c") == Or((Term("a"), And((Term("b"), Term("c")))))


class TestPhrases:
    def test_a_quoted_phrase_is_one_term(self) -> None:
        assert parse_query('"aco inox"') == Term("aco inox", phrase=True)

    def test_an_operator_inside_quotes_is_literal_text(self) -> None:
        assert parse_query('"ferro and aco"') == Term("ferro and aco", phrase=True)


class TestWildcards:
    def test_star_matches_any_run_of_characters(self) -> None:
        assert to_like_pattern(Term("alum*")) == "alum%"

    def test_question_mark_matches_exactly_one(self) -> None:
        assert to_like_pattern(Term("a?o")) == "a_o"

    def test_a_bare_term_matches_as_a_substring(self) -> None:
        # Without wildcards the search stays forgiving: typing "inox" finds
        # "Aço inox 304". A wildcard is how the user asks for precision.
        assert to_like_pattern(Term("inox")) == "%inox%"

    def test_a_phrase_is_also_a_substring(self) -> None:
        assert to_like_pattern(Term("aco inox", phrase=True)) == "%aco inox%"

    def test_sql_metacharacters_in_the_query_are_literal(self) -> None:
        # A user typing 100% must not turn the rest of the query into a wildcard.
        assert to_like_pattern(Term("100%")) == "%100\\%%"
        assert to_like_pattern(Term("a_b")) == "%a\\_b%"


class TestWhatTheParserRefuses:
    """A refused query is better than a query that silently means something else."""

    @pytest.mark.parametrize("query", ["", "   ", "AND", "aco AND", "OR aco", "NOT"])
    def test_an_incomplete_query_is_an_error(self, query: str) -> None:
        with pytest.raises(SearchQueryError):
            parse_query(query)

    def test_unbalanced_parentheses_are_an_error(self) -> None:
        with pytest.raises(SearchQueryError):
            parse_query("(aco OR aluminio")

    def test_an_unclosed_quote_is_an_error(self) -> None:
        with pytest.raises(SearchQueryError):
            parse_query('"aco inox')

    def test_a_leading_wildcard_is_refused(self) -> None:
        # Same rule the reference tool states: a pattern that starts with a
        # wildcard cannot use an index and scans the whole table.
        with pytest.raises(SearchQueryError):
            parse_query("*inox")


class TestExtractPositiveTerms:
    def test_extracts_terms_from_simple_and_or_queries(self) -> None:
        query = parse_query("aco AND inox OR aluminio")
        assert extract_positive_terms(query) == ["aco", "inox", "aluminio"]

    def test_ignores_negated_terms(self) -> None:
        query = parse_query("aco NOT inox")
        assert extract_positive_terms(query) == ["aco"]

    def test_strips_wildcards_and_deduplicates(self) -> None:
        query = parse_query('alum* OR "aco inox" AND alum?')
        assert extract_positive_terms(query) == ["alum", "aco inox"]


class TestFieldAtoms:
    """D-105: `comp:`, `norma:` and `designacao:` combine like any other atom."""

    def test_a_composition_condition(self) -> None:
        assert parse_query("comp:Cr>=12") == CompositionAtom(
            CompositionCondition("Cr", Comparison.GE, low=12.0)
        )

    def test_a_range_and_contains(self) -> None:
        assert parse_query("comp:Ni:8-10") == CompositionAtom(
            CompositionCondition("Ni", Comparison.BETWEEN, low=8.0, high=10.0)
        )
        assert parse_query("comp:Fe") == CompositionAtom(
            CompositionCondition("Fe", Comparison.CONTAINS)
        )

    def test_field_names_ignore_case_and_accents(self) -> None:
        assert parse_query("COMPOSIÇÃO:cr>=12") == parse_query("comp:Cr>=12")
        assert parse_query("Designação:s30400") == parse_query("designacao:S30400")

    def test_a_system(self) -> None:
        assert parse_query("norma:UNS") == SystemAtom(DesignationSystem.UNS)
        assert parse_query('norma:"AISI/SAE"') == SystemAtom(DesignationSystem.AISI_SAE)

    def test_a_code_is_exact_unless_it_has_a_wildcard(self) -> None:
        exact = parse_query("designacao:s30400")
        assert exact == DesignationAtom("S30400")
        assert exact.exact
        family = parse_query("designacao:304*")
        assert not family.exact
        assert to_designation_pattern(family) == "304%"

    def test_a_quoted_code_keeps_its_wildcards_literal(self) -> None:
        quoted = parse_query('designacao:"304 L"')
        assert quoted == DesignationAtom("304L", phrase=True)
        assert quoted.exact

    def test_fields_combine_with_and_or_not_and_parentheses(self) -> None:
        query = parse_query("aco (comp:Cr>=12 OR norma:UNS) NOT designacao:DEMO-304")
        assert query == And(
            (
                Term("aco"),
                Or(
                    (
                        CompositionAtom(CompositionCondition("Cr", Comparison.GE, low=12.0)),
                        SystemAtom(DesignationSystem.UNS),
                    )
                ),
                Not(DesignationAtom("DEMO-304")),
            )
        )

    def test_composition_conditions_are_collected_under_not_too(self) -> None:
        query = parse_query("comp:Cr>=12 NOT comp:Ni AND comp:Cr>=12")
        assert [c.element for c in composition_conditions(query)] == ["Cr", "Ni"]

    def test_only_positive_designations_are_rewarded(self) -> None:
        query = parse_query("designacao:A1 NOT designacao:B2")
        assert positive_designations(query) == [DesignationAtom("A1")]

    def test_field_atoms_are_not_highlight_terms(self) -> None:
        assert extract_positive_terms(parse_query("aco comp:Cr>=12 norma:UNS")) == ["aco"]

    def test_a_word_with_a_colon_but_no_letters_prefix_is_still_text(self) -> None:
        assert parse_query("1:2") == Term("1:2")


class TestWhatTheParserRefusesInFields:
    @pytest.mark.parametrize(
        ("query", "message"),
        [
            ("compo:Cr>=12", "Campo de busca desconhecido: 'compo:'"),
            ("comp:Cr >= 12", "sem espaços"),
            ("comp:Xx>=1", "não é símbolo"),
            ("comp:Cr>=120", "0 a 100"),
            ('comp:"Cr>=12"', "não vai entre aspas"),
            ("comp:", "precisa de um elemento"),
            ("norma:XYZ", "Norma desconhecida"),
            ("norma:", "precisa do nome da norma"),
            ("designacao:", "precisa de um código"),
            ("designacao:*304", "não pode começar"),
        ],
    )
    def test_each_error_says_what_is_wrong_in_portuguese(self, query: str, message: str) -> None:
        with pytest.raises(SearchQueryError, match=message):
            parse_query(query)
