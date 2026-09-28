"""OpenAlex client (D-97): parsing, the key, and every way the API says no.

Hermetic: every request goes to an ``httpx.MockTransport`` handler that also
checks the host, so a test that reached for anything but ``api.openalex.org``
fails instead of leaving the machine.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import date
from types import SimpleNamespace

import httpx
import pytest

from app.domain.errors import NotFoundError, ServiceUnavailableError, ValidationError
from app.integrations import openalex
from app.integrations.errors import ExternalUnavailableError

UA = "MaterialSelectAI/test (+https://example.org; contato@example.org)"
KEY = "chave-secreta-123"


def _settings(key: str = KEY, mailto: str = "") -> SimpleNamespace:
    return SimpleNamespace(openalex_api_key=key, openalex_mailto=mailto)


def _client(handler: Callable[[httpx.Request], httpx.Response], seen: list[httpx.Request]):
    def recording(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        assert request.url.scheme == "https"
        assert request.url.host == "api.openalex.org", request.url
        return handler(request)

    return httpx.Client(
        transport=httpx.MockTransport(recording),
        headers={"User-Agent": UA},
        follow_redirects=False,
    )


def _work_json(**overrides: object) -> dict:
    data: dict = {
        "id": "https://openalex.org/W2741809807",
        "display_name": "Seleção de <i>materiais</i> &amp; processos",
        "publication_year": 2019,
        "authorships": [
            {"author": {"display_name": "Ana Souza"}},
            {"author": {"display_name": "Bruno Lima"}},
            {"author": {"display_name": "Carla Dias"}},
            {"author": {}},
        ],
        "primary_location": {"source": {"display_name": "Materials &amp; Design"}},
        "doi": "https://doi.org/10.1016/j.matdes.2019.01.001",
        "abstract_inverted_index": {
            "O": [0],
            "aço": [1, 5],
            "inoxidável": [2],
            "resiste": [3],
            "e": [4],
            "carbono": [6],
        },
        "open_access": {"oa_url": "https://repositorio.example.org/artigo.pdf"},
        "best_oa_location": None,
    }
    data.update(overrides)
    return data


def _ok(payload: object) -> httpx.Response:
    return httpx.Response(200, json=payload)


# --- rebuild_abstract ----------------------------------------------------------


def test_rebuild_abstract_puts_each_word_back_at_its_positions() -> None:
    index = {"mundo": [1], "olá": [0, 2], "!": [3]}
    assert openalex.rebuild_abstract(index) == "olá mundo olá !"


@pytest.mark.parametrize("value", [None, {}, [], "texto", {"a": "0"}, {"a": [True, -1]}])
def test_rebuild_abstract_without_a_usable_index_is_none(value: object) -> None:
    assert openalex.rebuild_abstract(value) is None


def test_rebuild_abstract_first_listed_word_keeps_a_contested_position() -> None:
    assert openalex.rebuild_abstract({"um": [0], "dois": [0, 1]}) == "um dois"


def test_rebuild_abstract_refuses_rather_than_truncates_past_the_cap() -> None:
    index = {"curto": [0], "absurdo": [openalex.MAX_ABSTRACT_WORDS + 1]}
    assert openalex.rebuild_abstract(index) is None
    assert openalex.rebuild_abstract({"ok": [openalex.MAX_ABSTRACT_WORDS]}) == "ok"


def test_rebuild_abstract_leaves_gaps_closed_and_collapses_spaces() -> None:
    assert openalex.rebuild_abstract({"a": [0], "b  ": [7], "c": [3]}) == "a c b"


# --- identifiers -----------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("W2741809807", "W2741809807"),
        ("  W1  ", "W1"),
        ("https://openalex.org/W2741809807", "W2741809807"),
    ],
)
def test_normalise_work_id_accepts_the_short_and_public_forms(value: str, expected: str) -> None:
    assert openalex.normalise_work_id(value) == expected


@pytest.mark.parametrize(
    "value",
    [
        "",
        "w123",
        "W12a",
        "A123",
        "W",
        "W1/../../authors",
        "https://evil.example/W1",
        "http://openalex.org/W1",
        "https://openalex.org/W1?x=1",
        "W" + "1" * 16,
        "W١٢٣",
        "https://openalex.org/W١٢٣",
        None,
    ],
)
def test_normalise_work_id_refuses_anything_else(value: object) -> None:
    with pytest.raises(ValidationError):
        openalex.normalise_work_id(value)  # type: ignore[arg-type]


# --- the key -----------------------------------------------------------------------


def test_without_a_key_article_search_is_off_with_the_reason_written() -> None:
    ok, reason = openalex.enabled(_settings(key=""))
    assert ok is False
    assert reason is not None and "OpenAlex" in reason and "OPENALEX_API_KEY" in reason
    assert openalex.enabled(_settings()) == (True, None)
    assert openalex.enabled(SimpleNamespace()) == (False, openalex.DISABLED_REASON)


def test_without_a_key_nothing_leaves_the_server() -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: pytest.fail("no request expected"), seen)
    with pytest.raises(ExternalUnavailableError) as search_error:
        openalex.search(client, _settings(key=""), "aço")
    with pytest.raises(ExternalUnavailableError):
        openalex.work(client, _settings(key=" "), "W1")
    assert seen == []
    assert search_error.value.args[0] == openalex.DISABLED_REASON
    # 503 through the existing handler, not a new mapping.
    assert isinstance(search_error.value, ServiceUnavailableError)


# --- search ------------------------------------------------------------------------


def test_search_sends_key_select_and_user_agent_and_parses_every_field() -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: _ok({"meta": {"count": 1}, "results": [_work_json()]}), seen)

    works = openalex.search(client, _settings(mailto="turma@example.org"), "  aço   inox ", 5)

    assert len(seen) == 1
    request = seen[0]
    assert request.method == "GET"
    assert request.url.path == "/works"
    assert request.headers["User-Agent"] == UA
    params = request.url.params
    assert params["search"] == "aço inox"
    assert params["per_page"] == "5"
    assert params["api_key"] == KEY
    assert params["mailto"] == "turma@example.org"
    assert set(params["select"].split(",")) >= {
        "id",
        "display_name",
        "abstract_inverted_index",
        "authorships",
        "open_access",
    }

    assert works == [
        openalex.OpenAlexWork(
            id="W2741809807",
            title="Seleção de materiais & processos",
            year=2019,
            authors=["Ana Souza", "Bruno Lima", "Carla Dias"],
            venue="Materials & Design",
            doi="10.1016/j.matdes.2019.01.001",
            abstract="O aço inoxidável resiste e aço carbono",
            oa_url="https://repositorio.example.org/artigo.pdf",
            url="https://openalex.org/W2741809807",
        )
    ]
    assert works[0].has_text is True
    assert works[0].license == openalex.LICENSE
    assert "CC0" in openalex.LICENSE and "editora" in openalex.LICENSE


def test_search_omits_mailto_when_not_configured() -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: _ok({"results": []}), seen)
    assert openalex.search(client, _settings(), "aço") == []
    assert "mailto" not in seen[0].url.params


def test_search_keeps_works_without_abstract_and_states_what_is_missing() -> None:
    bare = _work_json(
        id="https://openalex.org/W9",
        display_name=None,
        publication_year=None,
        authorships=[],
        primary_location=None,
        doi=None,
        abstract_inverted_index=None,
        open_access={"oa_url": None},
        best_oa_location={"pdf_url": None, "landing_page_url": "https://oa.example.org/9"},
    )
    seen: list[httpx.Request] = []
    client = _client(lambda _r: _ok({"results": [bare]}), seen)

    [work] = openalex.search(client, _settings(), "aço")

    assert work.id == "W9"
    assert work.abstract is None and work.has_text is False
    assert work.year is None and work.venue is None and work.doi is None
    assert work.authors == []
    assert work.title == "Trabalho sem título no OpenAlex (W9)"
    assert work.oa_url == "https://oa.example.org/9"


def test_search_skips_results_without_a_valid_id_and_unsafe_links() -> None:
    results = [
        _work_json(id=None),
        _work_json(id="https://evil.example/W1"),
        "not a work",
        _work_json(
            id="https://openalex.org/W5",
            open_access={"oa_url": "javascript:alert(1)"},
            best_oa_location=None,
            doi="não é doi",
            publication_year=True,
        ),
    ]
    seen: list[httpx.Request] = []
    client = _client(lambda _r: _ok({"results": results}), seen)

    [work] = openalex.search(client, _settings(), "aço")

    assert work.id == "W5"
    assert work.oa_url is None
    assert work.doi is None
    assert work.year is None


@pytest.mark.parametrize(("asked", "sent"), [(0, "1"), (-3, "1"), (8, "8"), (500, "25")])
def test_search_clamps_the_page_size(asked: int, sent: str) -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: _ok({"results": []}), seen)
    openalex.search(client, _settings(), "aço", asked)
    assert seen[0].url.params["per_page"] == sent


@pytest.mark.parametrize("query", ["", "   ", "x" * (openalex.MAX_QUERY_CHARS + 1)])
def test_search_refuses_an_empty_or_pasted_query_before_the_network(query: str) -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: pytest.fail("no request expected"), seen)
    with pytest.raises(ValidationError):
        openalex.search(client, _settings(), query)
    assert seen == []


def test_search_with_an_unreadable_body_is_a_503() -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: httpx.Response(200, content=b"<html>oops</html>"), seen)
    with pytest.raises(ExternalUnavailableError, match="não deu para ler"):
        openalex.search(client, _settings(), "aço")

    client = _client(lambda _r: _ok({"results": "no"}), seen)
    with pytest.raises(ExternalUnavailableError, match="não deu para ler"):
        openalex.search(client, _settings(), "aço")


# --- work ------------------------------------------------------------------------------


def test_work_reads_one_work_by_its_public_url() -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: _ok(_work_json()), seen)

    work = openalex.work(client, _settings(), "https://openalex.org/W2741809807")

    assert seen[0].url.path == "/works/W2741809807"
    assert seen[0].url.params["api_key"] == KEY
    assert "select" in seen[0].url.params
    assert seen[0].headers["User-Agent"] == UA
    assert work.id == "W2741809807"
    assert work.url == openalex.landing_url("W2741809807")


def test_work_not_found_is_a_404() -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: httpx.Response(404, json={"error": "not found"}), seen)
    with pytest.raises(NotFoundError, match="W404"):
        openalex.work(client, _settings(), "W404")


def test_work_merged_into_another_follows_one_hop_on_the_same_api() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/works/W1":
            return httpx.Response(
                301, headers={"Location": "https://api.openalex.org/works/W2?select=id"}
            )
        return _ok(_work_json(id="https://openalex.org/W2"))

    seen: list[httpx.Request] = []
    work = openalex.work(_client(handler, seen), _settings(), "W1")

    assert [r.url.path for r in seen] == ["/works/W1", "/works/W2"]
    assert all(r.url.params["api_key"] == KEY for r in seen)
    assert work.id == "W2"


@pytest.mark.parametrize(
    "location",
    [
        "https://evil.example/works/W2",
        "https://api.openalex.org/authors/A1",
        "/works/not-a-work",
    ],
)
def test_work_never_follows_a_redirect_elsewhere(location: str) -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: httpx.Response(301, headers={"Location": location}), seen)
    with pytest.raises(ExternalUnavailableError):
        openalex.work(client, _settings(), "W1")
    assert len(seen) == 1


def test_work_follows_at_most_one_merge() -> None:
    seen: list[httpx.Request] = []
    client = _client(
        lambda r: httpx.Response(
            301, headers={"Location": f"/works/W{int(r.url.path.rsplit('W', 1)[1]) + 1}"}
        ),
        seen,
    )
    with pytest.raises(ExternalUnavailableError):
        openalex.work(client, _settings(), "W1")
    assert len(seen) == 2


def test_work_with_an_unusable_body_is_a_503() -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: _ok({"id": None}), seen)
    with pytest.raises(ExternalUnavailableError):
        openalex.work(client, _settings(), "W1")


# --- refusals -------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("status", "reason"),
    [
        (429, openalex.QUOTA_EXHAUSTED),
        (403, openalex.RATE_LIMITED),
        (401, openalex.KEY_REFUSED),
        (500, openalex.SERVICE_DOWN),
        (503, openalex.SERVICE_DOWN),
    ],
)
def test_each_refusal_has_its_own_reason_and_never_names_the_key(status: int, reason: str) -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: httpx.Response(status, json={"error": "x"}), seen)
    for call in (
        lambda: openalex.search(client, _settings(), "aço"),
        lambda: openalex.work(client, _settings(), "W1"),
    ):
        with pytest.raises(ExternalUnavailableError) as caught:
            call()
        assert caught.value.args[0] == reason
        assert KEY not in str(caught.value)


def test_the_reasons_are_distinct_and_say_when_it_comes_back() -> None:
    reasons = {
        openalex.QUOTA_EXHAUSTED,
        openalex.RATE_LIMITED,
        openalex.KEY_REFUSED,
        openalex.SERVICE_DOWN,
        openalex.TIMED_OUT,
        openalex.UNREACHABLE,
    }
    assert len(reasons) == 6
    assert "amanhã" in openalex.QUOTA_EXHAUSTED
    assert "minuto" in openalex.RATE_LIMITED
    assert all("OpenAlex" in reason for reason in reasons)


def test_a_bad_request_is_the_query_s_problem() -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: httpx.Response(400, json={"error": "bad"}), seen)
    with pytest.raises(ValidationError):
        openalex.search(client, _settings(), "aço")


def test_an_unexpected_status_is_a_503_with_words() -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: httpx.Response(418), seen)
    with pytest.raises(ExternalUnavailableError, match="inesperada"):
        openalex.search(client, _settings(), "aço")


@pytest.mark.parametrize(
    ("exc", "reason"),
    [
        (httpx.ReadTimeout, openalex.TIMED_OUT),
        (httpx.ConnectTimeout, openalex.TIMED_OUT),
        (httpx.ConnectError, openalex.UNREACHABLE),
        (httpx.RemoteProtocolError, openalex.UNREACHABLE),
    ],
)
def test_network_failures_are_503s_without_the_url(exc: type[Exception], reason: str) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise exc(f"falhou em {request.url}", request=request)  # type: ignore[call-arg]

    seen: list[httpx.Request] = []
    client = _client(handler, seen)
    with pytest.raises(ExternalUnavailableError) as caught:
        openalex.search(client, _settings(), "aço")
    assert caught.value.args[0] == reason
    # The httpx error carries the URL — key included — so it is not chained.
    assert caught.value.__cause__ is None
    assert caught.value.__suppress_context__ is True
    assert KEY not in str(caught.value)


# --- attribution ------------------------------------------------------------------------


def test_attribution_cites_the_work_and_says_whose_the_abstract_is() -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: _ok({"results": [_work_json()]}), seen)
    [work] = openalex.search(client, _settings(), "aço")

    text = openalex.attribution(work, today=date(2026, 9, 26))

    assert "“Seleção de materiais & processos”" in text
    assert "Ana Souza et al. (2019)" in text
    assert "Materials & Design" in text
    assert "doi:10.1016/j.matdes.2019.01.001" in text
    assert "https://openalex.org/W2741809807" in text
    assert "26/09/2026" in text
    assert "CC0" in text and "editora" in text


@pytest.mark.parametrize(
    ("authors", "expected"),
    [
        ([], "autoria não informada (s.d.)"),
        (["Ana"], "de Ana (s.d.)"),
        (["Ana", "Bia"], "de Ana e Bia (s.d.)"),
    ],
)
def test_attribution_writes_missing_authors_and_year(authors: list[str], expected: str) -> None:
    work = openalex.OpenAlexWork(
        id="W1", title="T", year=None, authors=authors, url="https://openalex.org/W1"
    )
    text = openalex.attribution(work, today=date(2026, 1, 2))
    assert expected in text
    assert "02/01/2026" in text
    assert "doi:" not in text


def test_the_parsed_work_serialises_to_json_for_the_source_meta() -> None:
    seen: list[httpx.Request] = []
    client = _client(lambda _r: _ok({"results": [_work_json()]}), seen)
    [work] = openalex.search(client, _settings(), "aço")
    assert json.loads(json.dumps(work.authors)) == ["Ana Souza", "Bruno Lima", "Carla Dias"]
