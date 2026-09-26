"""OpenAlex: scholarly works, searched and read back by identifier (D-97).

A notebook source of kind ``artigo`` is one OpenAlex work, identified by its
``W…`` id and ingested as its **abstract** — the full text lives behind the
publisher, and only an open-access link to it is kept (``oa_url``), for the
student to follow.

**The key.** Since 13/02/2026 every request to the hosted API needs a key,
sent as the query parameter ``api_key``. The free one carries a daily credit
(about one dollar) and asks for no payment method; when it runs out the API
answers 429 and article search stops **until the next day**. With no key
configured the integration is off and :func:`enabled` says so — there is no
keyless fallback, and billing is never assumed. ``mailto`` is sent too when
configured, as OpenAlex asks.

**What the text is, and whose.** OpenAlex publishes its metadata under CC0, so
title, authors, year, venue and DOI are free to keep. The abstract is not
OpenAlex's to license: it is the authors' or the publisher's text, which
OpenAlex redistributes as an inverted index. A source built from it is kept in
one student's private notebook, for study, with the work cited — and
:data:`LICENSE` says both halves of that on the source, so nobody reads the
CC0 as covering the abstract.

**The abstract is rebuilt, never paraphrased.** :func:`rebuild_abstract` puts
each word back at the positions the index gives it, and nothing else; a work
without an index has no abstract, which is a written state (``None``), never an
empty string.

Every function takes the ``httpx.Client`` built by
:func:`app.integrations.http.build_client` (User-Agent, timeouts, no proxy from
the environment) and only ever talks to :data:`API_BASE`. Errors are pt-BR and
say which service and why; the key never appears in one — the exceptions of
``httpx`` carry the request URL, key included, so they are dropped
(``from None``) rather than chained.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any
from urllib.parse import urlsplit

import httpx

from app.domain.errors import NotFoundError, ValidationError
from app.integrations.errors import ExternalUnavailableError

#: The only host this module talks to.
API_BASE = "https://api.openalex.org"
#: Where a work's public page lives; also the canonical origin of an ``artigo``.
LANDING_BASE = "https://openalex.org"

#: Stored on every ``artigo`` source: the two halves have different owners.
LICENSE = "Metadados CC0 (OpenAlex); resumo © dos autores ou da editora"

#: Results one search may ask for. The screen shows a handful; more only costs
#: credit from the daily allowance.
MAX_RESULTS = 25
#: A search is a few words. Longer is a paste, not a query.
MAX_QUERY_CHARS = 200
#: An abstract is a few hundred words; a position beyond this is not one.
MAX_ABSTRACT_WORDS = 20_000

#: Only the fields read below — ``select`` keeps the response (and the credit
#: each request spends) small.
_SELECT = ",".join(
    (
        "id",
        "display_name",
        "publication_year",
        "authorships",
        "primary_location",
        "doi",
        "abstract_inverted_index",
        "open_access",
        "best_oa_location",
    )
)

_WORK_ID = re.compile(r"W\d{1,15}")
_WORK_URL = re.compile(r"https://openalex\.org/(W\d{1,15})")
_TAG = re.compile(r"<[^>]*>")
_DOI_PREFIXES = ("https://doi.org/", "http://doi.org/", "doi:")

DISABLED_REASON = (
    "A busca de artigos está desligada neste servidor: falta a chave gratuita do "
    "OpenAlex (OPENALEX_API_KEY), que o administrador cria em openalex.org/settings/api."
)
QUOTA_EXHAUSTED = (
    "A cota gratuita diária do OpenAlex deste servidor acabou. A busca de artigos "
    "volta amanhã; até lá, adicione o artigo pelo link aberto dele."
)
RATE_LIMITED = (
    "O OpenAlex limitou as consultas deste servidor por alguns instantes. Tente de "
    "novo em um minuto."
)
KEY_REFUSED = (
    "O OpenAlex recusou a chave configurada neste servidor (OPENALEX_API_KEY). O "
    "administrador precisa conferi-la em openalex.org/settings/api."
)
SERVICE_DOWN = "O OpenAlex está fora do ar ou instável agora. Tente de novo mais tarde."
TIMED_OUT = "O OpenAlex não respondeu a tempo. Tente de novo em instantes."
UNREACHABLE = (
    "Não foi possível falar com o OpenAlex agora (falha de conexão). Tente de novo " "mais tarde."
)
UNREADABLE = "O OpenAlex devolveu uma resposta que não deu para ler. Tente de novo mais tarde."


@dataclass(frozen=True)
class OpenAlexWork:
    """One scholarly work, as much of it as OpenAlex states.

    Every optional field is ``None`` when OpenAlex does not state it — a
    missing year is not year 0, and a missing abstract is not an empty one.
    """

    #: The short identifier, ``W`` followed by digits.
    id: str
    #: Tags stripped (OpenAlex titles carry ``<i>``/``<sub>``). A work with no
    #: title gets a written label instead, never an empty string.
    title: str
    year: int | None
    #: In the order OpenAlex lists the authorships.
    authors: list[str] = field(default_factory=list)
    venue: str | None = None
    #: Bare DOI (``10.…/…``), without the resolver prefix.
    doi: str | None = None
    abstract: str | None = None
    #: An open-access copy of the full text, when one is known.
    oa_url: str | None = None
    #: The work's page on OpenAlex (``https://openalex.org/W…``).
    url: str = ""
    license: str = LICENSE

    @property
    def has_text(self) -> bool:
        """True when there is an abstract to ingest."""
        return self.abstract is not None


# --- configuration -----------------------------------------------------------


def enabled(settings: object) -> tuple[bool, str | None]:
    """Whether article search can run here, and why not when it cannot."""
    if not _api_key(settings):
        return False, DISABLED_REASON
    return True, None


def _api_key(settings: object) -> str:
    return str(getattr(settings, "openalex_api_key", "") or "").strip()


def _params(settings: object, extra: dict[str, Any]) -> dict[str, Any]:
    params = dict(extra)
    params["api_key"] = _api_key(settings)
    mailto = str(getattr(settings, "openalex_mailto", "") or "").strip()
    if mailto:
        params["mailto"] = mailto
    return params


def _require_enabled(settings: object) -> None:
    ok, reason = enabled(settings)
    if not ok:
        raise ExternalUnavailableError(reason or DISABLED_REASON)


# --- public API --------------------------------------------------------------


def search(
    client: httpx.Client, settings: object, query: str, limit: int = 8
) -> list[OpenAlexWork]:
    """Works matching ``query``, in OpenAlex's relevance order.

    Works without an abstract are returned too (``has_text`` is false): the
    screen shows them with their open-access link instead of hiding that they
    exist. A result OpenAlex sends without a valid identifier is skipped — it
    could not be added anyway.
    """
    _require_enabled(settings)
    text = _clean_query(query)
    per_page = max(1, min(int(limit), MAX_RESULTS))
    data = _get(
        client,
        f"{API_BASE}/works",
        _params(settings, {"search": text, "per_page": per_page, "select": _SELECT}),
    )
    results = data.get("results") if isinstance(data, dict) else None
    if not isinstance(results, list):
        raise ExternalUnavailableError(UNREADABLE)
    works = [work for work in (_parse_work(item) for item in results) if work is not None]
    return works[:per_page]


def work(client: httpx.Client, settings: object, work_id: str) -> OpenAlexWork:
    """One work by identifier — ``W…`` or ``https://openalex.org/W…``.

    A work OpenAlex merged into another answers with a redirect to the
    survivor; that one hop is followed (only to another work on the same API,
    never to an address the response names freely). 404 is a
    :class:`NotFoundError`.
    """
    _require_enabled(settings)
    current = normalise_work_id(work_id)
    for hop in range(2):
        response = _send(
            client, f"{API_BASE}/works/{current}", _params(settings, {"select": _SELECT})
        )
        if response.is_redirect:
            target = _merged_into(response)
            if target is None or hop > 0:
                raise ExternalUnavailableError(UNREADABLE)
            current = target
            continue
        if response.status_code == 404:
            raise NotFoundError(f"O artigo {current} não foi encontrado no OpenAlex.")
        parsed = _parse_work(_json(response))
        if parsed is None:
            raise ExternalUnavailableError(UNREADABLE)
        return parsed
    raise ExternalUnavailableError(UNREADABLE)  # pragma: no cover - loop always returns


def normalise_work_id(value: str) -> str:
    """The ``W…`` identifier, or a pt-BR :class:`ValidationError`.

    Strict on purpose: the identifier goes into a URL path, so anything but
    ``W`` and digits — or the public ``https://openalex.org/W…`` form of the
    same — is refused rather than cleaned.
    """
    text = value.strip() if isinstance(value, str) else ""
    if _WORK_ID.fullmatch(text):
        return text
    match = _WORK_URL.fullmatch(text)
    if match:
        return match.group(1)
    raise ValidationError(
        "Identificador de artigo do OpenAlex inválido: esperado algo como W2741809807."
    )


def landing_url(work_id: str) -> str:
    """The work's public page, which is also its canonical origin."""
    return f"{LANDING_BASE}/{normalise_work_id(work_id)}"


def rebuild_abstract(inverted_index: object) -> str | None:
    """The abstract's text, rebuilt from OpenAlex's inverted index.

    The index maps each word to the positions it occupies; the text is every
    word put back at its positions, in order, joined by single spaces. When two
    words claim one position the first listed keeps it. No index, an empty one,
    or one with no usable position is ``None`` — no abstract, not an empty one.
    """
    if not isinstance(inverted_index, dict) or not inverted_index:
        return None
    by_position: dict[int, str] = {}
    for word, places in inverted_index.items():
        if not isinstance(word, str) or not isinstance(places, list):
            continue
        for place in places:
            if (
                isinstance(place, int)
                and not isinstance(place, bool)
                and 0 <= place <= MAX_ABSTRACT_WORDS
                and place not in by_position
            ):
                by_position[place] = word
    text = " ".join(" ".join(by_position[p] for p in sorted(by_position)).split())
    return text or None


def attribution(item: OpenAlexWork, today: date | None = None) -> str:
    """A citation line for a source built from ``item``, dated ``today``.

    Names the authors, the year (``s.d.`` — *sem data* — when OpenAlex has
    none, as ABNT writes it), the venue and DOI when known, where the text came
    from, and whose the abstract is.
    """
    day = (today or date.today()).strftime("%d/%m/%Y")
    if not item.authors:
        authors = "autoria não informada"
    elif len(item.authors) == 1:
        authors = item.authors[0]
    elif len(item.authors) == 2:
        authors = f"{item.authors[0]} e {item.authors[1]}"
    else:
        authors = f"{item.authors[0]} et al."
    parts = [f"Resumo de “{item.title}”, de {authors} ({item.year or 's.d.'})"]
    if item.venue:
        parts.append(item.venue)
    if item.doi:
        parts.append(f"doi:{item.doi}")
    parts.append(f"obtido pelo OpenAlex ({item.url}) em {day}")
    return (
        ", ".join(parts)
        + ". Metadados sob CC0; o resumo pertence aos autores ou à editora e está aqui "
        "para estudo, com a fonte citada."
    )


# --- HTTP --------------------------------------------------------------------


def _send(client: httpx.Client, url: str, params: dict[str, Any]) -> httpx.Response:
    """One GET; a network failure becomes a pt-BR 503 without the URL (key)."""
    try:
        response = client.get(url, params=params)
    except httpx.TimeoutException:
        raise ExternalUnavailableError(TIMED_OUT) from None
    except httpx.RequestError:
        raise ExternalUnavailableError(UNREACHABLE) from None
    _raise_for_status(response)
    return response


def _get(client: httpx.Client, url: str, params: dict[str, Any]) -> Any:
    response = _send(client, url, params)
    if response.is_redirect or response.status_code == 404:
        raise ExternalUnavailableError(UNREADABLE)
    return _json(response)


def _raise_for_status(response: httpx.Response) -> None:
    """Map OpenAlex's refusals to reasons a student can act on.

    429 is the daily credit spent (back tomorrow), 403 a short rate limit, 401
    the key itself refused — three different things to tell the student, and
    the second is not the first.
    """
    status = response.status_code
    if status < 300 or response.is_redirect or status == 404:
        return
    if status == 429:
        raise ExternalUnavailableError(QUOTA_EXHAUSTED)
    if status == 403:
        raise ExternalUnavailableError(RATE_LIMITED)
    if status == 401:
        raise ExternalUnavailableError(KEY_REFUSED)
    if status == 400:
        raise ValidationError(
            "O OpenAlex não entendeu esta busca. Tente outras palavras, sem símbolos."
        )
    if status >= 500:
        raise ExternalUnavailableError(SERVICE_DOWN)
    raise ExternalUnavailableError(
        f"O OpenAlex respondeu de forma inesperada (HTTP {status}). Tente de novo mais tarde."
    )


def _json(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        raise ExternalUnavailableError(UNREADABLE) from None


def _merged_into(response: httpx.Response) -> str | None:
    """The surviving work a merged one redirects to, if the redirect names one."""
    location = response.headers.get("location", "")
    parts = urlsplit(location)
    if parts.netloc and parts.netloc != urlsplit(API_BASE).netloc:
        return None
    candidate = parts.path.rstrip("/").rsplit("/", 1)[-1]
    return candidate if _WORK_ID.fullmatch(candidate) else None


# --- parsing -----------------------------------------------------------------


def _clean_query(query: str) -> str:
    text = " ".join(query.split()) if isinstance(query, str) else ""
    if not text:
        raise ValidationError("Digite o que procurar entre os artigos.")
    if len(text) > MAX_QUERY_CHARS:
        raise ValidationError(
            f"A busca tem mais de {MAX_QUERY_CHARS} caracteres. Use algumas palavras-chave."
        )
    return text


def _plain(value: object) -> str | None:
    """Text without markup: tags stripped, entities decoded, spaces collapsed."""
    if not isinstance(value, str):
        return None
    text = " ".join(html.unescape(_TAG.sub("", value)).split())
    return text or None


def _http_url(value: object) -> str | None:
    if not isinstance(value, str) or len(value) > 2000 or any(c.isspace() for c in value):
        return None
    parts = urlsplit(value)
    if parts.scheme not in {"http", "https"} or not parts.netloc:
        return None
    return value


def _doi(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    for prefix in _DOI_PREFIXES:
        if text.lower().startswith(prefix):
            text = text[len(prefix) :]
            break
    return text if text.startswith("10.") and not any(c.isspace() for c in text) else None


def _dig(data: object, *keys: str) -> object:
    for key in keys:
        if not isinstance(data, dict):
            return None
        data = data.get(key)
    return data


def _parse_work(data: object) -> OpenAlexWork | None:
    """One work from OpenAlex's JSON, or ``None`` when it has no usable id."""
    if not isinstance(data, dict):
        return None
    raw_id = data.get("id")
    if not isinstance(raw_id, str):
        return None
    url_match = _WORK_URL.fullmatch(raw_id)
    if url_match:
        work_id = url_match.group(1)
    elif _WORK_ID.fullmatch(raw_id):
        work_id = raw_id
    else:
        return None

    authors: list[str] = []
    authorships = data.get("authorships")
    if isinstance(authorships, list):
        for authorship in authorships:
            name = _plain(_dig(authorship, "author", "display_name"))
            if name:
                authors.append(name)

    year = data.get("publication_year")
    oa_url = _http_url(_dig(data, "open_access", "oa_url")) or _http_url(
        _dig(data, "best_oa_location", "pdf_url")
    )
    oa_url = oa_url or _http_url(_dig(data, "best_oa_location", "landing_page_url"))

    return OpenAlexWork(
        id=work_id,
        title=_plain(data.get("display_name")) or f"Trabalho sem título no OpenAlex ({work_id})",
        year=year if isinstance(year, int) and not isinstance(year, bool) else None,
        authors=authors,
        venue=_plain(_dig(data, "primary_location", "source", "display_name")),
        doi=_doi(data.get("doi")),
        abstract=rebuild_abstract(data.get("abstract_inverted_index")),
        oa_url=oa_url,
        url=f"{LANDING_BASE}/{work_id}",
    )
