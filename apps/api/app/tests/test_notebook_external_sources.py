"""Outside sources of the Cadernos, end to end through the API (D-97).

Every test here is hermetic: the outbound transport is an ``httpx.MockTransport``
and the resolver a fake, both installed over the FastAPI dependencies that
``conftest`` otherwise sets to fail the test on any network use. What these
tests pin is the integration — the order in which a request meets the rules:
owner first, refusals without the network, quota counted when a request leaves
(and kept even when the request then fails), and attribution carried from the
fetch into every citation.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from sqlalchemy.orm import Session

from app.config import Settings, settings
from app.integrations import gemini_search
from app.integrations.http import build_client, get_http_transport, get_resolver
from app.main import app
from app.models.notebook import Notebook
from app.models.user import User
from app.notebooks.html_text import EMPTY_PAGE_MESSAGE
from app.services import external_source_service as external
from app.services.external_source_service import ExternalSourceService
from app.tests import conftest

PUBLIC_IP = "93.184.216.34"
SITE = "exemplo.org"
PAGE_URL = f"https://{SITE}/titanio"
REDIRECT = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC123"
VIDEO_ID = "dQw4w9WgXcQ"
VIDEO_URL = f"https://youtu.be/{VIDEO_ID}"
WORK_ID = "W2741809807"
GEMINI_HOST = "generativelanguage.googleapis.com"

PARAGRAPH = (
    "O titânio grau 5 combina baixa densidade com alta resistência mecânica, e por "
    "isso aparece em estruturas aeronáuticas e em implantes. A liga tem densidade de "
    "4430 kg/m³ e módulo de elasticidade próximo de 114 GPa, com boa resistência à "
    "corrosão em água do mar."
)
TRANSCRIPT = (
    "0:00\nNesta aula vamos falar de seleção de materiais para estruturas leves.\n"
    "0:07\nO critério começa pelo índice de desempenho, que junta rigidez e densidade.\n"
    "0:15\nDepois o mapa de propriedades mostra quais famílias ficam acima da linha.\n"
    "0:24\nNo fim comparamos alumínio, titânio e compósitos de fibra de carbono.\n"
)


def _html(title: str = "Titânio grau 5", body: str = PARAGRAPH) -> bytes:
    return (
        f"<html><head><title>{title}</title></head><body><nav>menu</nav>"
        f"<article><h1>{title}</h1><p>{body}</p><p>{body}</p></article></body></html>"
    ).encode()


def _html_response(content: bytes | None = None) -> Callable[[httpx.Request], httpx.Response]:
    return lambda _request: httpx.Response(
        200,
        headers={"content-type": "text/html; charset=utf-8"},
        content=content if content is not None else _html(),
    )


def _abstract_index(text: str) -> dict[str, list[int]]:
    index: dict[str, list[int]] = {}
    for position, word in enumerate(text.split()):
        index.setdefault(word, []).append(position)
    return index


def _work(abstract: str | None = PARAGRAPH) -> dict:
    return {
        "id": f"https://openalex.org/{WORK_ID}",
        "display_name": "Fadiga de ligas de titânio",
        "publication_year": 2019,
        "authorships": [{"author": {"display_name": "Ana Souza"}}],
        "primary_location": {"source": {"display_name": "Revista de Materiais"}},
        "doi": "https://doi.org/10.1234/abc",
        "abstract_inverted_index": _abstract_index(abstract) if abstract else None,
        "open_access": {"oa_url": "https://repo.exemplo.org/w.pdf"},
    }


class Net:
    """The outside world, by host. Records every request and every lookup."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.lookups: list[str] = []
        self.routes: dict[str, Callable[[httpx.Request], httpx.Response]] = {}
        self.addresses: dict[str, list[str]] = {}

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        host = request.headers["host"]
        handler = self.routes.get(host)
        if handler is None:
            pytest.fail(f"pedido inesperado para {host}")
        return handler(request)

    def resolve(self, host: str, port: int) -> list[str]:
        self.lookups.append(host)
        return self.addresses.get(host, [PUBLIC_IP])

    @property
    def silent(self) -> bool:
        return not self.requests and not self.lookups


@pytest.fixture(autouse=True)
def _defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    """The documented defaults, whatever the environment running the suite says."""
    for name, value in {
        "ai_provider": "mock",
        "notebook_external_sources": True,
        "notebook_daily_fetches": 30,
        "notebook_daily_requests": 30,
        "openalex_api_key": "",
        "web_search_provider": "",
        "web_search_api_key": "",
        "ai_api_key": "",
        "ai_base_url": "",
        "wikipedia_lang": "pt",
    }.items():
        monkeypatch.setattr(settings, name, value)


@pytest.fixture()
def net(client) -> Net:
    world = Net()
    app.dependency_overrides[get_http_transport] = lambda: httpx.MockTransport(world.handle)
    app.dependency_overrides[get_resolver] = lambda: world.resolve
    return world


@pytest.fixture()
def notebook(client) -> dict:
    return client.post("/api/notebooks", json={"title": "Ligas leves"}).json()


def _nb(notebook: dict) -> str:
    return f"/api/notebooks/{notebook['id']}"


def _fetch_usage(client, notebook: dict) -> int:
    return client.get(_nb(notebook)).json()["fetch_usage"]["used"]


def _ai_usage(client, notebook: dict) -> int:
    return client.get(_nb(notebook)).json()["usage"]["used"]


# --- the defaults and the guard -------------------------------------------------------


def test_the_mock_provider_stays_the_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AI_PROVIDER", raising=False)
    assert Settings(_env_file=None).ai_provider == "mock"  # type: ignore[call-arg]


def test_the_suite_bans_the_network_unless_a_test_installs_its_own(client, notebook) -> None:
    """The conftest guard itself: with no handler installed, the first lookup
    fails the test instead of reaching a real resolver."""
    with pytest.raises(conftest.NetworkBannedError):
        client.post(f"{_nb(notebook)}/sources/url", json={"url": PAGE_URL})
    # Recorded too, so a swallowed attempt would still fail its test at
    # teardown; cleared here because this one was provoked on purpose.
    assert conftest._banned_attempts == [f"DNS {SITE}:443"]
    conftest._banned_attempts.clear()


def test_httpx_request_lines_are_not_logged_at_info() -> None:
    """OpenAlex takes its key in the query string, and httpx logs the URL at INFO."""
    assert external.logging.getLogger("httpx").getEffectiveLevel() >= logging.WARNING


# --- capabilities -----------------------------------------------------------------------


def test_capabilities_by_default(client) -> None:
    body = client.get("/api/notebooks/source-capabilities").json()
    assert set(body) == {"link", "youtube", "openalex", "wikipedia", "web"}
    assert body["link"] == {"enabled": True, "reason": None}
    assert body["youtube"] == {"enabled": True, "reason": None}
    assert body["wikipedia"] == {"enabled": True, "reason": None}
    assert body["openalex"]["enabled"] is False and "OPENALEX_API_KEY" in body["openalex"]["reason"]
    assert body["web"] == {"enabled": False, "reason": gemini_search.OFF_REASON}


def test_capabilities_follow_the_configuration(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "openalex_api_key", "chave-openalex")
    monkeypatch.setattr(settings, "web_search_provider", "gemini")
    monkeypatch.setattr(settings, "web_search_api_key", "AIza-busca")
    body = client.get("/api/notebooks/source-capabilities").json()
    assert body["openalex"] == {"enabled": True, "reason": None}
    assert body["web"] == {"enabled": True, "reason": None}


def test_the_master_switch_turns_every_outside_source_off(client, notebook, net, monkeypatch):
    monkeypatch.setattr(settings, "notebook_external_sources", False)
    body = client.get("/api/notebooks/source-capabilities").json()
    assert all(
        item == {"enabled": False, "reason": external.SWITCHED_OFF} for item in body.values()
    )

    for path, payload in (
        ("/sources/url", {"url": PAGE_URL}),
        ("/sources/youtube", {"url": VIDEO_URL}),
        ("/search", {"provider": "wikipedia", "query": "titânio"}),
        ("/sources/external", {"provider": "wikipedia", "key": "123"}),
    ):
        response = client.post(_nb(notebook) + path, json=payload)
        assert response.status_code == 503, (path, response.text)
        assert response.json()["detail"] == external.SWITCHED_OFF
    assert net.silent


@pytest.mark.parametrize(
    ("ai_base_url", "enabled"),
    [
        ("https://generativelanguage.googleapis.com/v1beta/openai/", True),
        ("https://api.groq.com/openai/v1", False),
        ("", False),
    ],
)
def test_the_ai_key_stands_in_for_web_search_only_on_the_gemini_api(
    client, monkeypatch, ai_base_url: str, enabled: bool
) -> None:
    """A Groq key is never sent to Google: the fallback needs AI_BASE_URL there."""
    monkeypatch.setattr(settings, "web_search_provider", "gemini")
    monkeypatch.setattr(settings, "ai_api_key", "chave-de-ia")
    monkeypatch.setattr(settings, "ai_base_url", ai_base_url)
    web = client.get("/api/notebooks/source-capabilities").json()["web"]
    assert web["enabled"] is enabled
    if not enabled:
        assert web["reason"] == gemini_search.FOREIGN_AI_KEY_REASON
    assert bool(gemini_search.resolve_key(settings)) is enabled


# --- a link ---------------------------------------------------------------------------


def test_a_link_becomes_a_source_with_its_origin_and_credit(client, notebook, net) -> None:
    net.routes[SITE] = _html_response()
    response = client.post(f"{_nb(notebook)}/sources/url", json={"url": PAGE_URL + "#topo"})
    assert response.status_code == 201, response.text
    source = response.json()
    assert source["kind"] == "site"
    assert source["title"] == "Titânio grau 5"
    assert source["url"] == PAGE_URL
    assert SITE in source["attribution"] and PAGE_URL in source["attribution"]
    assert source["license"] is None  # not known, never invented
    assert source["details"]["site_name"] == SITE
    assert source["details"]["found_via"] == "link"

    # Pinned: the request went to the validated address, the name in Host.
    [request] = net.requests
    assert request.url.host == PUBLIC_IP
    assert request.headers["host"] == SITE
    assert _fetch_usage(client, notebook) == 1

    detail = client.get(f"{_nb(notebook)}/sources/{source['id']}").json()
    assert "4430 kg/m³" in detail["content"]
    assert "menu" not in detail["content"]


def test_the_same_link_again_costs_nothing(client, notebook, net) -> None:
    net.routes[SITE] = _html_response()
    assert client.post(f"{_nb(notebook)}/sources/url", json={"url": PAGE_URL}).status_code == 201
    requests, lookups = len(net.requests), len(net.lookups)

    # Tracking parameters and fragment are not part of the address.
    again = client.post(f"{_nb(notebook)}/sources/url", json={"url": f"{PAGE_URL}?utm_source=x#s"})
    assert again.status_code == 409, again.text
    assert (len(net.requests), len(net.lookups)) == (requests, lookups)
    assert _fetch_usage(client, notebook) == 1


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/admin",
        "http://localhost/",
        "http://[::1]/",
        "http://169.254.169.254/latest/meta-data/",
        "http://2130706433/",
        "ftp://exemplo.org/arquivo",
        "http://usuario:senha@exemplo.org/",
    ],
)
def test_an_internal_address_is_refused_before_the_network(client, notebook, net, url) -> None:
    response = client.post(f"{_nb(notebook)}/sources/url", json={"url": url})
    assert response.status_code == 400, response.text
    assert PUBLIC_IP not in response.text
    assert net.requests == []
    assert _fetch_usage(client, notebook) == 0


def test_a_name_that_resolves_inside_is_refused_without_a_request(client, notebook, net) -> None:
    net.addresses["interno.exemplo.org"] = [PUBLIC_IP, "10.0.0.7"]
    response = client.post(
        f"{_nb(notebook)}/sources/url", json={"url": "https://interno.exemplo.org/"}
    )
    assert response.status_code == 400
    assert "10.0.0.7" not in response.text
    assert net.requests == []
    assert _fetch_usage(client, notebook) == 0


def test_a_redirect_inside_is_refused_and_counted(client, notebook, net) -> None:
    """The first request left, so it is counted, even though the hop is refused."""
    net.routes[SITE] = lambda _r: httpx.Response(302, headers={"location": "http://127.0.0.1/"})
    response = client.post(f"{_nb(notebook)}/sources/url", json={"url": PAGE_URL})
    assert response.status_code == 400
    assert len(net.requests) == 1
    assert _fetch_usage(client, notebook) == 1


def test_a_failed_fetch_is_still_counted(client, notebook, net) -> None:
    """The count is committed before the error travels: the request's session is
    closed without a commit, and without that the failure would be free."""
    net.routes[SITE] = lambda _r: httpx.Response(404)
    response = client.post(f"{_nb(notebook)}/sources/url", json={"url": PAGE_URL})
    assert response.status_code == 400
    assert _fetch_usage(client, notebook) == 1
    assert client.get(_nb(notebook)).json()["sources"] == []


def test_a_page_without_legible_text_is_refused_and_counted(client, notebook, net) -> None:
    net.routes[SITE] = _html_response(b"<html><body><div id='app'></div></body></html>")
    response = client.post(f"{_nb(notebook)}/sources/url", json={"url": PAGE_URL})
    assert response.status_code == 400
    assert response.json()["detail"] == EMPTY_PAGE_MESSAGE
    assert _fetch_usage(client, notebook) == 1


def test_plain_text_is_read_with_its_file_name_as_title(client, notebook, net) -> None:
    net.routes[SITE] = lambda _r: httpx.Response(
        200, headers={"content-type": "text/plain; charset=utf-8"}, content=PARAGRAPH.encode()
    )
    response = client.post(
        f"{_nb(notebook)}/sources/url", json={"url": f"https://{SITE}/notas_de_aula.txt"}
    )
    assert response.status_code == 201, response.text
    assert response.json()["title"] == "notas de aula"


def test_the_day_quota_refuses_before_the_network(client, notebook, net, monkeypatch) -> None:
    monkeypatch.setattr(settings, "notebook_daily_fetches", 1)
    net.routes[SITE] = _html_response()
    assert client.post(f"{_nb(notebook)}/sources/url", json={"url": PAGE_URL}).status_code == 201
    sent = len(net.requests)

    response = client.post(f"{_nb(notebook)}/sources/url", json={"url": f"https://{SITE}/aco"})
    assert response.status_code == 429
    assert "colar o texto" in response.json()["detail"]
    assert len(net.requests) == sent


def test_a_youtube_link_on_the_link_route_points_to_the_video_option(client, notebook, net):
    response = client.post(f"{_nb(notebook)}/sources/url", json={"url": VIDEO_URL})
    assert response.status_code == 400
    assert response.json()["detail"] == external.YOUTUBE_LINK_ON_URL_ROUTE
    assert net.silent


def test_a_typed_link_is_capped_at_500(client, notebook, net) -> None:
    too_long = client.post(
        f"{_nb(notebook)}/sources/url", json={"url": f"https://{SITE}/" + "a" * 500}
    )
    assert too_long.status_code == 422
    # Under the cap as typed, over it once normalised (each "é" becomes "%C3%A9").
    grows = f"https://{SITE}/" + "a" * 420 + "é" * 20
    assert len(grows) <= 500
    response = client.post(f"{_nb(notebook)}/sources/url", json={"url": grows})
    assert response.status_code == 400
    assert net.silent


def test_an_origin_wider_than_its_column_is_refused_not_cut(
    db_session: Session, test_user: User
) -> None:
    """PostgreSQL raises on a value wider than ``String(500)``; SQLite stores it.
    So the guard is ours, and this pins the guard itself."""
    notebook = Notebook(owner_id=test_user.id, title="Caderno")
    db_session.add(notebook)
    db_session.flush()
    client = build_client(settings, httpx.MockTransport(lambda _r: pytest.fail("rede")))
    service = ExternalSourceService(db_session, test_user, settings, client, lambda h, p: [])
    with pytest.raises(external.ValidationError) as caught:
        service._refuse_duplicate(notebook, "https://exemplo.org/" + "a" * 481)
    assert str(caught.value) == external.ORIGIN_TOO_LONG
    service._refuse_duplicate(notebook, "https://exemplo.org/" + "a" * 480)  # 500: fits
    client.close()


def test_a_long_page_title_is_cut_to_its_column(client, notebook, net) -> None:
    net.routes[SITE] = _html_response(_html(title="Titânio " * 60))
    response = client.post(f"{_nb(notebook)}/sources/url", json={"url": PAGE_URL})
    assert response.status_code == 201, response.text
    assert len(response.json()["title"]) == 300


def test_attribution_reaches_every_citation(client, notebook, net) -> None:
    net.routes[SITE] = _html_response()
    source = client.post(f"{_nb(notebook)}/sources/url", json={"url": PAGE_URL}).json()
    response = client.post(
        f"{_nb(notebook)}/chat", json={"question": "Qual a densidade do titânio grau 5?"}
    )
    assert response.status_code == 200, response.text
    citations = response.json()["answer"]["answer"]["citations"]
    assert citations
    for citation in citations:
        assert citation["source_url"] == PAGE_URL
        assert citation["source_attribution"] == source["attribution"]


# --- another person's notebook ------------------------------------------------------------


def test_another_persons_notebook_is_404_before_any_network(
    client, login_as, other_user: User, net, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "openalex_api_key", "chave-openalex")
    with login_as(other_user):
        theirs = client.post("/api/notebooks", json={"title": "Alheio"}).json()
    net.routes[SITE] = _html_response()

    for path, payload in (
        ("/sources/url", {"url": PAGE_URL}),
        ("/sources/youtube", {"url": VIDEO_URL, "transcript": TRANSCRIPT}),
        ("/search", {"provider": "wikipedia", "query": "titânio"}),
        ("/search", {"provider": "openalex", "query": "titânio"}),
        ("/sources/external", {"provider": "wikipedia", "key": "123"}),
        ("/sources/external", {"provider": "openalex", "key": WORK_ID}),
    ):
        response = client.post(_nb(theirs) + path, json=payload)
        assert response.status_code == 404, (path, response.text)
    assert net.silent


# --- a video --------------------------------------------------------------------------------


def _oembed(request: httpx.Request) -> httpx.Response:
    assert request.url.path == "/oembed"
    return httpx.Response(200, json={"title": "Seleção de materiais", "author_name": "Canal X"})


def test_a_video_without_transcript_asks_for_one(client, notebook, net) -> None:
    net.routes["www.youtube.com"] = _oembed
    for transcript in (None, "   \n "):
        payload = (
            {"url": VIDEO_URL}
            if transcript is None
            else {"url": VIDEO_URL, "transcript": transcript}
        )
        response = client.post(f"{_nb(notebook)}/sources/youtube", json=payload)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["needs_transcript"] is True
        assert body["source"] is None
        assert body["video_title"] == "Seleção de materiais"
        assert body["reason"] == external.NEEDS_TRANSCRIPT
    assert client.get(_nb(notebook)).json()["sources"] == []
    # Each oEmbed call left the server, so each is counted.
    assert _fetch_usage(client, notebook) == 2


def test_a_video_with_its_pasted_transcript_becomes_a_source(client, notebook, net) -> None:
    net.routes["www.youtube.com"] = _oembed
    response = client.post(
        f"{_nb(notebook)}/sources/youtube", json={"url": VIDEO_URL, "transcript": TRANSCRIPT}
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["needs_transcript"] is False
    source = body["source"]
    assert source["kind"] == "youtube"
    assert source["title"] == "Seleção de materiais"
    assert source["url"] == f"https://www.youtube.com/watch?v={VIDEO_ID}"
    assert source["details"]["transcript_origin"] == "colada"
    assert source["details"]["channel"] == "Canal X"
    assert source["details"]["video_id"] == VIDEO_ID
    content = client.get(f"{_nb(notebook)}/sources/{source['id']}").json()["content"]
    assert "0:07" not in content and "índice de desempenho" in content

    again = client.post(
        f"{_nb(notebook)}/sources/youtube",
        json={"url": f"https://www.youtube.com/watch?v={VIDEO_ID}", "transcript": TRANSCRIPT},
    )
    assert again.status_code == 409
    assert len(net.requests) == 1  # the duplicate never asked YouTube


def test_a_video_title_that_fails_is_not_fatal(client, notebook, net) -> None:
    net.routes["www.youtube.com"] = lambda _r: httpx.Response(500)
    response = client.post(
        f"{_nb(notebook)}/sources/youtube", json={"url": VIDEO_URL, "transcript": TRANSCRIPT}
    )
    assert response.status_code == 201
    assert response.json()["source"]["title"] == f"Vídeo do YouTube ({VIDEO_ID})"
    assert _fetch_usage(client, notebook) == 1


def test_a_video_with_the_quota_spent_skips_the_title_not_the_source(
    client, notebook, net, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "notebook_daily_fetches", 0)
    response = client.post(
        f"{_nb(notebook)}/sources/youtube", json={"url": VIDEO_URL, "transcript": TRANSCRIPT}
    )
    assert response.status_code == 201, response.text
    assert response.json()["source"]["title"] == f"Vídeo do YouTube ({VIDEO_ID})"
    assert net.silent


def test_a_channel_link_is_not_a_video(client, notebook, net) -> None:
    response = client.post(
        f"{_nb(notebook)}/sources/youtube", json={"url": "https://www.youtube.com/@canal"}
    )
    assert response.status_code == 400
    assert net.silent


# --- articles (OpenAlex) ---------------------------------------------------------------------


def _openalex(abstract: str | None = PARAGRAPH) -> Callable[[httpx.Request], httpx.Response]:
    def handle(request: httpx.Request) -> httpx.Response:
        assert parse_qs(urlsplit(str(request.url)).query)["api_key"] == ["chave-openalex"]
        if request.url.path == "/works":
            return httpx.Response(200, json={"results": [_work(abstract)]})
        assert request.url.path == f"/works/{WORK_ID}"
        return httpx.Response(200, json=_work(abstract))

    return handle


def test_articles_are_off_without_a_key(client, notebook, net) -> None:
    for path, payload in (
        ("/search", {"provider": "openalex", "query": "titânio"}),
        ("/sources/external", {"provider": "openalex", "key": WORK_ID}),
    ):
        response = client.post(_nb(notebook) + path, json=payload)
        assert response.status_code == 503
        assert "OPENALEX_API_KEY" in response.json()["detail"]
    assert net.silent


def test_an_article_is_found_and_added_with_its_credit(client, notebook, net, monkeypatch):
    monkeypatch.setattr(settings, "openalex_api_key", "chave-openalex")
    net.routes["api.openalex.org"] = _openalex()

    found = client.post(
        f"{_nb(notebook)}/search", json={"provider": "openalex", "query": "titânio"}
    )
    assert found.status_code == 200, found.text
    [result] = found.json()["results"]
    assert result["key"] == WORK_ID
    assert result["has_text"] is True
    assert result["already_added"] is False
    assert result["subtitle"] == "Ana Souza · 2019 · Revista de Materiais"

    added = client.post(
        f"{_nb(notebook)}/sources/external", json={"provider": "openalex", "key": WORK_ID}
    )
    assert added.status_code == 201, added.text
    source = added.json()
    assert source["kind"] == "artigo"
    assert source["url"] == f"https://openalex.org/{WORK_ID}"
    assert source["license"].startswith("Metadados CC0")
    assert source["details"]["authors"] == ["Ana Souza"]
    assert source["details"]["year"] == 2019
    assert source["details"]["doi"] == "10.1234/abc"
    assert source["details"]["oa_url"] == "https://repo.exemplo.org/w.pdf"
    assert _fetch_usage(client, notebook) == 2

    sent = len(net.requests)
    again = client.post(
        f"{_nb(notebook)}/sources/external",
        json={"provider": "openalex", "key": f"https://openalex.org/{WORK_ID}"},
    )
    assert again.status_code == 409
    assert len(net.requests) == sent
    marked = client.post(
        f"{_nb(notebook)}/search", json={"provider": "openalex", "query": "titânio"}
    ).json()
    assert marked["results"][0]["already_added"] is True


def test_an_article_subtitle_writes_every_absent_part(client, notebook, net, monkeypatch):
    """D-24: the subtitle is a finished string, so absence is written per part —
    never an empty segment or a dangling separator."""
    monkeypatch.setattr(settings, "openalex_api_key", "chave-openalex")
    bare = {"id": f"https://openalex.org/{WORK_ID}", "display_name": "Sem metadados"}
    net.routes["api.openalex.org"] = lambda _r: httpx.Response(200, json={"results": [bare]})
    found = client.post(f"{_nb(notebook)}/search", json={"provider": "openalex", "query": "x"})
    assert found.status_code == 200, found.text
    [result] = found.json()["results"]
    assert result["subtitle"] == (
        "autoria não informada · ano não informado · publicação não informada"
    )

    many = {
        **_work(),
        "publication_year": None,
        "authorships": [{"author": {"display_name": f"Autor {n}"}} for n in range(5)],
    }
    net.routes["api.openalex.org"] = lambda _r: httpx.Response(200, json={"results": [many]})
    [result] = client.post(
        f"{_nb(notebook)}/search", json={"provider": "openalex", "query": "x"}
    ).json()["results"]
    assert result["subtitle"] == (
        "Autor 0, Autor 1, Autor 2 et al. · ano não informado · Revista de Materiais"
    )


def test_an_article_without_abstract_is_refused_pointing_to_the_open_copy(
    client, notebook, net, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "openalex_api_key", "chave-openalex")
    net.routes["api.openalex.org"] = _openalex(abstract=None)
    found = client.post(f"{_nb(notebook)}/search", json={"provider": "openalex", "query": "x"})
    [result] = found.json()["results"]
    assert result["has_text"] is False
    assert result["url"] == "https://repo.exemplo.org/w.pdf"

    response = client.post(
        f"{_nb(notebook)}/sources/external", json={"provider": "openalex", "key": WORK_ID}
    )
    assert response.status_code == 400
    assert "https://repo.exemplo.org/w.pdf" in response.json()["detail"]
    assert _fetch_usage(client, notebook) == 2  # the search and the refused lookup


# --- Wikipedia ---------------------------------------------------------------------------------


def _wikipedia(request: httpx.Request) -> httpx.Response:
    params = parse_qs(urlsplit(str(request.url)).query)
    if params.get("list") == ["search"]:
        return httpx.Response(
            200,
            json={
                "query": {
                    "search": [
                        {
                            "pageid": 4242,
                            "title": "Titânio",
                            "snippet": '<span class="searchmatch">Titânio</span> é um metal',
                        }
                    ]
                }
            },
        )
    assert params["pageids"] == ["4242"]
    return httpx.Response(
        200,
        json={
            "query": {
                "pages": [
                    {
                        "pageid": 4242,
                        "ns": 0,
                        "title": "Titânio",
                        "extract": f"{PARAGRAPH}\n\n== Propriedades ==\n{PARAGRAPH}",
                        "revisions": [{"revid": 777}],
                    }
                ]
            }
        },
    )


def test_a_wikipedia_article_is_found_and_added_with_its_license(client, notebook, net):
    net.routes["pt.wikipedia.org"] = _wikipedia
    found = client.post(
        f"{_nb(notebook)}/search", json={"provider": "wikipedia", "query": "titânio"}
    )
    assert found.status_code == 200, found.text
    [result] = found.json()["results"]
    assert result == {
        "provider": "wikipedia",
        "key": "4242",
        "title": "Titânio",
        "subtitle": "Wikipédia em português",
        "snippet": "Titânio é um metal",
        "url": "https://pt.wikipedia.org/wiki/Tit%C3%A2nio",
        "license": "CC BY-SA 4.0",
        "has_text": True,
        "already_added": False,
    }

    added = client.post(
        f"{_nb(notebook)}/sources/external", json={"provider": "wikipedia", "key": "4242"}
    )
    assert added.status_code == 201, added.text
    source = added.json()
    assert source["kind"] == "wikipedia"
    assert source["url"] == "https://pt.wikipedia.org/wiki/Tit%C3%A2nio"
    assert source["license"] == "CC BY-SA 4.0"
    assert "revisão 777" in source["attribution"]
    assert source["details"]["revision_id"] == 777

    sent = len(net.requests)
    again = client.post(
        f"{_nb(notebook)}/sources/external", json={"provider": "wikipedia", "key": "4242"}
    )
    assert again.status_code == 409
    assert len(net.requests) == sent  # deduplicated by page id, before the network
    marked = client.post(
        f"{_nb(notebook)}/search", json={"provider": "wikipedia", "query": "titânio"}
    ).json()
    assert marked["results"][0]["already_added"] is True


def test_a_blank_query_is_refused_before_quota_and_network(client, notebook, net) -> None:
    response = client.post(f"{_nb(notebook)}/search", json={"provider": "wikipedia", "query": "  "})
    assert response.status_code == 400
    assert net.silent
    assert _fetch_usage(client, notebook) == 0


# --- the web --------------------------------------------------------------------------------------


def _gemini(request: httpx.Request) -> httpx.Response:
    assert request.url.path == "/v1beta/models/gemini-flash-latest:generateContent"
    return httpx.Response(
        200,
        json={
            "candidates": [
                {
                    "content": {"parts": [{"text": "TEXTO DO MODELO"}]},
                    "groundingMetadata": {
                        "groundingChunks": [
                            {"web": {"uri": REDIRECT, "title": "exemplo.org"}},
                            {"web": {"uri": REDIRECT + "2"}},
                        ],
                        "searchEntryPoint": {"renderedContent": "<div>Sugestões</div>"},
                    },
                }
            ]
        },
    )


def _web_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "web_search_provider", "gemini")
    monkeypatch.setattr(settings, "web_search_api_key", "AIza-busca")


def test_web_search_is_off_by_default(client, notebook, net) -> None:
    for path, payload in (
        ("/search", {"provider": "web", "query": "titânio"}),
        ("/sources/external", {"provider": "web", "key": REDIRECT}),
    ):
        response = client.post(_nb(notebook) + path, json=payload)
        assert response.status_code == 503
        assert response.json()["detail"] == gemini_search.OFF_REASON
    assert net.silent


def test_a_web_search_returns_links_and_spends_one_of_each_quota(
    client, notebook, net, monkeypatch
) -> None:
    _web_on(monkeypatch)
    net.routes[GEMINI_HOST] = _gemini
    response = client.post(f"{_nb(notebook)}/search", json={"provider": "web", "query": "titânio"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert [r["key"] for r in body["results"]] == [REDIRECT, REDIRECT + "2"]
    assert body["results"][1]["title"] == external.UNTITLED_WEB_HIT
    assert {r["subtitle"] for r in body["results"]} == {external.WEB_HIT_SUBTITLE}
    assert body["search_entry_point_html"] == "<div>Sugestões</div>"
    assert body["notice"] == external.WEB_SEARCH_NOTICE
    assert "TEXTO DO MODELO" not in response.text
    assert _fetch_usage(client, notebook) == 1
    assert _ai_usage(client, notebook) == 1


def test_a_web_hit_is_stored_by_the_page_it_led_to(client, notebook, net, monkeypatch) -> None:
    _web_on(monkeypatch)
    net.routes["vertexaisearch.cloud.google.com"] = lambda _r: httpx.Response(
        302, headers={"location": PAGE_URL}
    )
    net.routes[SITE] = _html_response()
    added = client.post(
        f"{_nb(notebook)}/sources/external", json={"provider": "web", "key": REDIRECT}
    )
    assert added.status_code == 201, added.text
    source = added.json()
    assert source["url"] == PAGE_URL
    assert source["details"]["found_via"] == "busca_web"

    # Another search's link to the same page: the duplicate shows only after
    # the redirect is followed, so it is a 409 that was counted.
    again = client.post(
        f"{_nb(notebook)}/sources/external", json={"provider": "web", "key": REDIRECT + "x"}
    )
    assert again.status_code == 409
    assert _fetch_usage(client, notebook) == 2
    # A typed link to that page is now a free duplicate: stored by the final URL.
    sent = len(net.requests)
    assert client.post(f"{_nb(notebook)}/sources/url", json={"url": PAGE_URL}).status_code == 409
    assert len(net.requests) == sent


def test_a_web_hit_long_redirect_link_is_accepted(client, notebook, net, monkeypatch) -> None:
    _web_on(monkeypatch)
    long_link = REDIRECT + "x" * 900
    net.routes["vertexaisearch.cloud.google.com"] = lambda _r: httpx.Response(
        302, headers={"location": PAGE_URL}
    )
    net.routes[SITE] = _html_response()
    added = client.post(
        f"{_nb(notebook)}/sources/external", json={"provider": "web", "key": long_link}
    )
    assert added.status_code == 201, added.text


# --- small pieces -------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "kept"),
    [
        ("https://exemplo.org/a", True),
        ("http://exemplo.org", True),
        ("javascript:alert(1)", False),
        ("data:text/html,x", False),
        ("//exemplo.org/a", False),
        (None, False),
        (42, False),
    ],
)
def test_only_web_addresses_are_stored_as_links(value, kept: bool) -> None:
    assert (external._http(value) is not None) is kept


def test_a_hanging_resolver_is_abandoned_at_the_deadline() -> None:
    release = threading.Event()

    def hanging(_host: str, _port: int) -> list[str]:
        release.wait(5)
        return [PUBLIC_IP]

    bounded = external.resolver_with_deadline(hanging, 0.05)
    try:
        with pytest.raises(OSError):
            bounded("exemplo.org", 443)
    finally:
        release.set()
    assert external.resolver_with_deadline(lambda h, p: [PUBLIC_IP], 1)("x.org", 443) == [PUBLIC_IP]


def test_capabilities_are_read_from_configuration_alone() -> None:
    config = SimpleNamespace(
        notebook_external_sources=True,
        openalex_api_key="k",
        wikipedia_lang="pt",
        web_search_provider="",
        web_search_api_key="",
        ai_api_key="",
        ai_base_url="",
    )
    caps = ExternalSourceService.capabilities(config)  # type: ignore[arg-type]
    assert caps.openalex.enabled and caps.wikipedia.enabled and not caps.web.enabled
