"""Cadernos, phase 3 (D-97): sources from outside the application.

A web page by its link, a YouTube video with its pasted transcript, an article
abstract from OpenAlex, a Wikipedia article, and a page a web search found.
Every one ends as an ordinary notebook source, ingested by ``NotebookService``
so chunking, deduplication and the guide reset stay one code path. What this
service adds is the order in which a request meets the outside world:

1. **Owner first.** The notebook is read through the owner-scoped repository
   before anything else — somebody else's notebook is a 404 and nothing leaves
   the server on its behalf.
2. **Refuse without the network whatever can be refused without it.** The
   master switch, the provider's own configuration, the room left in the
   notebook, the shape of the link (``safe_fetch.normalise_url``) and the
   duplicate check on the canonical origin all run first. None of them costs
   quota: a refusal the server decided alone spent nothing outside.
3. **Quota is counted when a request leaves the server** — success or failure
   — and committed at once. ``count_fetch`` only flushes, and the request's
   session is closed without a commit when an error propagates, so a failed
   fetch would otherwise be free and a failing link could be probed forever.
   "Left" is measured, not guessed: a request hook on the client counts what
   was actually handed to the transport.
4. **Source content is data.** The fetched text is chunked like a pasted text;
   nothing in it is read as an instruction, and the model's own text from a
   web search is never kept (``gemini_search``).

Only :mod:`app.integrations.safe_fetch` fetches an address a student chose;
the other integrations call fixed public API hosts.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any
from urllib.parse import unquote, urlsplit

import httpx
from sqlalchemy.orm import Session

from app.config import Settings
from app.domain.errors import ConflictError, ValidationError
from app.integrations import gemini_search, openalex, safe_fetch, wikipedia, youtube
from app.integrations.errors import ExternalUnavailableError
from app.knowledge.readers import ExtractedText, decode_text, read_upload
from app.models.notebook import Notebook
from app.models.user import User
from app.notebooks.html_text import decode_html, extract_html
from app.schemas.notebook import (
    MAX_URL_CHARS,
    ExternalSourceIn,
    SearchIn,
    SearchOut,
    SearchResultOut,
    SourceCapabilitiesOut,
    SourceCapabilityOut,
    SourceOut,
    UrlSourceIn,
    YoutubeOut,
    YoutubeSourceIn,
)
from app.services.notebook_service import NotebookService, _today

logger = logging.getLogger(__name__)

# httpx logs every request line at INFO, full URL included. OpenAlex takes its
# key as the ``api_key`` query parameter (the only form its documentation
# commits to), so a deployment that ever turned INFO logging on would write the
# key into its logs. The floor is set here, where the outbound clients are
# used, rather than trusted to the logging configuration of the day.
logging.getLogger("httpx").setLevel(logging.WARNING)

SWITCHED_OFF = (
    "As fontes externas (links, vídeos, artigos e buscas) estão desligadas neste "
    "servidor. Colar o texto como fonte continua disponível."
)
YOUTUBE_LINK_ON_URL_ROUTE = (
    "Este é um link do YouTube: use a opção de vídeo, que pede a transcrição. O "
    "YouTube não deixa o servidor ler o vídeo."
)
NEEDS_TRANSCRIPT = (
    "O YouTube não permite que o servidor obtenha a transcrição de um vídeo. No "
    "YouTube, abra “Mostrar transcrição” embaixo do vídeo, copie o painel inteiro e "
    "cole aqui."
)
WEB_SEARCH_NOTICE = (
    "Os links vêm da busca do Google. O texto de uma página só é lido quando você a "
    "adiciona, e o que o modelo escreveu na busca é descartado."
)
ORIGIN_TOO_LONG = (
    f"O endereço desta fonte passa de {MAX_URL_CHARS} caracteres depois de "
    "normalizado e não pode ser guardado. Procure um link mais curto para a mesma página."
)
UNTITLED_WEB_HIT = "Página sem título informado pela busca"
WEB_HIT_SUBTITLE = "Página encontrada pela busca do Google"
NO_AUTHORS = "autoria não informada"
NO_YEAR = "ano não informado"
NO_VENUE = "publicação não informada"

#: How many results a search asks for. The web search has its own setting.
_SEARCH_RESULTS = 8
_SNIPPET_CHARS = 300

_HTML_TYPES = frozenset({"text/html", "application/xhtml+xml"})

#: A thread pool for name resolution with a deadline: ``getaddrinfo`` takes no
#: timeout, and a resolver that hangs would hold the request past the fetch
#: deadline. A lookup that overruns is abandoned (its thread finishes on its
#: own) and the fetch is refused as a name that could not be found.
_DNS_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="notebook-dns")


def resolver_with_deadline(
    resolve: safe_fetch.Resolver, seconds: float, pool: ThreadPoolExecutor = _DNS_POOL
) -> safe_fetch.Resolver:
    """``resolve``, abandoned after ``seconds``. A timeout is an ``OSError``,
    which ``safe_fetch`` already turns into its pt-BR "not found" refusal."""

    def bounded(host: str, port: int) -> list[str]:
        future = pool.submit(resolve, host, port)
        try:
            return future.result(timeout=seconds)
        except FutureTimeout:
            future.cancel()
            raise OSError("name resolution timed out") from None

    return bounded


class ExternalSourceService:
    """Search and add outside sources to one student's notebooks.

    ``client`` comes from ``app.integrations.http.build_client`` and is closed
    by whoever built it; ``resolver`` is ``None`` in production (the system
    resolver, with a deadline) and a fake in tests.
    """

    def __init__(
        self,
        db: Session,
        user: User,
        settings: Settings,
        client: httpx.Client,
        resolver: safe_fetch.Resolver | None = None,
        project_id: int | None = None,
    ) -> None:
        self.db = db
        self.user = user
        self.settings = settings
        self.client = client
        self.resolver = resolver or resolver_with_deadline(
            safe_fetch.default_resolver, float(settings.notebook_fetch_timeout_seconds)
        )
        self.notebooks = NotebookService(db, user, settings, project_id=project_id)
        self.repo = self.notebooks.repo
        self._sent = 0
        hooks = dict(client.event_hooks)
        hooks["request"] = [*hooks.get("request", []), self._on_request]
        client.event_hooks = hooks

    # --- capabilities -------------------------------------------------------

    @staticmethod
    def capabilities(settings: Settings) -> SourceCapabilitiesOut:
        """What is switched on, and why not, from configuration alone."""
        if not settings.notebook_external_sources:
            off = SourceCapabilityOut(enabled=False, reason=SWITCHED_OFF)
            return SourceCapabilitiesOut(
                link=off, youtube=off, openalex=off, wikipedia=off, web=off
            )
        on = SourceCapabilityOut(enabled=True)

        def of(check: Callable[[Any], tuple[bool, str | None]]) -> SourceCapabilityOut:
            enabled, reason = check(settings)
            return SourceCapabilityOut(enabled=enabled, reason=None if enabled else reason)

        return SourceCapabilitiesOut(
            link=on,
            youtube=on,
            openalex=of(openalex.enabled),
            wikipedia=of(wikipedia.enabled),
            web=of(gemini_search.enabled),
        )

    # --- a link -------------------------------------------------------------

    def add_url(self, notebook_id: int, payload: UrlSourceIn) -> SourceOut:
        notebook = self._open(notebook_id)
        if youtube.is_youtube_url(payload.url):
            raise ValidationError(YOUTUBE_LINK_ON_URL_ROUTE)
        origin = safe_fetch.normalise_url(payload.url, max_length=MAX_URL_CHARS)
        self._refuse_duplicate(notebook, origin)
        return self._add_page(notebook, origin, found_via="link")

    # --- a video ------------------------------------------------------------

    def add_youtube(self, notebook_id: int, payload: YoutubeSourceIn) -> YoutubeOut:
        """A video is its pasted transcript (the automatic one needs a token
        only a browser can mint — see ``app.integrations.youtube``).

        The oEmbed call for the title is a request that leaves the server, so
        it is counted; with the day's quota spent it is skipped rather than
        refused, because the title is a convenience and pasting stays
        available.
        """
        notebook = self._open(notebook_id)
        video = youtube.require_video_id(payload.url)
        origin = youtube.canonical_url(video)
        self._refuse_duplicate(notebook, origin)
        transcript = (payload.transcript or "").strip()
        text = youtube.clean_pasted_transcript(transcript) if transcript else None

        info = youtube.VideoInfo(video_id=video, title=None, channel=None)
        if self.notebooks.fetch_usage().remaining > 0:
            with self._spending():
                info = youtube.oembed(self.client, video)
        title = youtube.display_title(info)
        if text is None:
            return YoutubeOut(needs_transcript=True, video_title=title, reason=NEEDS_TRANSCRIPT)

        channel = f", de {info.channel}" if info.channel else ""
        meta = {
            "url": _http(origin),
            "video_id": video,
            "channel": info.channel,
            "site_name": "YouTube",
            "transcript_origin": "colada",
            "fetched_at": _now(),
            "attribution": (
                f"Transcrição do vídeo “{title}”{channel}, no YouTube ({origin}), colada "
                f"pelo estudante em {_today_text()}. O conteúdo pertence a quem publicou o "
                "vídeo; aqui ele só foi dividido em trechos para busca."
            ),
        }
        source = self.notebooks._ingest(
            notebook,
            "youtube",
            title[:300],
            origin,
            ExtractedText(pages=[text]),
            False,
            meta=meta,
        )
        return YoutubeOut(source=source, needs_transcript=False, video_title=title)

    # --- searching ----------------------------------------------------------

    def search(self, notebook_id: int, payload: SearchIn) -> SearchOut:
        """One search costs one outside request; a web search also costs one
        AI request, because it is a model call on the free allowance."""
        notebook = self._open(notebook_id, need_room=False)
        query = " ".join(payload.query.split())
        if not query:
            raise ValidationError("Escreva o que você quer buscar.")
        if payload.provider == "openalex":
            self._require(openalex.enabled)
            self.notebooks.check_fetch_quota()
            with self._spending():
                works = openalex.search(self.client, self.settings, query, _SEARCH_RESULTS)
            origins = self._origins(notebook)
            return SearchOut(results=[_work_result(work, origins) for work in works])

        if payload.provider == "wikipedia":
            self._require(wikipedia.enabled)
            self.notebooks.check_fetch_quota()
            with self._spending():
                hits = wikipedia.search(self.client, self.settings, query, _SEARCH_RESULTS)
            origins = self._origins(notebook)
            pageids = _wikipedia_pageids(notebook)
            return SearchOut(
                results=[_wiki_result(hit, origins, pageids, self.settings) for hit in hits]
            )

        self._require(gemini_search.enabled)
        self.notebooks.check_fetch_quota()
        self.notebooks._check_quota()
        with self._spending(ai_request=True):
            found = gemini_search.search(self.client, self.settings, query)
        return SearchOut(
            results=[_web_result(hit) for hit in found.hits],
            notice=WEB_SEARCH_NOTICE,
            search_entry_point_html=found.search_entry_point_html,
        )

    # --- adding a search result ----------------------------------------------

    def add_external(self, notebook_id: int, payload: ExternalSourceIn) -> SourceOut:
        """Add a search result by its key. The server fetches it again: nothing
        the browser sends about a result — title, text, link — is trusted."""
        notebook = self._open(notebook_id)
        if payload.provider == "openalex":
            return self._add_work(notebook, payload.key)
        if payload.provider == "wikipedia":
            return self._add_article(notebook, payload.key)
        self._require(gemini_search.enabled)
        # A hit is Google's redirect link: unique per search and short-lived,
        # so it cannot be the origin. The page is stored — and deduplicated —
        # by the address the redirect led to (``final_url``), after the fetch.
        return self._add_page(notebook, payload.key.strip(), found_via="busca_web")

    def _add_work(self, notebook: Notebook, key: str) -> SourceOut:
        self._require(openalex.enabled)
        work_id = openalex.normalise_work_id(key)
        origin = openalex.landing_url(work_id)
        self._refuse_duplicate(notebook, origin)
        self.notebooks.check_fetch_quota()
        with self._spending():
            work = openalex.work(self.client, self.settings, work_id)
        if not work.has_text:
            open_copy = _http(work.oa_url)
            where = (
                f" A versão aberta está em {open_copy}: adicione esse link como fonte."
                if open_copy
                else " O OpenAlex não conhece uma versão aberta dele."
            )
            raise ValidationError(
                f"O OpenAlex não tem o resumo de “{work.title}”, então não há texto para "
                f"importar.{where}"
            )
        meta = {
            "url": _http(work.url),
            "site_name": "OpenAlex",
            "authors": list(work.authors),
            "year": work.year,
            "venue": work.venue,
            "doi": work.doi,
            "oa_url": _http(work.oa_url),
            "license": work.license,
            "attribution": openalex.attribution(work),
            "fetched_at": _now(),
        }
        return self.notebooks._ingest(
            notebook,
            "artigo",
            work.title[:300],
            work.url,
            ExtractedText(pages=[work.abstract or ""]),
            False,
            meta=meta,
        )

    def _add_article(self, notebook: Notebook, key: str) -> SourceOut:
        """A Wikipedia article by page id.

        The origin is the article link, built from the title, which only the
        page itself returns. Deduplication therefore runs twice: before the
        network on the page id stored in ``meta`` (free, trusts nothing the
        browser sent), and after it on the canonical link (a page added before
        under another id, e.g. after a merge).
        """
        self._require(wikipedia.enabled)
        pageid = wikipedia.parse_pageid(key)
        if pageid in _wikipedia_pageids(notebook):
            raise ConflictError("Este artigo da Wikipédia já está no caderno.")
        self.notebooks.check_fetch_quota()
        with self._spending():
            article = wikipedia.page(self.client, self.settings, pageid)
        # A title can be ~255 bytes, percent-encoded to ~765 characters: such an
        # article is kept without an origin (the page id in ``meta`` still
        # deduplicates it) rather than refused after its request was spent.
        origin = article.url if len(article.url) <= MAX_URL_CHARS else None
        if origin is not None:
            self._refuse_duplicate(notebook, origin)
        meta = {
            "url": _http(article.url),
            "site_name": wikipedia.edition_name(article.lang),
            "license": article.license,
            "license_url": _http(article.license_url),
            "attribution": article.attribution,
            "revision_id": article.revision_id,
            "pageid": article.pageid,
            "fetched_at": _now(),
        }
        return self.notebooks._ingest(
            notebook,
            "wikipedia",
            article.title[:300],
            origin,
            ExtractedText(pages=[article.text]),
            False,
            meta=meta,
        )

    # --- a page, fetched ------------------------------------------------------

    def _add_page(self, notebook: Notebook, url: str, *, found_via: str) -> SourceOut:
        self.notebooks.check_fetch_quota()
        with self._spending():
            fetched = safe_fetch.fetch(
                url, client=self.client, resolver=self.resolver, settings=self.settings
            )
        final = fetched.final_url
        typed = url if found_via == "link" else None
        if final != typed and len(final) <= MAX_URL_CHARS:
            self._refuse_duplicate(notebook, final)

        title, extracted, paged = self._read(fetched)
        host = _host(final)
        title = (title or _title_from_path(final) or host or final)[:300]
        # The origin is the duplicate key. A link keeps the address the student
        # typed, so adding it again is refused before the network; a search hit
        # keeps the page it led to. An address wider than the column is left
        # without an origin rather than cut: a truncated key could collide with
        # another page, and the checksum still catches a repeated text.
        origin = typed or (final if len(final) <= MAX_URL_CHARS else None)
        meta = {
            "url": _http(typed or final),
            "final_url": _http(final),
            "site_name": host,
            "found_via": found_via,
            "fetched_at": _now(),
            "attribution": (
                f"Texto de “{title}”, obtido de {final} em {_today_text()}. O conteúdo "
                "pertence a quem o publicou; aqui ele só foi extraído da página e dividido "
                "em trechos para busca."
            ),
        }
        return self.notebooks._ingest(notebook, "site", title, origin, extracted, paged, meta=meta)

    def _read(self, fetched: safe_fetch.Fetched) -> tuple[str | None, ExtractedText, bool]:
        """The text of a fetched page by its media type, with the readers the
        uploads use for PDF and plain text. Returns (title, text, paged)."""
        if fetched.content_type in _HTML_TYPES:
            title, extracted = extract_html(fetched.body, fetched.charset)
            return title, extracted, False
        if fetched.content_type == "application/pdf":
            extracted = read_upload(
                "pagina.pdf", fetched.body, max_pages=self.settings.notebook_max_pages
            )
            return None, extracted, True
        # text/plain and text/markdown — the only other types safe_fetch lets through.
        if fetched.charset:
            if b"\x00" in fetched.body[:4096]:
                raise ValidationError("A página não parece ser texto: contém bytes binários.")
            text = decode_html(fetched.body, fetched.charset)
        else:
            text = decode_text(fetched.body)
        return None, ExtractedText(pages=[text]), False

    # --- rules before the network ---------------------------------------------

    def _open(self, notebook_id: int, *, need_room: bool = True) -> Notebook:
        """Owner check, then the master switch, then room for one more source."""
        notebook = self.notebooks._notebook(notebook_id)
        if not self.settings.notebook_external_sources:
            raise ExternalUnavailableError(SWITCHED_OFF)
        if need_room:
            self.notebooks._check_room(notebook)
        return notebook

    def _require(self, check: Callable[[Any], tuple[bool, str | None]]) -> None:
        enabled, reason = check(self.settings)
        if not enabled:
            raise ExternalUnavailableError(reason or SWITCHED_OFF)

    def _refuse_duplicate(self, notebook: Notebook, origin: str) -> None:
        """409 when ``origin`` is already a source here, 400 when it cannot be
        stored at all. Both before any network, so neither costs quota.

        The length check is ours and not the database's: ``origin`` is
        ``String(500)``, which PostgreSQL enforces with an error (a 500 for the
        student) and SQLite ignores — so no test against SQLite would catch
        it. A long origin is refused, never cut: a cut address is another
        address, and would break the duplicate check it exists for.
        """
        if len(origin) > MAX_URL_CHARS:
            raise ValidationError(ORIGIN_TOO_LONG)
        existing = self.repo.source_with_origin(notebook.id, origin)
        if existing is not None:
            raise ConflictError(f"Esta fonte já está no caderno: {existing.title}")

    def _origins(self, notebook: Notebook) -> set[str]:
        return {source.origin for source in notebook.sources if source.origin}

    # --- counting what leaves ---------------------------------------------------

    def _on_request(self, _request: httpx.Request) -> None:
        self._sent += 1

    @contextmanager
    def _spending(self, *, ai_request: bool = False) -> Iterator[None]:
        """Count one outside request (and, for a web search, one AI request)
        if anything was sent inside the block — however the block ended — and
        commit it before any error travels on. One operation is one unit, a
        redirect or a retried address included."""
        before = self._sent
        try:
            yield
        finally:
            if self._sent > before:
                day = _today()
                self.repo.count_fetch(day)
                if ai_request:
                    self.repo.count_request(day)
                self.db.commit()


# --- search results ---------------------------------------------------------------


def _work_result(work: openalex.OpenAlexWork, origins: set[str]) -> SearchResultOut:
    # Every part is always there, in words when OpenAlex did not say (D-24): a
    # missing year is not an empty segment between two separators.
    if work.authors:
        authors = ", ".join(work.authors[:3]) + (" et al." if len(work.authors) > 3 else "")
    else:
        authors = NO_AUTHORS
    subtitle = " · ".join(
        (
            authors,
            str(work.year) if work.year is not None else NO_YEAR,
            work.venue or NO_VENUE,
        )
    )
    return SearchResultOut(
        provider="openalex",
        key=work.id,
        title=work.title,
        subtitle=subtitle,
        snippet=_snippet(work.abstract),
        # Without an abstract there is nothing to import, and the useful link
        # is the open copy the student can add as a page instead.
        url=work.url if work.has_text else (_http(work.oa_url) or work.url),
        license=work.license,
        has_text=work.has_text,
        already_added=work.url in origins,
    )


def _wiki_result(
    hit: wikipedia.WikiHit, origins: set[str], pageids: set[int], settings: Settings
) -> SearchResultOut:
    return SearchResultOut(
        provider="wikipedia",
        key=str(hit.pageid),
        title=hit.title,
        subtitle=wikipedia.edition_name(str(settings.wikipedia_lang).strip().lower()),
        snippet=_snippet(hit.snippet),
        url=hit.url,
        license=wikipedia.LICENSE,
        has_text=True,
        already_added=hit.url in origins or hit.pageid in pageids,
    )


def _web_result(hit: gemini_search.WebHit) -> SearchResultOut:
    # Whether a web hit is already in the notebook is only known after its
    # redirect is followed, so it is never claimed here.
    return SearchResultOut(
        provider="web",
        key=hit.url,
        title=hit.title or UNTITLED_WEB_HIT,
        subtitle=WEB_HIT_SUBTITLE,
        url=hit.url,
        has_text=True,
    )


def _wikipedia_pageids(notebook: Notebook) -> set[int]:
    pageids: set[int] = set()
    for source in notebook.sources:
        value = (source.meta or {}).get("pageid") if source.kind == "wikipedia" else None
        if isinstance(value, int):
            pageids.add(value)
    return pageids


def _snippet(text: str | None) -> str | None:
    if not text:
        return None
    flat = " ".join(text.split())
    if len(flat) <= _SNIPPET_CHARS:
        return flat
    return flat[:_SNIPPET_CHARS].rsplit(" ", 1)[0] + " …"


# --- small helpers -----------------------------------------------------------------


def _host(url: str) -> str | None:
    host = urlsplit(url).hostname
    if not host:
        return None
    return host[4:] if host.startswith("www.") else host


def _title_from_path(url: str) -> str | None:
    """The last path segment, without its extension: a PDF or a text file has
    no ``<title>``, and its file name is usually the closest thing to one."""
    segment = unquote(urlsplit(url).path.rstrip("/").rsplit("/", 1)[-1])
    stem = segment.rsplit(".", 1)[0] if "." in segment else segment
    stem = " ".join(stem.replace("_", " ").split())
    return stem or None


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _today_text() -> str:
    return _today().strftime("%d/%m/%Y")


def _http(value: object) -> str | None:
    """``value`` if it is an http(s) address, else ``None``: every link stored
    in ``meta`` reaches the screen as a link, and a third-party API is not
    trusted to send only web addresses (``javascript:``, ``data:``…)."""
    if not isinstance(value, str):
        return None
    try:
        parts = urlsplit(value.strip())
    except ValueError:
        return None
    if parts.scheme.lower() not in ("http", "https") or not parts.hostname:
        return None
    return value.strip()
