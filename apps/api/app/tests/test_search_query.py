"""The query language of the catalogue search.

The operators are the ones a materials engineer expects from a selection tool —
`AND`, `OR`, `NOT`, phrase, parentheses and wildcards — and the default when
none is written is `AND`, because two words typed together mean "both", not
"either". That default is the one decision here that changes results silently,
so it has its own test.
"""

from __future__ import annotations

import pytest

from app.domain.search_query import (
    And,
    Not,
    Or,
    SearchQueryError,
    Term,
    parse_query,
    to_like_pattern,
)


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
