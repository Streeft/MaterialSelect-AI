"""Chunking: the seams a passage is allowed to be cut at, and what it carries.

The unit under test is not "does it split" but "does a split passage remain
citable and readable" — page range preserved across a page break, heading
carried onto the passages beneath it, and no cut in the middle of a sentence
when a paragraph boundary was available.
"""

from __future__ import annotations

from app.knowledge.chunking import (
    MAX_CHARS,
    Chunk,
    chunk_text,
    looks_like_heading,
    normalise,
)
from app.knowledge.readers import ExtractedText


def _para(text: str, times: int = 1) -> str:
    return (text + " ") * times


class TestNormalise:
    def test_joins_hyphenated_line_break(self) -> None:
        # PDF extraction splits words at the right margin; leaving the hyphen in
        # would put "resis" and "tência" in the index as separate tokens.
        assert normalise("resis-\ntência mecânica") == "resistência mecânica"

    def test_joins_soft_wrapped_lines(self) -> None:
        assert normalise("o módulo de Young\nmede a rigidez") == "o módulo de Young mede a rigidez"

    def test_keeps_paragraph_break_intact(self) -> None:
        # A blank line is a real boundary and must survive normalisation, since
        # it is the primary seam the chunker splits on.
        assert "\n\n" in normalise("primeiro parágrafo.\n\nsegundo parágrafo.")

    def test_collapses_runs_of_spaces(self) -> None:
        assert normalise("densidade    específica") == "densidade específica"


class TestHeadingDetection:
    def test_numbered_heading(self) -> None:
        assert looks_like_heading("3.2 Seleção de materiais")

    def test_all_caps_heading(self) -> None:
        assert looks_like_heading("ÍNDICES DE DESEMPENHO")

    def test_sentence_is_not_a_heading(self) -> None:
        assert not looks_like_heading("O módulo de Young mede a rigidez do material.")

    def test_long_line_is_not_a_heading(self) -> None:
        assert not looks_like_heading("PALAVRA " * 40)

    def test_lone_acronym_is_not_a_heading(self) -> None:
        # "ABS" alone is a material name in running text far more often than it
        # is a section title; requiring two words keeps captions out.
        assert not looks_like_heading("ABS")


class TestChunking:
    def test_short_document_is_one_chunk(self) -> None:
        extracted = ExtractedText(pages=["Um parágrafo curto sobre seleção de materiais."])
        chunks = chunk_text(extracted)
        assert len(chunks) == 1
        assert chunks[0].ordinal == 0
        assert chunks[0].page_start == 1

    def test_pages_are_one_based(self) -> None:
        # The reader indexes pages from 0; a citation a human checks starts at 1.
        extracted = ExtractedText(pages=["", _para("Texto na segunda página.", 60)])
        chunks = chunk_text(extracted)
        assert chunks[0].page_start == 2

    def test_passage_spanning_a_page_break_reports_both_pages(self) -> None:
        # The honest answer for a passage built from two pages is the range, not
        # whichever page happened to start it.
        extracted = ExtractedText(pages=["Fim da página um.", "Início da página dois."])
        chunks = chunk_text(extracted)
        assert chunks[0].page_start == 1
        assert chunks[0].page_end == 2

    def test_heading_is_carried_onto_following_passages(self) -> None:
        extracted = ExtractedText(
            pages=["4.1 DIAGRAMAS DE ASHBY\n\n" + _para("Conteúdo da seção.", 200)]
        )
        chunks = chunk_text(extracted)
        assert len(chunks) > 1
        assert all(chunk.heading == "4.1 DIAGRAMAS DE ASHBY" for chunk in chunks)

    def test_new_heading_closes_the_previous_passage(self) -> None:
        # Letting one section's tail bleed into the next would mislabel both.
        extracted = ExtractedText(
            pages=[
                "1 PRIMEIRA SEÇÃO\n\nTexto curto da primeira.\n\n"
                "2 SEGUNDA SEÇÃO\n\nTexto curto da segunda."
            ]
        )
        headings = [chunk.heading for chunk in chunk_text(extracted)]
        assert headings == ["1 PRIMEIRA SEÇÃO", "2 SEGUNDA SEÇÃO"]

    def test_no_chunk_exceeds_the_ceiling(self) -> None:
        extracted = ExtractedText(pages=[_para("Uma frase de tamanho normal aqui.", 400)])
        assert all(chunk.char_count <= MAX_CHARS for chunk in chunk_text(extracted))

    def test_single_giant_sentence_is_still_split(self) -> None:
        # A table flattened into one line has no sentence boundary to cut at;
        # the fallback must still bound the passage, on a word boundary.
        extracted = ExtractedText(pages=["palavra " * 2000])
        chunks = chunk_text(extracted)
        assert len(chunks) > 1
        assert all(chunk.char_count <= MAX_CHARS for chunk in chunks)
        assert not any(chunk.text.startswith("avra") for chunk in chunks)

    def test_ordinals_are_dense_and_ordered(self) -> None:
        extracted = ExtractedText(pages=[_para("Conteúdo técnico relevante.", 300)])
        chunks = chunk_text(extracted)
        assert [chunk.ordinal for chunk in chunks] == list(range(len(chunks)))

    def test_overlap_repeats_context_across_the_seam(self) -> None:
        extracted = ExtractedText(pages=[_para("Uma frase sobre rigidez específica.", 300)])
        chunks = chunk_text(extracted, overlap_chars=100)
        assert len(chunks) > 1
        # The tail of one passage reappears at the head of the next, so a
        # definition introduced just before a seam is not lost to it.
        assert chunks[1].text[:40] in chunks[0].text

    def test_empty_document_yields_nothing(self) -> None:
        assert chunk_text(ExtractedText(pages=["", "   "])) == []

    def test_chunk_char_count_matches_its_text(self) -> None:
        chunk = Chunk(ordinal=0, text="abc", page_start=1, page_end=1, heading=None)
        assert chunk.char_count == 3
