"""Fontes externas dos cadernos (D-97), a camada de dados: o ``meta`` de uma fonte,
a atribuição que viaja com cada citação, a deduplicação pela origem sem sair do
dono, a cota de buscas e os padrões de configuração que não custam nada.

Nada aqui sai para a rede: as fontes externas entram por ``_ingest`` com um
``meta`` montado à mão, que é exatamente o que o serviço de fontes externas
entrega depois de buscar.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config
from pydantic import ValidationError as PydanticValidationError

from alembic import command
from app.config import Settings, settings
from app.domain.errors import QuotaExceededError
from app.knowledge.readers import ExtractedText
from app.models.notebook import AIUsage, NotebookSource
from app.repositories.notebook_repository import NotebookRepository
from app.schemas.notebook import (
    AskIn,
    CitationOut,
    ExternalSourceIn,
    NotebookIn,
    SearchIn,
    SearchOut,
    SourceCapabilitiesOut,
    TextSourceIn,
    UrlSourceIn,
    YoutubeOut,
    YoutubeSourceIn,
)
from app.services.notebook_service import (
    NotebookService,
    _today,
    citations_for,
    passages_for,
)

WIKI_TEXT = (
    "O titânio é um elemento químico de símbolo Ti. Tem densidade de 4506 kg/m³ "
    "e é conhecido pela alta resistência à corrosão.\n\n"
    "Ligas de titânio aparecem em estruturas aeronáuticas e em implantes."
)
WIKI_URL = "https://pt.wikipedia.org/wiki/Tit%C3%A2nio"
ATTRIBUTION = (
    "Texto de “Titânio”, Wikipédia em português, colaboradores, CC BY-SA 4.0, "
    "revisão 123, obtido em 2026-09-25"
)
META = {
    "url": WIKI_URL,
    "final_url": WIKI_URL,
    "fetched_at": "2026-09-25T12:00:00+00:00",
    "license": "CC BY-SA 4.0",
    "attribution": ATTRIBUTION,
    "revision_id": 123,
    "site_name": "Wikipédia",
    "found_via": "link",
    # Absent values never reach the screen as values (D-24)…
    "authors": [],
    "year": None,
    "doi": "",
    # …and what is not on the curated list never reaches it at all.
    "internal_note": "não é para a tela",
}


def _service(db_session, user, **overrides) -> NotebookService:
    configured = settings.model_copy(update=overrides) if overrides else settings
    return NotebookService(db_session, user, configured)


def _ingest(service: NotebookService, notebook_id: int, meta=META, text=WIKI_TEXT):
    notebook = service._notebook(notebook_id)
    return service._ingest(
        notebook,
        "wikipedia",
        "Titânio",
        WIKI_URL,
        ExtractedText(pages=[text]),
        False,
        meta=meta,
    )


# --- meta ----------------------------------------------------------------------


def test_meta_is_stored_and_read_back_through_the_source(db_session, test_user):
    service = _service(db_session, test_user)
    notebook = service.create(NotebookIn(title="Titânio"))
    added = _ingest(service, notebook.id)

    assert added.kind == "wikipedia"
    assert added.origin == WIKI_URL
    assert added.url == WIKI_URL
    assert added.attribution == ATTRIBUTION
    assert added.license == "CC BY-SA 4.0"
    assert added.details == {
        "fetched_at": "2026-09-25T12:00:00+00:00",
        "revision_id": 123,
        "site_name": "Wikipédia",
        "found_via": "link",
    }

    stored = db_session.get(NotebookSource, added.id)
    assert stored.meta == META  # the whole record is kept; only the view is curated

    detail = service.get_source(notebook.id, added.id)
    assert detail.url == WIKI_URL
    assert detail.details == added.details
    assert detail.content.startswith("O titânio")

    listed = service.get(notebook.id).sources
    assert [s.attribution for s in listed] == [ATTRIBUTION]


def test_the_phase_one_kinds_have_nothing_to_attribute(db_session, test_user):
    service = _service(db_session, test_user)
    notebook = service.create(NotebookIn(title="Aulas"))
    added = service.add_text(notebook.id, TextSourceIn(title="Aula 1", text=WIKI_TEXT))

    assert (added.url, added.attribution, added.license, added.details) == (None, None, None, None)
    assert db_session.get(NotebookSource, added.id).meta is None


def test_empty_meta_is_stored_as_null(db_session, test_user):
    service = _service(db_session, test_user)
    notebook = service.create(NotebookIn(title="Vazio"))
    added = _ingest(service, notebook.id, meta={})

    assert db_session.get(NotebookSource, added.id).meta is None
    assert added.details is None


def test_blank_text_fields_are_absent_not_empty(db_session, test_user):
    service = _service(db_session, test_user)
    notebook = service.create(NotebookIn(title="Sem licença"))
    added = _ingest(service, notebook.id, meta={"url": "  ", "license": "", "attribution": None})

    assert (added.url, added.license, added.attribution) == (None, None, None)


# --- citations -------------------------------------------------------------------


def test_a_citation_carries_the_sources_url_and_attribution(db_session, test_user):
    service = _service(db_session, test_user)
    notebook = service.create(NotebookIn(title="Titânio"))
    _ingest(service, notebook.id)
    service.add_text(
        notebook.id, TextSourceIn(title="Aula", text="O aço tem densidade de 7850 kg/m³.")
    )

    chunks = NotebookRepository(db_session, test_user.id).selected_chunks(notebook.id)
    citations = {c.source_title: c for c in citations_for(passages_for(chunks), chunks)}

    assert citations["Titânio"].source_url == WIKI_URL
    assert citations["Titânio"].source_attribution == ATTRIBUTION
    assert citations["Aula"].source_url is None
    assert citations["Aula"].source_attribution is None


def test_an_answer_keeps_the_attribution_of_what_it_cites(db_session, test_user):
    service = _service(db_session, test_user)
    notebook = service.create(NotebookIn(title="Titânio"))
    _ingest(service, notebook.id)

    chat = service.ask(notebook.id, AskIn(question="Qual a densidade do titânio?"))
    answer = chat.answer.answer
    assert answer is not None and answer.citations
    assert {c.source_url for c in answer.citations} == {WIKI_URL}
    assert {c.source_attribution for c in answer.citations} == {ATTRIBUTION}

    # Stored with the message: the credit outlives the source.
    history = service.messages(notebook.id)
    assert history[-1].answer.citations[0].source_attribution == ATTRIBUTION


def test_a_citation_stored_before_phase_three_still_reads():
    old = {
        "number": 1,
        "chunk_id": 7,
        "source_id": 3,
        "source_title": "Aula antiga",
        "heading": None,
        "page_start": None,
        "page_end": None,
        "excerpt": "Trecho.",
    }
    citation = CitationOut.model_validate(old)
    assert citation.source_url is None
    assert citation.source_attribution is None


# --- deduplication by origin -----------------------------------------------------


def test_source_with_origin_stays_inside_the_owner(db_session, test_user, other_user):
    service = _service(db_session, test_user)
    notebook = service.create(NotebookIn(title="Titânio"))
    other_notebook = service.create(NotebookIn(title="Outro"))
    added = _ingest(service, notebook.id)

    mine = NotebookRepository(db_session, test_user.id)
    theirs = NotebookRepository(db_session, other_user.id)

    found = mine.source_with_origin(notebook.id, WIKI_URL)
    assert found is not None and found.id == added.id
    assert mine.source_with_origin(notebook.id, WIKI_URL + "?x=1") is None
    assert mine.source_with_origin(other_notebook.id, WIKI_URL) is None
    # Somebody else asking about my notebook learns nothing — not even that
    # the page is in it.
    assert theirs.source_with_origin(notebook.id, WIKI_URL) is None


# --- the fetch quota -------------------------------------------------------------


def test_fetch_usage_is_its_own_counter(db_session, test_user):
    service = _service(db_session, test_user)
    notebook = service.create(NotebookIn(title="Cota"))

    fresh = service.get(notebook.id)
    assert fresh.fetch_usage.model_dump() == {
        "used": 0,
        "limit": settings.notebook_daily_fetches,
        "remaining": settings.notebook_daily_fetches,
    }

    repo = NotebookRepository(db_session, test_user.id)
    repo.count_fetch(_today())
    repo.count_fetch(_today())
    repo.count_request(_today())

    after = service.get(notebook.id)
    assert after.fetch_usage.used == 2
    assert after.fetch_usage.remaining == settings.notebook_daily_fetches - 2
    assert after.usage.used == 1  # the AI quota counts only the AI call

    rows = db_session.query(AIUsage).filter_by(user_id=test_user.id).all()
    assert [(r.requests, r.artifacts, r.fetches) for r in rows] == [(1, 0, 2)]


def test_fetch_quota_refuses_once_spent(db_session, test_user):
    service = _service(db_session, test_user, notebook_daily_fetches=1)
    service.check_fetch_quota()  # nothing spent yet

    NotebookRepository(db_session, test_user.id).count_fetch(_today())
    assert service.fetch_usage().remaining == 0
    with pytest.raises(QuotaExceededError, match="buscas de fontes externas"):
        service.check_fetch_quota()


def test_the_notebook_screen_gets_fetch_usage(client):
    notebook = client.post("/api/notebooks", json={"title": "Tela"}).json()
    assert notebook["fetch_usage"]["used"] == 0
    assert notebook["fetch_usage"]["limit"] == settings.notebook_daily_fetches
    assert client.get(f"/api/notebooks/{notebook['id']}").json()["fetch_usage"]["remaining"] == (
        settings.notebook_daily_fetches
    )


def test_a_new_usage_row_starts_every_counter_at_zero(db_session, test_user):
    usage = NotebookRepository(db_session, test_user.id).count_artifact(_today())
    assert (usage.requests, usage.artifacts, usage.fetches) == (0, 1, 0)


# --- configuration: nothing that costs money is on by default -------------------

_EXTERNAL_ENV = (
    "NOTEBOOK_EXTERNAL_SOURCES",
    "NOTEBOOK_DAILY_FETCHES",
    "NOTEBOOK_FETCH_MAX_BYTES",
    "NOTEBOOK_FETCH_TIMEOUT_SECONDS",
    "NOTEBOOK_FETCH_MAX_REDIRECTS",
    "EXTERNAL_CONTACT",
    "WIKIPEDIA_LANG",
    "OPENALEX_API_KEY",
    "OPENALEX_MAILTO",
    "WEB_SEARCH_PROVIDER",
    "WEB_SEARCH_API_KEY",
    "WEB_SEARCH_MODEL",
    "WEB_SEARCH_BASE_URL",
    "WEB_SEARCH_TIMEOUT_SECONDS",
    "WEB_SEARCH_MAX_RESULTS",
    "AI_API_KEY",
)


@pytest.fixture()
def clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in _EXTERNAL_ENV:
        monkeypatch.delenv(name, raising=False)


def test_defaults_spend_nothing(clean_env):
    defaults = Settings(_env_file=None)
    assert defaults.web_search_provider == ""  # web search is off
    assert defaults.openalex_api_key == ""  # article search is off, reason on screen
    assert defaults.web_search_key == ""
    assert defaults.notebook_external_sources is True  # the free paths are on
    assert defaults.wikipedia_lang == "pt"
    assert defaults.external_contact == ""
    assert defaults.notebook_daily_fetches == 30
    assert defaults.notebook_fetch_max_bytes == 5_000_000
    assert defaults.notebook_fetch_timeout_seconds == 10
    assert defaults.notebook_fetch_max_redirects == 3
    assert defaults.web_search_model == "gemini-flash-latest"
    assert defaults.web_search_base_url == "https://generativelanguage.googleapis.com/v1beta"
    assert defaults.web_search_timeout_seconds == 25
    assert defaults.web_search_max_results == 8
    # YouTube asks for a token a server cannot produce: there is no automatic
    # transcript, and so no switch pretending there could be.
    assert "notebook_youtube_auto_transcript" not in Settings.model_fields


def test_web_search_key_falls_back_to_the_ai_key(clean_env):
    assert Settings(_env_file=None, ai_api_key=" AIza-ai ").web_search_key == "AIza-ai"
    assert (
        Settings(_env_file=None, ai_api_key="AIza-ai", web_search_api_key="AIza-web").web_search_key
        == "AIza-web"
    )


# --- request contracts -----------------------------------------------------------


@pytest.mark.parametrize(
    "build",
    [
        lambda: UrlSourceIn(url="https://exemplo.org/" + "a" * 500),
        lambda: UrlSourceIn(url=""),
        lambda: YoutubeSourceIn(url="https://youtu.be/x", transcript="a" * 800_001),
        lambda: SearchIn(provider="openalex", query="q" * 301),
        lambda: SearchIn(provider="google", query="titânio"),
        lambda: ExternalSourceIn(provider="wikipedia", key="k" * 501),
    ],
)
def test_request_contracts_refuse_what_is_too_long_or_unknown(build):
    with pytest.raises(PydanticValidationError):
        build()


def test_response_contracts_default_to_nothing_found():
    assert YoutubeOut().model_dump() == {
        "source": None,
        "needs_transcript": False,
        "video_title": None,
        "reason": None,
    }
    assert SearchOut().model_dump() == {
        "results": [],
        "notice": None,
        "search_entry_point_html": None,
    }
    assert set(SourceCapabilitiesOut.model_fields) == {
        "link",
        "youtube",
        "openalex",
        "wikipedia",
        "web",
    }


# --- the migration ---------------------------------------------------------------

#: The revision right before this one — the Cadernos themselves (D-92).
PRE_EXTERNAL_REVISION = "5c753e177520"
EXTERNAL_REVISION = "4dbd71e64b6b"


def _config(url: str) -> Config:
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    return config


@pytest.fixture()
def pre_external_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    """A database at the revision before, holding a quota row and a source."""
    url = f"sqlite:///{tmp_path / 'external_sources_migration.db'}"
    # `alembic/env.py` reads the URL from the app settings on every run.
    monkeypatch.setattr(settings, "database_url", url)
    command.upgrade(_config(url), PRE_EXTERNAL_REVISION)
    engine = sa.create_engine(url)
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO user (id, google_sub, email, name, created_at) VALUES"
                " (1, 'sub-ana', 'ana@exemplo.br', 'Ana', '2026-01-01')"
            )
        )
        conn.execute(
            sa.text(
                "INSERT INTO ai_usage (id, user_id, day, requests, artifacts) VALUES"
                " (1, 1, '2026-09-25', 3, 1)"
            )
        )
        conn.execute(
            sa.text(
                "INSERT INTO notebook (id, owner_id, title, emoji, chat_goal, response_length,"
                " created_at, updated_at) VALUES"
                " (1, 1, 'Caderno', 'x', 'padrao', 'padrao', '2026-01-01', '2026-01-01')"
            )
        )
        conn.execute(
            sa.text(
                "INSERT INTO notebook_source (id, notebook_id, kind, title, status, checksum,"
                " char_count, selected, truncated, content, created_at) VALUES"
                " (1, 1, 'texto', 'Aula', 'pronto', 'abc', 5, 1, 0, 'Aula.', '2026-01-01')"
            )
        )
    engine.dispose()
    yield url


def test_the_migration_keeps_every_row_and_counts_from_zero(pre_external_url):
    command.upgrade(_config(pre_external_url), EXTERNAL_REVISION)
    engine = sa.create_engine(pre_external_url)
    with engine.connect() as conn:
        usage = conn.execute(sa.text("SELECT requests, artifacts, fetches FROM ai_usage")).one()
        source = conn.execute(sa.text("SELECT title, meta FROM notebook_source")).one()
    engine.dispose()
    assert tuple(usage) == (3, 1, 0)
    assert tuple(source) == ("Aula", None)

    command.downgrade(_config(pre_external_url), PRE_EXTERNAL_REVISION)
    engine = sa.create_engine(pre_external_url)
    inspector = sa.inspect(engine)
    usage_columns = {c["name"] for c in inspector.get_columns("ai_usage")}
    source_columns = {c["name"] for c in inspector.get_columns("notebook_source")}
    with engine.connect() as conn:
        kept = conn.execute(sa.text("SELECT requests FROM ai_usage")).scalar_one()
        titles = conn.execute(sa.text("SELECT title FROM notebook_source")).scalars().all()
    engine.dispose()
    assert "fetches" not in usage_columns
    assert "meta" not in source_columns
    assert kept == 3
    assert titles == ["Aula"]
