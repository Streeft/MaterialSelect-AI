"""Where a passage sits in its source (D-233).

A citation used to carry only the passage's text, so the reader had to look the
text up in the source by words — which fails when the chunker has rewritten the
whitespace (hyphen breaks, hard wraps) and says nothing on a repeated sentence.
The chunker now reports the half-open interval ``[char_start, char_end)`` of the
passage in the source's ``content``, the text the notebook stores and the reader
shows: the pages stripped and joined by a blank line, empty pages left out.

The interval covers the passage's **own** text. The few hundred characters of
overlap a chunk repeats from its predecessor are not marked twice: they belong
to the previous passage's interval.
"""

from __future__ import annotations

import re

import pytest

from app.knowledge.chunking import (
    Chunk,
    _normalise_with_map,
    chunk_text,
    normalise,
)
from app.knowledge.readers import ExtractedText


def _content(pages: list[str]) -> str:
    """What ``NotebookService.ingest`` stores: stripped, non-empty pages, blank-line joined."""
    return "\n\n".join(page.strip() for page in pages if page.strip())


def _words(text: str) -> list[str]:
    return text.split()


def _chunks(pages: list[str], **kwargs) -> list[Chunk]:
    return chunk_text(ExtractedText(pages=pages), **kwargs)


# --- The normalisation map ----------------------------------------------------


@pytest.mark.parametrize(
    "raw",
    [
        "Texto simples.",
        "  espaços   múltiplos \t e tabs  ",
        "linha um\nlinha dois\nfim.",
        "frase.\nOutra frase.",
        "resis-\ntência do aço",
        "a\r\nb\rc",
        "nulo\x00 aqui",
        "\n\n  só espaços ao redor  \n",
        "tecnologia:\nsem espaço duplo",
    ],
)
def test_the_map_agrees_with_normalise_and_points_back_into_the_raw_text(raw):
    text, index = _normalise_with_map(raw)

    assert text == normalise(raw)
    assert len(index) == len(text)
    assert index == sorted(index)
    for char, source in zip(text, index, strict=True):
        # Each kept character is the raw character it points at, or a blank that stands
        # for a run of them.
        assert raw[source] == char or char == " " or char == "\n"


# --- Intervals ------------------------------------------------------------------


def test_a_single_paragraph_is_marked_exactly():
    pages = ["Primeiro parágrafo curto, mas com texto suficiente para ser uma passagem inteira."]
    (chunk,) = _chunks(pages)
    content = _content(pages)

    assert (chunk.char_start, chunk.char_end) == (0, len(content))
    assert content[chunk.char_start : chunk.char_end] == chunk.text


def test_every_interval_holds_exactly_the_words_of_its_passage_without_overlap():
    paragraphs = [f"Parágrafo {n}. " + ("Aço e liga de alumínio. " * 30) for n in range(12)]
    pages = ["\n\n".join(paragraphs[:6]), "\n\n".join(paragraphs[6:])]
    chunks = _chunks(pages, overlap_chars=0)
    content = _content(pages)

    assert len(chunks) > 3
    for chunk in chunks:
        assert chunk.char_start is not None and chunk.char_end is not None
        assert 0 <= chunk.char_start < chunk.char_end <= len(content)
        assert _words(content[chunk.char_start : chunk.char_end]) == _words(chunk.text)


def test_intervals_do_not_run_backwards_or_overlap_when_there_is_no_overlap_text():
    pages = ["\n\n".join(f"Seção {n}. " + "Texto de apoio. " * 40 for n in range(8))]
    chunks = _chunks(pages, overlap_chars=0)
    spans = [(c.char_start, c.char_end) for c in chunks]
    for (_, end), (start, _) in zip(spans, spans[1:], strict=False):
        assert end <= start


def test_with_overlap_the_interval_still_covers_only_the_passages_own_text():
    pages = ["\n\n".join(f"P{n} " + "palavra técnica de materiais. " * 30 for n in range(6))]
    content = _content(pages)
    chunks = _chunks(pages)  # default overlap of 200 characters

    assert len(chunks) > 1
    for previous, chunk in zip(chunks, chunks[1:], strict=False):
        assert chunk.char_start >= previous.char_start
        # The marked text is the tail of the passage text: the overlap sits before it.
        own = " ".join(_words(content[chunk.char_start : chunk.char_end]))
        assert " ".join(_words(chunk.text)).endswith(own)


def test_hyphen_breaks_and_hard_wraps_are_marked_where_the_source_wrote_them():
    # The chunker joins "resis-\ntência" into "resistência" and unwraps the lines: the
    # passage text is not a substring of the source, the interval still is the place.
    page = "A resis-\ntência do aço depende\nda liga usada nesta peça, sempre, e do tratamento."
    (chunk,) = _chunks([page])
    content = _content([page])

    assert "resistência" in chunk.text
    assert "resis-\ntência" in content[chunk.char_start : chunk.char_end]
    assert (chunk.char_start, chunk.char_end) == (0, len(content))


def test_leading_whitespace_empty_pages_and_page_joins_are_accounted_for():
    pages = [
        "   \n\n  Primeira página com texto suficiente para ser uma passagem.  \n",
        "",
        "   ",
        "\n\nSegunda página, depois de duas vazias, também com texto suficiente.\n\n",
    ]
    chunks = _chunks(pages, overlap_chars=0)
    content = _content(pages)

    (chunk,) = chunks
    marked = content[chunk.char_start : chunk.char_end]
    assert marked.startswith("Primeira página")
    assert marked.endswith("suficiente.")
    # Both pages are in the one passage and the interval spans the page join.
    assert "\n\nSegunda página" in marked
    # Page numbers stay what they were: empty pages still count.
    assert (chunk.page_start, chunk.page_end) == (1, 4)


def test_a_long_paragraph_split_by_sentences_is_marked_piece_by_piece():
    sentences = [
        f"Sentença número {n} sobre ligas de alumínio e suas aplicações." for n in range(60)
    ]
    page = " ".join(sentences)
    chunks = _chunks([page], overlap_chars=0)
    content = _content([page])

    assert len(chunks) > 2
    # Each interval is a different stretch of the one paragraph, in order.
    assert chunks[0].char_start == 0
    assert chunks[-1].char_end == len(content)
    for chunk in chunks:
        assert _words(content[chunk.char_start : chunk.char_end]) == _words(chunk.text)
    starts = [c.char_start for c in chunks]
    assert starts == sorted(set(starts))


def test_a_repeated_sentence_is_marked_where_it_really_is():
    # The word search finds the *first* occurrence; the interval is the one cited.
    repeated = "Esta frase se repete em dois lugares diferentes do documento inteiro."
    first = repeated + " " + "Preenchimento. " * 5
    second = "Outro assunto totalmente diferente, com bastante texto para ocupar uma passagem. " * 2
    pages = [first, "SEÇÃO DOIS\n\n" + second + repeated]
    chunks = _chunks(pages, overlap_chars=0)
    content = _content(pages)

    last = chunks[-1]
    marked = content[last.char_start : last.char_end]
    assert marked.endswith(repeated)
    assert last.char_start > content.index(repeated)


def test_a_heading_is_not_inside_the_interval_of_the_passage_under_it():
    page = "1.2 Seleção de materiais\n\nO texto sob o título tem comprimento suficiente aqui."
    (chunk,) = _chunks([page])
    content = _content([page])

    assert chunk.heading == "1.2 Seleção de materiais"
    assert (
        content[chunk.char_start : chunk.char_end]
        == "O texto sob o título tem comprimento suficiente aqui."
    )


def test_a_short_tail_merged_into_the_previous_passage_extends_its_interval():
    body = "Corpo principal da seção com texto bastante longo para ser a passagem. " * 3
    pages = [body.strip() + "\n\nFim."]
    chunks = _chunks(pages, overlap_chars=0)
    content = _content(pages)

    assert len(chunks) == 1
    assert chunks[0].char_end == len(content)
    assert content[chunks[0].char_start : chunks[0].char_end].endswith("Fim.")


def test_chunks_have_no_position_when_built_by_hand():
    # The defaults are None: a position is never made up for a chunk the chunker did not place.
    chunk = Chunk(ordinal=0, text="x", page_start=None, page_end=None, heading=None)
    assert chunk.char_start is None and chunk.char_end is None


def test_the_same_text_always_gives_the_same_intervals():
    pages = ["\n\n".join("Seção. " + "dado repetido de ensaio. " * 40 for _ in range(5))]
    assert [(c.char_start, c.char_end) for c in _chunks(pages)] == [
        (c.char_start, c.char_end) for c in _chunks(pages)
    ]


def test_the_word_count_of_each_marked_stretch_matches_for_a_noisy_document():
    # A document with every artefact at once: wraps, hyphens, tabs, blank-line runs.
    raw = (
        "1 INTRODUÇÃO\n\n"
        "A sele-\nção de mate-\nriais parte das fun-\nções do com-\nponente.\n\n\n\n"
        "As proprie-\ndades\tmecânicas\ne térmi-\ncas decidem.\n"
    )
    chunks = _chunks([raw], overlap_chars=0)
    content = _content([raw])
    for chunk in chunks:
        marked = re.sub(r"-\n(?=\w)", "", content[chunk.char_start : chunk.char_end])
        assert _words(marked.replace("\n", " ")) == _words(chunk.text)
