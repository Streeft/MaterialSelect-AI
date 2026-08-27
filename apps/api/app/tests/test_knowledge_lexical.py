"""Lexical ranking: the retrieval path that has to work with nothing plugged in.

BM25 is not the project's invention, so what is tested here is not the formula
but the four properties the rest of the design leans on: that a rare term counts
for more than a common one, that repeating a word stops helping after a while,
that a long passage does not win by being long, and that folding makes an
unaccented query reach an accented passage. Break any of those and the fallback
silently becomes a keyword toy.
"""

from __future__ import annotations

from app.knowledge.lexical import bm25_scores, fold, idf, tokenize


class TestFold:
    def test_strips_diacritics(self) -> None:
        # The whole reason `search_text` exists as a stored column.
        assert fold("Resistência à Tração") == "resistencia a tracao"

    def test_lowercases(self) -> None:
        assert fold("MÓDULO") == "modulo"

    def test_is_idempotent(self) -> None:
        # It runs on the corpus at ingest and on the query at search time; if it
        # were not idempotent the two sides could disagree.
        once = fold("Tenacidade à fratura KIC")
        assert fold(once) == once


class TestTokenize:
    def test_splits_on_punctuation_and_folds(self) -> None:
        assert tokenize("Módulo de Young (E), em GPa.") == ["modulo", "young", "gpa"]

    def test_drops_stopwords_and_short_tokens(self) -> None:
        assert tokenize("o material com a que de") == ["material"]

    def test_keeps_numbers(self) -> None:
        # "6061" and "AISI 1020" are how an alloy is named; dropping digits
        # would make half the catalogue unsearchable. A merely common number is
        # handled by its own low IDF, not by a rule.
        assert tokenize("liga 6061 e aço AISI 1020") == ["liga", "6061", "aco", "aisi", "1020"]

    def test_empty_text_yields_nothing(self) -> None:
        assert tokenize("   ...   ") == []


class TestIdf:
    def test_rare_term_weighs_more_than_common_one(self) -> None:
        assert idf(1, 1000) > idf(900, 1000)

    def test_never_negative_for_a_term_in_most_of_the_corpus(self) -> None:
        # Without the +1 inside the log, a term present in more than half the
        # corpus would actively penalise the passages containing it — which
        # reads as a bug every time someone rediscovers it.
        assert idf(999, 1000) > 0.0


class TestBm25:
    def test_rarer_term_outranks_common_one(self) -> None:
        scores = bm25_scores(
            query_tokens=["austenita", "material"],
            documents={1: ["austenita", "estavel"], 2: ["material", "estavel"]},
            document_frequency={"austenita": 2, "material": 900},
            corpus_size=1000,
        )
        assert scores[1] > scores[2]

    def test_term_frequency_saturates(self) -> None:
        # Ten mentions are worth more than one, but nowhere near ten times more.
        scores = bm25_scores(
            query_tokens=["fadiga"],
            documents={1: ["fadiga"], 2: ["fadiga"] * 10},
            document_frequency={"fadiga": 5},
            corpus_size=1000,
            average_length=5.0,
        )
        assert scores[1] < scores[2] < scores[1] * 10

    def test_padding_a_passage_does_not_help_it(self) -> None:
        scores = bm25_scores(
            query_tokens=["fluencia"],
            documents={1: ["fluencia", "curta"], 2: ["fluencia", *["enchimento"] * 200]},
            document_frequency={"fluencia": 5},
            corpus_size=1000,
        )
        assert scores[1] > scores[2]

    def test_passage_matching_nothing_is_absent(self) -> None:
        # Absent rather than zero: a candidate the query never touched is not a
        # result with a low score, it is not a result.
        scores = bm25_scores(
            query_tokens=["corrosao"],
            documents={1: ["corrosao"], 2: ["densidade"]},
            document_frequency={"corrosao": 3},
            corpus_size=100,
        )
        assert set(scores) == {1}

    def test_empty_query_scores_nothing(self) -> None:
        assert bm25_scores([], {1: ["texto"]}, {}, 10) == {}

    def test_unseen_term_does_not_divide_by_zero(self) -> None:
        # A term with no recorded document frequency is treated as rare, not as
        # impossible; the corpus count is the ceiling.
        scores = bm25_scores(["novidade"], {1: ["novidade"]}, {}, 1)
        assert scores[1] > 0.0
