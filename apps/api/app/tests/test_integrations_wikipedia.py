"""Wikipedia client (D-97): search, page text laid out for the chunker, credit.

Hermetic: every request goes to an ``httpx.MockTransport`` handler that checks
the host and the User-Agent, so nothing leaves the machine and nothing reaches
a host other than the configured edition's.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import date
from types import SimpleNamespace

import httpx
import pytest

from app.ai.guardrails import numbers_in, ungrounded_numbers
from app.domain.errors import NotFoundError, ServiceUnavailableError, ValidationError
from app.integrations import wikipedia
from app.integrations.errors import ExternalUnavailableError
from app.knowledge.chunking import chunk_text
from app.knowledge.readers import ExtractedText

UA = "MaterialSelectAI/test (+https://example.org; contato@example.org)"
TODAY = date(2026, 9, 26)

EXTRACT = (
    "O aço inoxidável é uma liga de ferro com cromo.\n"
    "É usado em cutelaria e em equipamentos hospitalares.\n"
    "\n\n"
    "== História ==\n"
    "Harry Brearley obteve a liga em 1913, em Sheffield.\n"
    "\n\n"
    "== Propriedades ==\n"
    "A resistência à corrosão vem da camada passiva de óxido de cromo.\n"
    "\n\n"
    "=== Propriedades mecânicas: ===\n"
    "O módulo de elasticidade fica perto de 193 GPa.\n"
    "\n\n"
    "== Referências ==\n"
    "\n\n"
    "== Ver também ==\n"
    "Aço-carbono\n"
)


def _settings(lang: str = "pt") -> SimpleNamespace:
    return SimpleNamespace(wikipedia_lang=lang)


def _client(
    handler: Callable[[httpx.Request], httpx.Response],
    seen: list[httpx.Request],
    host: str = "pt.wikipedia.org",
) -> httpx.Client:
    def recording(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        assert request.url.scheme == "https"
        assert request.url.host == host, request.url
        assert request.url.path == "/w/api.php"
        assert request.headers["User-Agent"] == UA
        return handler(request)

    return httpx.Client(
        transport=httpx.MockTransport(recording),
        headers={"User-Agent": UA},
        follow_redirects=False,
    )


def _page_json(**overrides: object) -> dict:
    page: dict = {
        "pageid": 4242,
        "ns": 0,
        "title": "Aço inoxidável",
        "extract": EXTRACT,
        "lastrevid": 70000001,
        "fullurl": "https://pt.wikipedia.org/wiki/A%C3%A7o_inoxid%C3%A1vel",
        "revisions": [{"revid": 70000002, "parentid": 69999999}],
    }
    page.update(overrides)
    return {"batchcomplete": True, "query": {"pages": [page]}}


def _ok(payload: object) -> httpx.Response:
    return httpx.Response(200, json=payload)


# --- configuration -------------------------------------------------------------------


def test_the_portuguese_edition_is_on_by_default() -> None:
    assert wikipedia.enabled(SimpleNamespace()) == (True, None)
    assert wikipedia.enabled(_settings("en")) == (True, None)


@pytest.mark.parametrize("lang", ["evil.example/#", "pt.evil", "p", "PT BR", "pt_br", "../x"])
def test_a_language_that_is_not_a_code_turns_it_off_before_any_request(lang: str) -> None:
    ok, reason = wikipedia.enabled(_settings(lang))
    assert ok is False and reason and "WIKIPEDIA_LANG" in reason

    seen: list[httpx.Request] = []
    client = _client(lambda _r: pytest.fail("no request expected"), seen)
    with pytest.raises(ExternalUnavailableError) as caught:
        wikipedia.search(client, _settings(lang), "aço")
    with pytest.raises(ExternalUnavailableError):
        wikipedia.page(client, _settings(lang), 1)
    assert seen == []
    assert isinstance(caught.value, ServiceUnavailableError)


# --- search ------------------------------------------------------------------------


def test_search_sends_the_documented_parameters_and_strips_the_snippet() -> None:
    payload = {
        "batchcomplete": True,
        "query": {
            "search": [
                {
                    "ns": 0,
                    "title": "Aço inoxidável",
                    "pageid": 4242,
                    "snippet": (
                        'O <span class="searchmatch">aço</span> inoxid&aacute;vel '
                        "&amp; o &lt;b&gt;cromo&lt;/b&gt;"
                    ),
                },
                {"ns": 0, "title": "Aço-carbono", "pageid": 77, "snippet": ""},
                {"ns": 0, "title": "", "pageid": 78},
                {"ns": 0, "title": "Sem id", "pageid": True},
                "lixo",
            ]
        },
    }
    seen: list[httpx.Request] = []
    client = _client(lambda _r: _ok(payload), seen)

    hits = wikipedia.search(client, _settings(), "  aço   inox ", 5)

    assert len(seen) == 1
    params = seen[0].url.params
    assert params["action"] == "query"
    assert params["list"] == "search"
    assert params["srsearch"] == "aço inox"
    assert params["srlimit"] == "5"
    assert params["srnamespace"] == "0"
    assert params["format"] == "json"
    assert params["formatversion"] == "2"
    assert hits == [
        wikipedia.WikiHit(
            pageid=4242,
            title="Aço inoxidável",
            # Tags stripped *before* entities are decoded: the escaped markup
            # the article itself wrote stays as the text it is.
            snippet="O aço inoxidável & o <b>cromo</b>",
            url="https://pt.wikipedia.org/wiki/A%C3%A7o_inoxid%C3%A1vel",
        ),
        wikipedia.WikiHit(
            pageid=77,
            title="Aço-carbono",
            snippet=None,
            url="https://pt.wikipedia.org/wiki/A%C3%A7o-carbono",
        ),
    ]


def test_search_goes_to_the_configured_edition_only() -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: _ok({"query": {"search": []}}), seen, host="en.wikipedia.org")
    assert wikipedia.search(client, _settings("en"), "steel") == []
    assert [r.url.host for r in seen] == ["en.wikipedia.org"]


@pytest.mark.parametrize(("asked", "sent"), [(0, "1"), (8, "8"), (999, "20")])
def test_search_clamps_the_page_size(asked: int, sent: str) -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: _ok({"query": {"search": []}}), seen)
    wikipedia.search(client, _settings(), "aço", asked)
    assert seen[0].url.params["srlimit"] == sent


@pytest.mark.parametrize("query", ["", "  ", "x" * (wikipedia.MAX_QUERY_CHARS + 1)])
def test_search_refuses_an_empty_or_pasted_query_before_the_network(query: str) -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: pytest.fail("no request expected"), seen)
    with pytest.raises(ValidationError):
        wikipedia.search(client, _settings(), query)
    assert seen == []


def test_article_url_matches_mediawiki_escaping() -> None:
    assert (
        wikipedia.article_url("pt", "AC/DC (banda)")
        == "https://pt.wikipedia.org/wiki/AC/DC_(banda)"
    )
    assert wikipedia.article_url("pt", "L'Oréal") == "https://pt.wikipedia.org/wiki/L%27Or%C3%A9al"
    assert wikipedia.article_url("pt", "C++?#") == "https://pt.wikipedia.org/wiki/C%2B%2B%3F%23"


# --- page ------------------------------------------------------------------------------


def test_page_sends_the_documented_parameters() -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: _ok(_page_json()), seen)

    wikipedia.page(client, _settings(), 4242, today=TODAY)

    params = seen[0].url.params
    assert params["action"] == "query"
    assert set(params["prop"].split("|")) == {"extracts", "info", "revisions"}
    assert params["pageids"] == "4242"
    assert params["explaintext"] == "1"
    assert params["exsectionformat"] == "wiki"
    assert params["inprop"] == "url"
    assert params["rvprop"] == "ids"
    assert params["format"] == "json"
    assert params["formatversion"] == "2"


def test_page_returns_the_text_laid_out_and_the_credit_cc_by_sa_requires() -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: _ok(_page_json()), seen)

    article = wikipedia.page(client, _settings(), 4242, today=TODAY)

    assert article.pageid == 4242
    assert article.title == "Aço inoxidável"
    assert article.url == "https://pt.wikipedia.org/wiki/A%C3%A7o_inoxid%C3%A1vel"
    assert article.revision_id == 70000002
    assert article.license == "CC BY-SA 4.0"
    assert article.license_url == "https://creativecommons.org/licenses/by-sa/4.0/"
    assert article.lang == "pt"
    assert article.retrieved_on == TODAY
    assert "== " not in article.text
    assert "\n\n1 História\n\n" in article.text
    assert "\n\n2 Propriedades › Propriedades mecânicas\n\n" in article.text

    credit = article.attribution
    for expected in (
        "“Aço inoxidável”",
        "Wikipédia em português",
        "https://pt.wikipedia.org/wiki/A%C3%A7o_inoxid%C3%A1vel",
        "colaboradores",
        "CC BY-SA 4.0",
        "https://creativecommons.org/licenses/by-sa/4.0/",
        "revisão 70000002",
        "obtido em 26/09/2026",
        "sem modificações de conteúdo",
        "dividido em trechos para busca",
    ):
        assert expected in credit, expected


def test_page_falls_back_to_lastrevid_and_writes_an_unknown_revision() -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: _ok(_page_json(revisions=None)), seen)
    assert wikipedia.page(client, _settings(), 4242, today=TODAY).revision_id == 70000001

    client = _client(lambda _r: _ok(_page_json(revisions=[], lastrevid=None)), seen)
    article = wikipedia.page(client, _settings(), 4242, today=TODAY)
    assert article.revision_id is None
    assert "revisão não informada" in article.attribution


def test_page_in_another_edition_names_it_in_the_credit() -> None:
    seen: list[httpx.Request] = []
    client = _client(
        lambda _r: _ok(_page_json(title="Stainless steel")), seen, host="en.wikipedia.org"
    )
    article = wikipedia.page(client, _settings("en"), 4242, today=TODAY)
    assert article.url == "https://en.wikipedia.org/wiki/Stainless_steel"
    assert "Wikipédia em inglês" in article.attribution
    assert wikipedia.edition_name("xx") == "Wikipédia (xx)"


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"missing": True}, "não existe"),
        ({"invalid": True}, "não existe"),
        ({"redirect": True}, "redirecionamento"),
        ({"ns": 2}, "não é um artigo"),
        ({"pageid": 1}, "não existe"),
    ],
)
def test_page_that_is_not_an_article_is_a_404(overrides: dict, message: str) -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: _ok(_page_json(**overrides)), seen)
    with pytest.raises(NotFoundError, match=message):
        wikipedia.page(client, _settings(), 4242, today=TODAY)


@pytest.mark.parametrize("extract", ["", "\n\n== Referências ==\n\n", None])
def test_page_without_text_is_a_400(extract: object) -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: _ok(_page_json(extract=extract)), seen)
    with pytest.raises(ValidationError, match="não tem texto"):
        wikipedia.page(client, _settings(), 4242, today=TODAY)


@pytest.mark.parametrize("pageid", [0, -5, True, "12"])
def test_page_refuses_a_bad_id_before_the_network(pageid: object) -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: pytest.fail("no request expected"), seen)
    with pytest.raises(ValidationError):
        wikipedia.page(client, _settings(), pageid)  # type: ignore[arg-type]
    assert seen == []


@pytest.mark.parametrize(("value", "expected"), [("4242", 4242), (" 7 ", 7), (9, 9)])
def test_parse_pageid_reads_a_request_key(value: object, expected: int) -> None:
    assert wikipedia.parse_pageid(value) == expected


@pytest.mark.parametrize("value", ["", "abc", "-1", "0", "1.5", "١٢", True, 1.5, None, 0])
def test_parse_pageid_refuses_anything_else(value: object) -> None:
    with pytest.raises(ValidationError):
        wikipedia.parse_pageid(value)


# --- refusals ------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("status", "reason"),
    [
        (429, wikipedia.RATE_LIMITED),
        (403, wikipedia.REFUSED),
        (500, wikipedia.SERVICE_DOWN),
        (503, wikipedia.SERVICE_DOWN),
    ],
)
def test_each_refusal_is_a_503_with_its_reason(status: int, reason: str) -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: httpx.Response(status), seen)
    with pytest.raises(ExternalUnavailableError) as caught:
        wikipedia.search(client, _settings(), "aço")
    assert caught.value.args[0] == reason
    with pytest.raises(ExternalUnavailableError) as caught:
        wikipedia.page(client, _settings(), 1)
    assert caught.value.args[0] == reason


@pytest.mark.parametrize(
    ("exc", "reason"),
    [
        (httpx.ReadTimeout, wikipedia.TIMED_OUT),
        (httpx.ConnectError, wikipedia.UNREACHABLE),
    ],
)
def test_network_failures_are_503s(exc: type[Exception], reason: str) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise exc("falhou", request=request)  # type: ignore[call-arg]

    seen: list[httpx.Request] = []
    with pytest.raises(ExternalUnavailableError) as caught:
        wikipedia.search(_client(handler, seen), _settings(), "aço")
    assert caught.value.args[0] == reason
    assert caught.value.__cause__ is None


def test_an_api_error_object_is_a_503() -> None:
    seen: list[httpx.Request] = []
    body = {"error": {"code": "ratelimited", "info": "You've exceeded your rate limit."}}
    client = _client(lambda _r: _ok(body), seen)
    with pytest.raises(ExternalUnavailableError) as caught:
        wikipedia.search(client, _settings(), "aço")
    assert caught.value.args[0] == wikipedia.API_REFUSED


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, content=b"<html>not json</html>"),
        httpx.Response(200, json=["not", "a", "dict"]),
        httpx.Response(200, json={"query": {}}),
        httpx.Response(301, headers={"Location": "https://evil.example/"}),
    ],
)
def test_an_unreadable_or_redirected_answer_is_a_503(response: httpx.Response) -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: response, seen)
    with pytest.raises(ExternalUnavailableError):
        wikipedia.search(client, _settings(), "aço")
    assert len(seen) == 1


# --- layout for the chunker -------------------------------------------------------------


def _chunks(text: str) -> list:
    return chunk_text(ExtractedText(pages=[text]), target_chars=80, overlap_chars=0)


def test_section_titles_become_the_headings_the_chunker_reads() -> None:
    text = wikipedia.format_extract(EXTRACT)
    chunks = _chunks(text)

    headings = [chunk.heading for chunk in chunks]
    assert headings == [
        None,
        "1 História",
        "2 Propriedades",
        "2 Propriedades › Propriedades mecânicas",
        # "Referências" is empty and not emitted, but it still counts: the
        # numbers follow the article's own list of sections.
        "4 Ver também",
    ]
    # Titles are labels, not passage text; every line of prose is in a passage.
    joined = " ".join(chunk.text for chunk in chunks)
    for line in EXTRACT.splitlines():
        if line and not line.startswith("=="):
            assert line in joined, line


def test_paragraphs_become_blocks_and_no_word_is_changed() -> None:
    text = wikipedia.format_extract("Primeiro parágrafo.\nSegundo   parágrafo.\n")
    assert text == "Primeiro parágrafo.\n\nSegundo parágrafo."


def test_a_paragraph_that_would_read_as_a_heading_is_joined_to_its_neighbour() -> None:
    extract = (
        "== Produção ==\n"
        "A produção mundial cresceu.\n"
        "1990 Fundação da usina\n"
        "Depois veio a expansão.\n"
        "AÇO INOX 304\n"
    )
    chunks = _chunks(wikipedia.format_extract(extract))
    assert {chunk.heading for chunk in chunks} == {"1 Produção"}
    joined = " ".join(chunk.text for chunk in chunks)
    for fragment in ("1990 Fundação da usina", "Depois veio a expansão.", "AÇO INOX 304"):
        assert fragment in joined


def test_a_paragraph_that_opens_a_section_as_a_heading_takes_the_next_one_along() -> None:
    extract = "== Linha do tempo ==\n1913 Primeira liga\nA liga foi patenteada depois.\n"
    chunks = _chunks(wikipedia.format_extract(extract))
    assert [c.heading for c in chunks] == ["1 Linha do tempo"]
    assert "1913 Primeira liga" in chunks[0].text


def test_a_section_that_reads_as_a_heading_keeps_its_title_in_front() -> None:
    extract = "Introdução do artigo.\n\n\n== Cronologia ==\n1990 Fundação\n2000 Expansão\n"
    text = wikipedia.format_extract(extract)
    assert "1 Cronologia\n\nCronologia\n1990 Fundação\n2000 Expansão" in text
    chunks = _chunks(text)
    assert chunks[-1].heading == "1 Cronologia"
    assert "1990 Fundação" in chunks[-1].text


def test_a_section_that_cannot_stand_alone_joins_the_one_before() -> None:
    extract = "Introdução do artigo.\n\n\n== 1990 ==\n2000 Expansão\n"
    text = wikipedia.format_extract(extract)
    chunks = _chunks(text)
    assert [c.heading for c in chunks] == [None]
    assert "2000 Expansão" in chunks[0].text


def test_trailing_punctuation_and_long_titles_still_read_as_headings() -> None:
    long_title = "Palavra " * 30
    extract = (
        "== Etimologia: ==\nTexto um.\n"
        f"== {long_title}==\nTexto dois.\n"
        f"=== {long_title}===\nTexto três.\n"
    )
    chunks = _chunks(wikipedia.format_extract(extract))
    headings = [chunk.heading for chunk in chunks]
    assert headings[0] == "1 Etimologia"
    assert all(h is not None and len(h) <= wikipedia.MAX_HEADING_CHARS for h in headings)
    assert headings[1] is not None and headings[1].startswith("2 Palavra")
    assert headings[1].endswith("…")


def test_section_markers_never_lend_a_passage_a_figure() -> None:
    extract = "".join(f"== Seção {n} ==\nTexto {n}.\n" for n in range(1, 131))
    extract += "=== Sub ===\nTexto final.\n"
    text = wikipedia.format_extract(extract)
    headings = {chunk.heading for chunk in _chunks(text)}
    markers = {int(h.split(" ", 1)[0]) for h in headings if h}
    assert markers and max(markers) <= wikipedia.MAX_SECTION_MARKER
    # A marker is an integer the guardrails already exempt, so a figure in the
    # heading's text is the article's own — "Seção 101" is the title.
    for heading in headings:
        assert heading is not None
        marker = heading.split(" ", 1)[0]
        assert ungrounded_numbers(marker, set()) == []
    assert "30 Seção 130 › Sub" in headings
    assert 130.0 in numbers_in("30 Seção 130 › Sub")


def test_a_leading_subsection_opens_the_first_section() -> None:
    text = wikipedia.format_extract("=== Solta ===\nTexto.\n== Depois ==\nMais.\n")
    assert [c.heading for c in _chunks(text)] == ["1 Solta", "2 Depois"]


def test_an_empty_extract_lays_out_to_nothing() -> None:
    assert wikipedia.format_extract("") == ""
    assert wikipedia.format_extract("\n\n== Referências ==\n\n== Notas ==\n") == ""
