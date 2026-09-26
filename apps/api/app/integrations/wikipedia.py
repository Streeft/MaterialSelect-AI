"""Wikipedia: articles searched and read through the Action API (D-97).

A notebook source of kind ``wikipedia`` is one article of the edition named by
``WIKIPEDIA_LANG`` (``pt`` by default), read as plain text through the
TextExtracts extension (``explaintext=1&exsectionformat=wiki``). The API is
free and keyless; what Wikimedia asks in exchange is a User-Agent with a way to
reach the operator, which :func:`app.integrations.http.build_client` sends —
this module only uses the client it is handed, and only ever calls
``https://{lang}.wikipedia.org/w/api.php``.

**The license travels with the text.** Wikipedia text is CC BY-SA 4.0: reuse
must credit the article and its contributors, name the license with a link to
it, and say whether the text was changed. :attr:`WikiPage.attribution` is that
sentence, dated and pinned to the revision read, and the service stores it on
the source and copies it into every citation of its passages.

**What "unchanged" means here.** The content is not edited. Two things change
in its *layout*, and the attribution says both: paragraphs are split onto their
own lines, and section titles are rewritten from ``== Título ==`` into the
numbered form the notebook chunker recognises as a heading
(``app.knowledge.chunking.looks_like_heading``) — see :func:`format_extract`.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any
from urllib.parse import quote

import httpx

from app.domain.errors import NotFoundError, ValidationError
from app.integrations.errors import ExternalUnavailableError
from app.knowledge.chunking import looks_like_heading, normalise

LICENSE = "CC BY-SA 4.0"
LICENSE_URL = "https://creativecommons.org/licenses/by-sa/4.0/"

#: Results one search may ask for.
MAX_RESULTS = 20
#: A search is a few words. Longer is a paste, not a query.
MAX_QUERY_CHARS = 200
#: The chunker reads a heading only up to this length.
MAX_HEADING_CHARS = 120
#: Section markers stay at or below this. The guardrails exempt integers up to
#: 100 from numeric grounding ("o 1º colocado"), and a heading's figures count as
#: its passages' own (``grounding.passage_numbers``). A marker is therefore kept
#: small *and* written ``"3. "`` — with the full stop — because the guardrail
#: tokenizer reads space-grouped thousands: ``"3 200 anos"`` would read as 3200,
#: a figure the article never stated, and lose the 200 it did. ``"3. 200 anos"``
#: reads as 3 and 200, and the chunker still takes it as a numbered heading.
MAX_SECTION_MARKER = 100

#: Wikipedia language codes: ``pt``, ``en``, ``simple``, ``zh-yue``. Checked
#: because the code becomes part of a host name.
_LANG = re.compile(r"[a-z]{2,12}(?:-[a-z]{2,12})*")
_LANG_NAMES = {
    "pt": "em português",
    "en": "em inglês",
    "es": "em espanhol",
    "fr": "em francês",
    "de": "em alemão",
    "it": "em italiano",
}
_WIKI_HEADING = re.compile(r"(={2,6})\s*(.*?)\s*\1")
_TAG = re.compile(r"<[^>]*>")
_TRAILING_PUNCTUATION = ".:;, "
#: Characters MediaWiki leaves unescaped in an article path (``wfUrlencode``).
_PATH_SAFE = ";@$!*(),/~:"

RATE_LIMITED = (
    "A Wikipédia limitou as consultas deste servidor por alguns instantes. Tente de "
    "novo em um minuto."
)
REFUSED = (
    "A Wikipédia recusou as consultas deste servidor. O administrador precisa conferir "
    "o contato enviado na identificação (EXTERNAL_CONTACT)."
)
SERVICE_DOWN = "A Wikipédia está fora do ar ou instável agora. Tente de novo mais tarde."
TIMED_OUT = "A Wikipédia não respondeu a tempo. Tente de novo em instantes."
UNREACHABLE = (
    "Não foi possível falar com a Wikipédia agora (falha de conexão). Tente de novo " "mais tarde."
)
UNREADABLE = "A Wikipédia devolveu uma resposta que não deu para ler. Tente de novo mais tarde."
API_REFUSED = "A Wikipédia não conseguiu atender esta consulta agora. Tente de novo mais tarde."


@dataclass(frozen=True)
class WikiHit:
    """One search result."""

    pageid: int
    title: str
    #: The search excerpt as plain text; ``None`` when the API sent none.
    snippet: str | None
    url: str


@dataclass(frozen=True)
class WikiPage:
    """One article, read as plain text, with what its reuse requires."""

    pageid: int
    title: str
    #: The article's text, laid out for the chunker (:func:`format_extract`).
    text: str
    url: str
    #: The revision read; ``None`` only if the API did not say.
    revision_id: int | None
    attribution: str
    lang: str
    retrieved_on: date
    license: str = LICENSE
    license_url: str = LICENSE_URL


@dataclass
class _Section:
    label: str | None
    title: str | None
    lines: list[str] = field(default_factory=list)


# --- configuration -----------------------------------------------------------


def enabled(settings: object) -> tuple[bool, str | None]:
    """Whether Wikipedia can be searched here, and why not when it cannot."""
    lang = _lang(settings)
    if not _LANG.fullmatch(lang):
        return False, (
            "A busca na Wikipédia está desligada neste servidor: o idioma configurado "
            "(WIKIPEDIA_LANG) não é um código de idioma da Wikipédia, como pt ou en."
        )
    return True, None


def _lang(settings: object) -> str:
    return str(getattr(settings, "wikipedia_lang", "pt") or "pt").strip().lower()


def _api_url(settings: object) -> str:
    ok, reason = enabled(settings)
    if not ok:
        raise ExternalUnavailableError(reason or UNREADABLE)
    return f"https://{_lang(settings)}.wikipedia.org/w/api.php"


def article_url(lang: str, title: str) -> str:
    """The article's canonical address, the same for a search hit and a page."""
    return f"https://{lang}.wikipedia.org/wiki/{quote(title.replace(' ', '_'), safe=_PATH_SAFE)}"


def edition_name(lang: str) -> str:
    """ "Wikipédia em português", or the code when the name is not known."""
    name = _LANG_NAMES.get(lang)
    return f"Wikipédia {name}" if name else f"Wikipédia ({lang})"


# --- public API --------------------------------------------------------------


def search(client: httpx.Client, settings: object, query: str, limit: int = 8) -> list[WikiHit]:
    """Articles matching ``query``, in the search engine's order.

    Only the article namespace is searched: a user page or a talk page is not
    an encyclopedia article. The snippet comes back as HTML (the match wrapped
    in ``<span class="searchmatch">``); it is returned as plain text.
    """
    url = _api_url(settings)
    text = _clean_query(query)
    per_page = max(1, min(int(limit), MAX_RESULTS))
    data = _get(
        client,
        url,
        {
            "action": "query",
            "list": "search",
            "srsearch": text,
            "srlimit": per_page,
            "srnamespace": 0,
            "srprop": "snippet",
            "format": "json",
            "formatversion": 2,
        },
    )
    results = _dig(data, "query", "search")
    if not isinstance(results, list):
        raise ExternalUnavailableError(UNREADABLE)
    lang = _lang(settings)
    hits: list[WikiHit] = []
    for item in results:
        if not isinstance(item, dict):
            continue
        pageid = item.get("pageid")
        title = item.get("title")
        if not _is_pageid(pageid) or not isinstance(title, str) or not title.strip():
            continue
        hits.append(
            WikiHit(
                pageid=pageid,
                title=title.strip(),
                snippet=_plain(item.get("snippet")),
                url=article_url(lang, title.strip()),
            )
        )
    return hits[:per_page]


def page(
    client: httpx.Client, settings: object, pageid: int, *, today: date | None = None
) -> WikiPage:
    """One article by page id, as plain text with its attribution.

    A page that does not exist, is only a redirect, or is not an article is a
    :class:`NotFoundError`; an article with no text is a
    :class:`ValidationError`. ``today`` dates the attribution (tests pin it).
    """
    url = _api_url(settings)
    if not _is_pageid(pageid):
        raise ValidationError("Identificador de artigo da Wikipédia inválido.")
    lang = _lang(settings)
    data = _get(
        client,
        url,
        {
            "action": "query",
            "prop": "extracts|info|revisions",
            "pageids": pageid,
            "explaintext": 1,
            "exsectionformat": "wiki",
            "inprop": "url",
            "rvprop": "ids",
            "format": "json",
            "formatversion": 2,
        },
    )
    pages = _dig(data, "query", "pages")
    if not isinstance(pages, list):
        raise ExternalUnavailableError(UNREADABLE)
    found = next(
        (item for item in pages if isinstance(item, dict) and item.get("pageid") == pageid),
        None,
    )
    edition = edition_name(lang)
    if found is None or found.get("missing") or found.get("invalid"):
        raise NotFoundError(f"Este artigo não existe (mais) na {edition}.")
    if found.get("redirect"):
        raise NotFoundError(
            "Esta página da Wikipédia é só um redirecionamento. Procure pelo título do artigo."
        )
    if found.get("ns") != 0:
        raise NotFoundError("Esta página da Wikipédia não é um artigo.")
    title = found.get("title")
    if not isinstance(title, str) or not title.strip():
        raise ExternalUnavailableError(UNREADABLE)
    title = title.strip()
    extract = found.get("extract")
    text = format_extract(extract) if isinstance(extract, str) else ""
    if not text:
        raise ValidationError(f"O artigo “{title}” não tem texto para importar.")

    revision_id = _revision_id(found)
    address = article_url(lang, title)
    day = today or date.today()
    return WikiPage(
        pageid=pageid,
        title=title,
        text=text,
        url=address,
        revision_id=revision_id,
        attribution=attribution_text(title, lang, address, revision_id, day),
        lang=lang,
        retrieved_on=day,
    )


def parse_pageid(value: object) -> int:
    """A page id from a request key (``"123"`` or ``123``), or a pt-BR 400."""
    if isinstance(value, str) and value.strip().isdecimal() and value.strip().isascii():
        value = int(value.strip())
    if _is_pageid(value):
        return value  # type: ignore[return-value]
    raise ValidationError("Identificador de artigo da Wikipédia inválido.")


def attribution_text(
    title: str, lang: str, url: str, revision_id: int | None, retrieved_on: date
) -> str:
    """The credit CC BY-SA 4.0 asks for: work, authors, license, changes."""
    revision = f"revisão {revision_id}" if revision_id else "revisão não informada pela Wikipédia"
    return (
        f"Texto de “{title}”, da {edition_name(lang)} ({url}), escrito por colaboradores "
        f"da Wikipédia e publicado sob a licença {LICENSE} ({LICENSE_URL}); {revision}, "
        f"obtido em {retrieved_on.strftime('%d/%m/%Y')}. Texto sem modificações de "
        "conteúdo: os títulos de seção foram numerados e o texto dividido em trechos "
        "para busca."
    )


# --- layout for the chunker ----------------------------------------------------


def format_extract(extract: str) -> str:
    """The plain-text extract, laid out so the chunker sees its sections.

    TextExtracts writes a section title as ``== Título ==`` (``===`` one level
    down) and separates paragraphs with a single line break. The notebook
    chunker splits blocks on blank lines and knows a heading only as a short
    line that is numbered or in capitals. So:

    * every paragraph becomes its own block (blank line between);
    * every section title becomes a numbered block, ``"3. Propriedades"``, and a
      subsection carries its parents, ``"3. Propriedades › Mecânicas"`` — the
      number is the top-level section's position in the article (every
      top-level title counts, even an empty one), wrapped to stay at or below
      :data:`MAX_SECTION_MARKER` and followed by a full stop so it never merges
      with a title that starts with a figure (see the constant); trailing
      ``.:;,`` is dropped from a title,
      or the chunker would read it as the end of a sentence;
    * a section with no text is not emitted;
    * a *paragraph* the chunker would mistake for a heading (a list item such
      as ``"1990 Fundação"``) is joined to its neighbour in the same section,
      so the only headings the chunker sees are the article's own. When a whole
      section reads as one heading, its title goes in front of its text; if
      even that reads as one, the section joins the one before it.

    No word of the article is added, dropped or changed.
    """
    out: list[str] = []
    for section in _sections(extract):
        blocks = _group(section.lines)
        if not blocks:
            continue
        if len(blocks) == 1 and _reads_as_heading(blocks[0]) and section.title:
            titled = f"{section.title}\n{blocks[0]}"
            if not _reads_as_heading(titled):
                blocks = [titled]
            elif out:
                # Every emitted label is followed by at least one block, so the
                # last thing out is always text.
                out[-1] = f"{out[-1]}\n{titled}"
                continue
        if section.label:
            out.append(section.label)
        out.extend(blocks)
    return "\n\n".join(out)


def _sections(extract: str) -> list[_Section]:
    sections = [_Section(label=None, title=None)]
    trail: dict[int, str] = {}
    top = 0
    for raw in extract.splitlines():
        line = " ".join(raw.split())
        if not line:
            continue
        match = _WIKI_HEADING.fullmatch(line)
        if match is None:
            sections[-1].lines.append(line)
            continue
        level = len(match.group(1))
        title = match.group(2).rstrip(_TRAILING_PUNCTUATION).strip()
        if not title:
            continue
        if level <= 2 or top == 0:
            top += 1
        for deeper in [key for key in trail if key >= level]:
            del trail[deeper]
        trail[level] = title
        sections.append(
            _Section(label=_label(top, [trail[key] for key in sorted(trail)]), title=title)
        )
    return sections


def _label(top: int, trail: list[str]) -> str:
    """``"3. Propriedades › Mecânicas"``, short enough to be read as a heading."""
    marker = (top - 1) % MAX_SECTION_MARKER + 1
    label = f"{marker}. {' › '.join(trail)}"
    if len(label) > MAX_HEADING_CHARS:
        label = f"{marker}. {trail[-1]}"
    if len(label) > MAX_HEADING_CHARS:
        label = label[: MAX_HEADING_CHARS - 1].rstrip(_TRAILING_PUNCTUATION) + "…"
    return label


def _reads_as_heading(text: str) -> bool:
    """What the chunker will decide about ``text`` as one block."""
    return looks_like_heading(normalise(text))


def _group(lines: list[str]) -> list[str]:
    """Paragraphs as blocks, none of which the chunker would read as a heading.

    A paragraph that would read as one is joined (by a line break, which the
    chunker turns into a space) to the block before it, or the next paragraph is
    joined to it; whatever still reads as one at the end is folded backwards.
    Only a section whose whole text reads as a heading survives as one block
    that does — :func:`format_extract` deals with it.
    """
    blocks: list[str] = []
    for line in lines:
        if blocks and (_reads_as_heading(blocks[-1]) or _reads_as_heading(line)):
            blocks[-1] = f"{blocks[-1]}\n{line}"
        else:
            blocks.append(line)
    while len(blocks) > 1 and _reads_as_heading(blocks[-1]):
        last = blocks.pop()
        blocks[-1] = f"{blocks[-1]}\n{last}"
    return blocks


# --- HTTP --------------------------------------------------------------------


def _get(client: httpx.Client, url: str, params: dict[str, Any]) -> Any:
    try:
        response = client.get(url, params=params)
    except httpx.TimeoutException:
        raise ExternalUnavailableError(TIMED_OUT) from None
    except httpx.RequestError:
        raise ExternalUnavailableError(UNREACHABLE) from None
    status = response.status_code
    if status == 429:
        raise ExternalUnavailableError(RATE_LIMITED)
    if status in (401, 403):
        raise ExternalUnavailableError(REFUSED)
    if status >= 500:
        raise ExternalUnavailableError(SERVICE_DOWN)
    if status != 200:
        raise ExternalUnavailableError(
            f"A Wikipédia respondeu de forma inesperada (HTTP {status}). Tente de novo "
            "mais tarde."
        )
    try:
        data = response.json()
    except ValueError:
        raise ExternalUnavailableError(UNREADABLE) from None
    if not isinstance(data, dict):
        raise ExternalUnavailableError(UNREADABLE)
    if "error" in data:
        # The Action API reports its own refusals (rate limits included) with a
        # 200 and an ``error`` object.
        raise ExternalUnavailableError(API_REFUSED)
    return data


# --- parsing -----------------------------------------------------------------


def _clean_query(query: str) -> str:
    text = " ".join(query.split()) if isinstance(query, str) else ""
    if not text:
        raise ValidationError("Digite o que procurar na Wikipédia.")
    if len(text) > MAX_QUERY_CHARS:
        raise ValidationError(
            f"A busca tem mais de {MAX_QUERY_CHARS} caracteres. Use algumas palavras-chave."
        )
    return text


def _is_pageid(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _plain(value: object) -> str | None:
    """HTML to plain text: tags stripped first, then entities decoded.

    In that order, so an escaped ``&lt;b&gt;`` in the article survives as the
    literal text it is, instead of being read as markup and dropped.
    """
    if not isinstance(value, str):
        return None
    text = " ".join(html.unescape(_TAG.sub("", value)).split())
    return text or None


def _dig(data: object, *keys: str) -> object:
    for key in keys:
        if not isinstance(data, dict):
            return None
        data = data.get(key)
    return data


def _revision_id(found: dict[str, Any]) -> int | None:
    revisions = found.get("revisions")
    if isinstance(revisions, list) and revisions and isinstance(revisions[0], dict):
        revid = revisions[0].get("revid")
        if _is_pageid(revid):
            return revid  # type: ignore[no-any-return]
    lastrevid = found.get("lastrevid")
    return lastrevid if _is_pageid(lastrevid) else None
