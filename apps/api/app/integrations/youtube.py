"""YouTube as a notebook source (D-97): which video, what it is called, and the
transcript the student pasted.

Three jobs, and fetching a transcript is not one of them:

* :func:`video_id` reduces the link the student pasted to the video's
  eleven-character id, or to nothing. Everything after that is rebuilt from the
  id (:func:`canonical_url`), so no part of the pasted link ever reaches a
  request — which is why this module may call its one fixed host directly
  instead of going through :mod:`app.integrations.safe_fetch`.
* :func:`oembed` asks YouTube's keyless oEmbed endpoint for the title and the
  channel. It is a convenience and **never raises**: a video YouTube will not
  describe (private, removed, embedding switched off, the network down) still
  becomes a source, named by :func:`display_title`. The source is the pasted
  transcript, not the title.
* :func:`clean_pasted_transcript` strips what is markup — timestamps,
  subtitle-file numbering, cue timings and tags — and keeps every word, in
  order. A transcript is data: nothing in it is corrected, translated or obeyed.

Why there is no automatic transcript — read this before "fixing" it. Since
2025–26 YouTube's caption endpoint (``/api/timedtext``, which the
``captionTracks`` URLs of a watch page point at) demands a Proof-of-Origin token
minted by its BotGuard challenge inside a real browser. Without one it answers
``200`` with an **empty body** — not an error, so a naive client reports "no
captions" for every video. From a datacenter IP, where this API runs, the
unofficial scraping libraries are blocked outright as well. The ways around it
are running BotGuard on the server (a headless browser) or paying a transcript
service, and both break the zero-cost rule of D-97. So the student opens
"Mostrar transcrição" under the video, copies the panel and pastes it, and the
screen asks for exactly that whenever no transcript was sent.
"""

from __future__ import annotations

import html
import logging
import re
from dataclasses import dataclass
from itertools import pairwise
from urllib.parse import parse_qs, urlsplit

import httpx

from app.domain.errors import ValidationError

logger = logging.getLogger(__name__)

#: Keyless; answers ``title`` and ``author_name`` (the channel) for any public,
#: embeddable video. 401 for a private one or with embedding off, 404 for a
#: removed one.
OEMBED_ENDPOINT = "https://www.youtube.com/oembed"
#: The title is a convenience; the student is waiting on the add button, so a
#: slow YouTube costs at most this and the source goes in with the fallback.
OEMBED_TIMEOUT_SECONDS = 5.0
#: ``NotebookSource.title`` is ``String(300)``. YouTube caps titles at 100, so
#: this only ever trims a payload that is not really a title.
TITLE_MAX_CHARS = 300

#: Below this, what was pasted is not a video's transcript. Speech runs at
#: roughly 150 words a minute, six characters a word with its space, so 200
#: characters is about fifteen seconds of talk. The shortest real case — a
#: 30-second Short — is ~450 characters and passes; the usual mistakes do not: a
#: YouTube title is at most 100 characters, a link about 45, a single caption
#: line under 50, and a copy that caught only the timestamps cleans to nothing.
MIN_TRANSCRIPT_CHARS = 200
#: A new paragraph starts at the first sentence end past this length — so a
#: punctuated transcript reads in paragraphs of a few sentences ...
PARAGRAPH_MIN_CHARS = 400
#: ... and, when there is no punctuation to find (automatic captions have
#: none), at the first caption line past this one. Under the chunker's 1 200
#: target (``app.knowledge.chunking``), so it never has to cut inside one.
PARAGRAPH_MAX_CHARS = 1000

_VIDEO_ID = re.compile(r"[A-Za-z0-9_-]{11}")
#: Eleven characters that fit the id alphabet and are not videos:
#: ``/embed/videoseries?list=…`` is a playlist player and
#: ``/embed/live_stream?channel=…`` a channel's live slot.
_NOT_VIDEO_IDS = frozenset({"videoseries", "live_stream"})

_WATCH_HOSTS = frozenset({"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"})
_SHORT_HOSTS = frozenset({"youtu.be"})
_NOCOOKIE_HOSTS = frozenset({"youtube-nocookie.com", "www.youtube-nocookie.com"})
_ALL_HOSTS = _WATCH_HOSTS | _SHORT_HOSTS | _NOCOOKIE_HOSTS
#: ``youtube.com/<kind>/<id>`` paths that name one video.
_PATH_KINDS = frozenset({"shorts", "live", "embed"})
#: A link typed without its scheme is accepted only when it starts with one of
#: these exact hosts; anything else scheme-less is not a YouTube link.
_BARE_PREFIXES = tuple(f"{host}/" for host in sorted(_ALL_HOSTS))

# --- transcript markup -------------------------------------------------------

#: ``0:00``, ``12:34``, ``00:01:23``, ``1:02:03.456``, ``00:00:01,000``.
_CLOCK = r"(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?"
#: A line that is nothing but a timestamp — YouTube's "Mostrar transcrição"
#: panel copies each caption as a timestamp line followed by a text line.
_STAMP_LINE = re.compile(rf"[\[(]?({_CLOCK})[\])]?")
#: A timestamp in front of the text on the same line: ``[00:12] texto``,
#: ``(0:05) texto``, ``0:05 texto``, ``00:12 - texto``.
_STAMP_PREFIX = re.compile(
    rf"(?:\[{_CLOCK}\]|\({_CLOCK}\)|{_CLOCK}(?=[\s\-–—|]))\s*(?:[-–—|]\s*)?(?=\S)"
)
#: The spoken form of the timestamp above it, which the newer transcript panel
#: carries for screen readers and a copy picks up: ``1 minute, 3 seconds``,
#: ``1 minuto e 3 segundos``. Dropped only when it equals that timestamp — the
#: same words anywhere else are speech.
_DURATION_LINE = re.compile(
    r"(?:\d+\s+(?:hour|minute|second|hora|minuto|segundo)s?(?:\s*,\s*|\s+(?:and|e)\s+)?)+",
    re.IGNORECASE,
)
_DURATION_PART = re.compile(r"(\d+)\s+(hour|minute|second|hora|minuto|segundo)", re.IGNORECASE)
_UNIT_SECONDS = {
    "hour": 3600,
    "hora": 3600,
    "minute": 60,
    "minuto": 60,
    "second": 1,
    "segundo": 1,
}
#: SRT (``00:00:01,000 --> 00:00:04,000``) and WebVTT (``00:01.000 --> 00:04.000
#: align:start position:0%``) cue timings, cue settings included.
_CUE_TIMING = re.compile(rf"{_CLOCK}\s*-->\s*{_CLOCK}(?:\s.*)?")
#: SBV, the format YouTube Studio downloads: ``0:00:01.000,0:00:04.000``.
_SBV_TIMING = re.compile(r"\d{1,2}:\d{2}:\d{2}\.\d{3},\d{1,2}:\d{2}:\d{2}\.\d{3}")
#: WebVTT blocks that are not cues.
_VTT_BLOCKS = frozenset({"WEBVTT", "NOTE", "STYLE", "REGION"})
#: Cue markup: WebVTT class/voice/language spans and the SRT styling tags.
#: Named tags only, so a literal ``x < 5 e y > 3`` in speech survives.
_CUE_TAG = re.compile(r"</?(?:c|i|b|u|v|lang|ruby|rt|font)(?:[.\s][^<>]*)?>", re.IGNORECASE)
#: Karaoke timestamps inside a WebVTT cue: ``hello<00:00:00.480><c> everyone</c>``.
_INLINE_TIME = re.compile(rf"<{_CLOCK}>")
#: SSA overrides some SRT files carry: ``{\an8}``.
_SSA_TAG = re.compile(r"\{\\[^{}]*\}")
_SENTENCE_END = re.compile(r"[.!?…][\"'”’»)\]]*$")
#: In a text without timestamps, blank-line groups this short on average are
#: caption lines a tool spaced out, not paragraphs.
_SEGMENT_CHARS = 100


@dataclass(frozen=True)
class VideoInfo:
    """What YouTube said about a video. ``None`` is "YouTube did not say" — the
    screen writes that out, and :func:`display_title` names the source anyway."""

    video_id: str
    title: str | None
    channel: str | None


@dataclass(frozen=True)
class _Link:
    host: str
    segments: tuple[str, ...]
    query: str


# --- which video -------------------------------------------------------------


def _link(url: str) -> _Link | None:
    """The parts of ``url`` when it is an http(s) link on a YouTube host.

    Refused: other schemes, userinfo (``youtube.com@evil.com`` is evil.com, and
    ``user@youtube.com`` has no business being pasted), ports other than 80 and
    443, whitespace, control or invisible characters and backslashes inside the
    link, and every host not listed exactly — ``youtube.com.evil.com`` and
    ``notyoutube.com`` are other people's sites.
    """
    text = url.strip()
    if not text or " " in text or "\\" in text or not text.isprintable():
        return None
    if "://" not in text and text.lower().startswith(_BARE_PREFIXES):
        text = f"https://{text}"
    try:
        parts = urlsplit(text)
        port = parts.port
    except ValueError:
        return None
    if parts.scheme not in ("http", "https") or "@" in parts.netloc:
        return None
    if port is not None and port not in (80, 443):
        return None
    host = (parts.hostname or "").rstrip(".")
    if host not in _ALL_HOSTS:
        return None
    segments = tuple(segment for segment in parts.path.split("/") if segment)
    return _Link(host=host, segments=segments, query=parts.query)


def is_youtube_url(url: str) -> bool:
    """True when ``url`` is a link on a YouTube host, video or not.

    For routing: such a link goes to the YouTube flow and never to the page
    fetcher, which would get a page with no text without JavaScript. A channel
    or playlist link is routed here too, and :func:`require_video_id` then says
    it is not a video — a clearer answer than "the page has no readable text".
    """
    return _link(url) is not None


def video_id(url: str) -> str | None:
    """The video's id in ``url``, or ``None`` when ``url`` does not name one.

    Read from ``youtube.com/watch?v=ID`` (also on ``www.``, ``m.`` and
    ``music.``), ``youtu.be/ID``, ``/shorts/ID``, ``/live/ID``, ``/embed/ID``
    and ``youtube-nocookie.com/embed/ID``. Other query parameters (``t``,
    ``list``, ``si``) are ignored; a link with two ``v`` parameters is
    ambiguous and names nothing.
    """
    link = _link(url)
    if link is None:
        return None
    candidate: str | None = None
    if link.host in _SHORT_HOSTS:
        if len(link.segments) == 1:
            candidate = link.segments[0]
    elif link.host in _NOCOOKIE_HOSTS:
        if len(link.segments) == 2 and link.segments[0] == "embed":
            candidate = link.segments[1]
    elif link.segments == ("watch",):
        values = parse_qs(link.query).get("v", [])
        if len(values) == 1:
            candidate = values[0]
    elif len(link.segments) == 2 and link.segments[0] in _PATH_KINDS:
        candidate = link.segments[1]
    if candidate is None or candidate in _NOT_VIDEO_IDS or not _VIDEO_ID.fullmatch(candidate):
        return None
    return candidate


def require_video_id(url: str) -> str:
    """:func:`video_id`, or a pt-BR :class:`ValidationError` saying what to paste."""
    found = video_id(url)
    if found is None:
        raise ValidationError(
            "Este link não identifica um vídeo do YouTube. Use o endereço do próprio "
            "vídeo (youtube.com/watch?v=…, youtu.be/…, /shorts/… ou /live/…), e não o "
            "de um canal ou de uma playlist."
        )
    return found


def canonical_url(video_id: str) -> str:
    """The one address of a video — the source's ``origin`` and the dedup key.

    Raises ``ValueError`` for something that is not a video id: a malformed id
    reaching here is a bug in the caller, and it must not become an origin.
    """
    if not _VIDEO_ID.fullmatch(video_id) or video_id in _NOT_VIDEO_IDS:
        raise ValueError(f"not a YouTube video id: {video_id!r}")
    return f"https://www.youtube.com/watch?v={video_id}"


# --- what it is called -------------------------------------------------------


def _field(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    text = " ".join(value.split())[:TITLE_MAX_CHARS].strip()
    return text or None


def oembed(client: httpx.Client, video_id: str) -> VideoInfo:
    """Title and channel from YouTube's keyless oEmbed. Never raises for
    anything YouTube or the network does: any failure is a ``VideoInfo`` with
    both fields ``None``, because the title is a convenience and the pasted
    transcript is the source.

    Redirects are not followed (the client from ``build_client`` does not), so
    a redirect is a failure like any other non-200 answer.
    """
    unknown = VideoInfo(video_id=video_id, title=None, channel=None)
    params = {"url": canonical_url(video_id), "format": "json"}
    try:
        response = client.get(OEMBED_ENDPOINT, params=params, timeout=OEMBED_TIMEOUT_SECONDS)
    except httpx.HTTPError as exc:
        logger.info("oEmbed do YouTube indisponível para %s: %s", video_id, type(exc).__name__)
        return unknown
    if response.status_code != 200:
        logger.info("oEmbed do YouTube respondeu %s para %s", response.status_code, video_id)
        return unknown
    try:
        payload = response.json()
    except ValueError:
        logger.info("oEmbed do YouTube devolveu JSON inválido para %s", video_id)
        return unknown
    if not isinstance(payload, dict):
        return unknown
    return VideoInfo(
        video_id=video_id,
        title=_field(payload.get("title")),
        channel=_field(payload.get("author_name")),
    )


def display_title(info: VideoInfo) -> str:
    """The source's title: the video's own, or "Vídeo do YouTube (ID)"."""
    return info.title or f"Vídeo do YouTube ({info.video_id})"


# --- the pasted transcript ---------------------------------------------------


def clean_pasted_transcript(text: str) -> str:
    """The words of a pasted transcript, in paragraphs, without the markup.

    Recognised, in this order: a subtitle file (SRT, WebVTT or SBV — any cue
    timing line makes it one), a timestamped transcript (a quarter or more of
    the lines carry a timestamp: the "Mostrar transcrição" copy, ``[00:12]
    texto`` exports), and otherwise plain text, whose lines are all kept. A
    timestamp is removed only in a text that is timestamped, so ``10:30 da
    manhã`` in plain prose is speech and stays.

    Words are never changed, reordered or dropped, with one exception: the
    rolling captions of YouTube's automatic WebVTT repeat every line in the next
    cue, and there a line equal to the one just kept is the repetition. Lines
    are joined with a space; paragraphs break at a sentence end past
    :data:`PARAGRAPH_MIN_CHARS`, or at a line boundary past
    :data:`PARAGRAPH_MAX_CHARS` when there is no punctuation — never inside a
    line.

    Raises a pt-BR :class:`ValidationError` when nothing, or less than
    :data:`MIN_TRANSCRIPT_CHARS`, is left.
    """
    lines = [_squash(line) for line in text.lstrip("﻿").splitlines()]
    if any(_is_timing(line) for line in lines):
        groups = [_cue_lines(lines)]
    else:
        stamped = _stamped_lines(lines)
        groups = [stamped] if stamped is not None else _plain_groups(lines)
    cleaned = "\n\n".join(_paragraphs(groups))
    if not cleaned:
        raise ValidationError(
            "A transcrição colada não tem texto além das marcas de tempo. No YouTube, "
            "abra “Mostrar transcrição” embaixo do vídeo, selecione o painel inteiro, "
            "copie e cole aqui."
        )
    if len(cleaned) < MIN_TRANSCRIPT_CHARS:
        raise ValidationError(
            f"A transcrição colada tem só {len(cleaned)} caracteres de texto, pouco para "
            f"ser a transcrição de um vídeo (o mínimo é {MIN_TRANSCRIPT_CHARS}, uns 15 "
            "segundos de fala). No YouTube, abra “Mostrar transcrição” embaixo do vídeo, "
            "copie o painel inteiro e cole aqui."
        )
    return cleaned


def _squash(line: str) -> str:
    return " ".join(line.split())


def _is_timing(line: str) -> bool:
    return bool(_CUE_TIMING.fullmatch(line) or _SBV_TIMING.fullmatch(line))


def _groups(lines: list[str]) -> list[list[str]]:
    """Runs of non-blank lines."""
    groups: list[list[str]] = []
    current: list[str] = []
    for line in lines:
        if line:
            current.append(line)
        elif current:
            groups.append(current)
            current = []
    if current:
        groups.append(current)
    return groups


def _cue_lines(lines: list[str]) -> list[str]:
    """The text of a subtitle file's cues, without numbering, timings or tags."""
    vtt = next((line for line in lines if line), "").startswith("WEBVTT")
    cues: list[list[str]] = []
    for block in _groups(lines):
        is_timed = any(_is_timing(line) for line in block)
        if vtt and not is_timed and block[0].split(" ", 1)[0] in _VTT_BLOCKS:
            continue  # the header, a NOTE, a STYLE or a REGION block
        cue: list[str] = []
        for index, line in enumerate(block):
            following = block[index + 1] if index + 1 < len(block) else ""
            if _is_timing(line):
                if cue:
                    cues.append(cue)
                cue = []
                continue
            # The cue's identifier (an SRT sequence number, a WebVTT id) sits
            # right above its timing: first in its block, or a bare number when
            # a file dropped the blank line between cues.
            if _is_timing(following) and (index == 0 or line.isdigit()):
                continue
            cleaned = _squash(_SSA_TAG.sub("", _INLINE_TIME.sub("", _CUE_TAG.sub("", line))))
            if vtt:
                cleaned = html.unescape(cleaned)
            if cleaned:
                cue.append(cleaned)
        if cue:
            cues.append(cue)

    # Rolling captions: most cues open with the line the previous one closed.
    pairs = list(pairwise(cues))
    rolling = bool(pairs) and 2 * sum(1 for a, b in pairs if b[0] == a[-1]) >= len(pairs)
    kept: list[str] = []
    for cue in cues:
        for line in cue:
            if rolling and kept and line == kept[-1]:
                continue
            kept.append(line)
    return kept


def _stamp_seconds(line: str) -> int | None:
    """The time of a line that is only a timestamp, in whole seconds."""
    match = _STAMP_LINE.fullmatch(line)
    if match is None:
        return None
    seconds = 0
    for part in re.split(r"[.,]", match.group(1))[0].split(":"):
        seconds = seconds * 60 + int(part)
    return seconds


def _duration_seconds(line: str) -> int | None:
    if not _DURATION_LINE.fullmatch(line):
        return None
    return sum(
        int(amount) * _UNIT_SECONDS[unit.lower()] for amount, unit in _DURATION_PART.findall(line)
    )


def _stamped_lines(lines: list[str]) -> list[str] | None:
    """The text lines of a timestamped transcript, or ``None`` when it is not one."""
    kept: list[str] = []
    seen = 0
    marked = 0
    stamp: int | None = None  # the time on the timestamp line just above
    for line in lines:
        if not line:
            continue
        seen += 1
        above, stamp = stamp, None
        seconds = _stamp_seconds(line)
        if seconds is not None:
            marked += 1
            stamp = seconds
            continue
        if above is not None and _duration_seconds(line) == above:
            marked += 1
            continue
        prefix = _STAMP_PREFIX.match(line)
        if prefix is not None:
            marked += 1
            line = line[prefix.end() :]
        kept.append(line)
    if seen == 0 or 4 * marked < seen:
        return None
    return kept


def _plain_groups(lines: list[str]) -> list[list[str]]:
    """Paragraphs of a text without timestamps: its own blank lines, unless they
    only space out caption lines."""
    groups = _groups(lines)
    if len(groups) > 1:
        average = sum(len(" ".join(group)) for group in groups) / len(groups)
        if average < _SEGMENT_CHARS:
            return [[line for group in groups for line in group]]
    return groups


def _paragraphs(groups: list[list[str]]) -> list[str]:
    paragraphs: list[str] = []
    for group in groups:
        current: list[str] = []
        size = 0
        for line in group:
            current.append(line)
            size += len(line) + 1
            if size >= PARAGRAPH_MAX_CHARS or (
                size >= PARAGRAPH_MIN_CHARS and _SENTENCE_END.search(line)
            ):
                paragraphs.append(" ".join(current))
                current = []
                size = 0
        if current:
            paragraphs.append(" ".join(current))
    return paragraphs
