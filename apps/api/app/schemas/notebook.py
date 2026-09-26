"""Contracts of the Cadernos (D-92)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

ChatGoal = Literal["padrao", "guia", "personalizado"]
ResponseLength = Literal["curta", "padrao", "longa"]
#: Phase 1 kinds, then the external ones of phase 3 (D-97). ``SourceOut.kind``
#: stays ``str``: a stored row outlives this list.
SourceKind = Literal[
    "arquivo", "texto", "ficha", "estudo", "site", "youtube", "artigo", "wikipedia"
]
#: Where a search looks (D-97): OpenAlex works, Wikipedia articles, or the web
#: through the Gemini grounding tool.
SearchProvider = Literal["openalex", "wikipedia", "web"]

#: The longest URL accepted from a student, and the column that keeps it
#: (``NotebookSource.origin``). A longer one is refused, never cut: a cut URL
#: is another address.
MAX_URL_CHARS = 500
#: Pasted text, a pasted transcript included — the same ceiling as
#: ``notebook_max_source_chars``' default.
MAX_PASTED_CHARS = 800_000


class NotebookIn(BaseModel):
    title: str = Field(default="Caderno sem título", min_length=1, max_length=200)
    emoji: str = Field(default="📓", min_length=1, max_length=16)


class NotebookUpdate(BaseModel):
    """Only what is sent changes. ``chat_instructions`` accepts ``""`` to clear."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    emoji: str | None = Field(default=None, min_length=1, max_length=16)
    chat_goal: ChatGoal | None = None
    chat_instructions: str | None = Field(default=None, max_length=4000)
    response_length: ResponseLength | None = None


class CitationOut(BaseModel):
    """One passage an answer cites, copied into the answer.

    Copied rather than joined: a citation stays readable after its source is
    removed from the notebook, which is when a student most needs to know what
    an old answer rested on. ``source_id`` is then a dangling reference, and the
    screen says the source is gone.
    """

    number: int
    chunk_id: int
    source_id: int
    source_title: str
    #: Where an external source came from, and the attribution its licence
    #: asks for (D-97) — copied like the title, so a CC BY-SA passage keeps its
    #: credit in every answer, note and export that quotes it. ``None`` for the
    #: phase 1 kinds and for every citation stored before phase 3.
    source_url: str | None = None
    source_attribution: str | None = None
    heading: str | None = None
    page_start: int | None = None
    page_end: int | None = None
    excerpt: str


class ParagraphOut(BaseModel):
    text: str
    #: Numbers of ``citations`` below, 1-based, in reading order.
    citations: list[int] = []


class AnswerOut(BaseModel):
    paragraphs: list[ParagraphOut] = []
    citations: list[CitationOut] = []
    #: The model said the sources do not answer the question.
    not_found: bool = False
    #: Why a paragraph was left out — a figure no cited passage contains. Said,
    #: never silently repaired (the guardrails' rule).
    withheld: list[str] = []


class MessageOut(BaseModel):
    id: int
    role: Literal["user", "assistant"]
    created_at: datetime
    #: The question, for a user turn.
    text: str | None = None
    #: The answer, for an assistant turn.
    answer: AnswerOut | None = None


class SourceOut(BaseModel):
    id: int
    kind: str
    title: str
    origin: str | None = None
    status: str
    error: str | None = None
    char_count: int
    page_count: int | None = None
    selected: bool
    truncated: bool = False
    created_at: datetime
    #: External sources only (D-97); ``None`` means the source has none — a
    #: pasted text has no address and no licence to state.
    url: str | None = None
    attribution: str | None = None
    license: str | None = None
    #: What else is known about where it came from, keyed as in
    #: ``SOURCE_DETAIL_KEYS``. Only keys with a value are present; ``None``
    #: when there is nothing.
    details: dict[str, Any] | None = None


class SourceDetailOut(SourceOut):
    content: str


class NoteOut(BaseModel):
    id: int
    title: str
    body: str
    origin: str
    citations: list[CitationOut] | None = None
    created_at: datetime
    updated_at: datetime


class UsageOut(BaseModel):
    """Today's AI calls against the per-student limit."""

    used: int
    limit: int
    remaining: int


class NotebookSummaryOut(BaseModel):
    id: int
    title: str
    emoji: str
    source_count: int
    created_at: datetime
    updated_at: datetime


class NotebookOut(BaseModel):
    id: int
    title: str
    emoji: str
    created_at: datetime
    updated_at: datetime
    chat_goal: ChatGoal
    chat_instructions: str | None = None
    response_length: ResponseLength
    #: The notebook guide. ``None`` is "not written yet", never "nothing to say".
    summary: AnswerOut | None = None
    suggested_questions: list[str] = []
    sources: list[SourceOut]
    notes: list[NoteOut]
    usage: UsageOut
    #: Requests to outside sources today — pages, transcripts, searches (D-97).
    fetch_usage: UsageOut
    max_sources: int
    #: Whether the AI layer is on and whether it is the simulated provider — the
    #: screen shows the free-plan privacy notice only for a real one.
    ai_enabled: bool
    ai_simulated: bool
    ai_notice: str


class TextSourceIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    text: str = Field(min_length=1, max_length=MAX_PASTED_CHARS)


class AppSourceIn(BaseModel):
    kind: Literal["ficha", "estudo"]
    record_id: int = Field(gt=0)


# --- Fontes externas (D-97) --------------------------------------------------

#: The ``NotebookSource.meta`` keys ``SourceOut.details`` shows. A curated list
#: and not the whole column: ``meta`` is the backend's record of a fetch, and
#: what reaches the screen is decided here, key by key.
SOURCE_DETAIL_KEYS: tuple[str, ...] = (
    "authors",
    "year",
    "venue",
    "doi",
    "oa_url",
    "channel",
    "video_id",
    "transcript_origin",
    "found_via",
    "site_name",
    "revision_id",
    "fetched_at",
)


class UrlSourceIn(BaseModel):
    """A web page, by its address. The server fetches it; nothing the client
    says about the page is trusted."""

    url: str = Field(min_length=1, max_length=MAX_URL_CHARS)


class YoutubeSourceIn(BaseModel):
    """A video. ``transcript`` is the one the student pasted — there is no
    automatic transcript (YouTube asks for a token a server cannot produce), so
    omitted means "tell me the title and ask for it"."""

    url: str = Field(min_length=1, max_length=MAX_URL_CHARS)
    transcript: str | None = Field(default=None, max_length=MAX_PASTED_CHARS)


class YoutubeOut(BaseModel):
    """A video added, or what the student still has to do.

    ``source`` is ``None`` exactly when ``needs_transcript`` is true — no
    transcript was sent —, ``reason`` says so in pt-BR, and pasting it is the
    way forward. ``video_title`` is the video's own (oEmbed), or ``None`` when
    YouTube did not say."""

    source: SourceOut | None = None
    needs_transcript: bool = False
    video_title: str | None = None
    reason: str | None = None


class SearchIn(BaseModel):
    provider: SearchProvider
    query: str = Field(min_length=1, max_length=300)


class SearchResultOut(BaseModel):
    """One thing a search found. ``key`` is what ``ExternalSourceIn`` sends back
    — the server fetches again by it, never from text the client holds."""

    provider: SearchProvider
    key: str
    title: str
    #: Authors and year of a work, the site of a page. ``None`` when unknown —
    #: the screen writes that out.
    subtitle: str | None = None
    snippet: str | None = None
    url: str | None = None
    license: str | None = None
    #: False when there is no text to add — a work without an abstract. Shown,
    #: not selectable.
    has_text: bool = True
    #: This notebook already has a source from the same origin.
    already_added: bool = False


class SearchOut(BaseModel):
    results: list[SearchResultOut] = []
    #: What the student should know about these results — the provider's
    #: privacy terms, or why a search found nothing.
    notice: str | None = None
    #: Google's Search Suggestions for a web search, which its terms require to
    #: be shown with grounded results. Third-party HTML: the screen renders it
    #: only inside a sandboxed ``<iframe srcdoc>``, never into the page.
    search_entry_point_html: str | None = None


class ExternalSourceIn(BaseModel):
    """A search result, added. ``key`` is an OpenAlex work id, a Wikipedia page
    id, or — for a web result — the page's URL."""

    provider: SearchProvider
    key: str = Field(min_length=1, max_length=MAX_URL_CHARS)


class SourceCapabilityOut(BaseModel):
    enabled: bool
    #: Why it is off, in pt-BR. ``None`` when it is on.
    reason: str | None = None


class SourceCapabilitiesOut(BaseModel):
    """What the "add a source" screens can offer on this server, and why not."""

    link: SourceCapabilityOut
    youtube: SourceCapabilityOut
    openalex: SourceCapabilityOut
    wikipedia: SourceCapabilityOut
    web: SourceCapabilityOut


class SourceUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    selected: bool | None = None


class SelectAllIn(BaseModel):
    selected: bool


class AskIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


class ChatOut(BaseModel):
    question: MessageOut
    answer: MessageOut
    usage: UsageOut


class NoteIn(BaseModel):
    title: str = Field(default="Nova nota", min_length=1, max_length=200)
    body: str = Field(default="", max_length=20_000)


class NoteUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    body: str | None = Field(default=None, max_length=20_000)


# --- Estúdio (D-94) ----------------------------------------------------------

StudioTool = Literal["report", "flashcards", "quiz", "table", "mindmap"]
ArtifactStatus = Literal["gerando", "pronto", "falhou"]


class StudioIn(BaseModel):
    """What the "Criar …" modal sends. Every choice is a slug from the catalogue;
    a choice the tool does not have is refused, never ignored (the D-56 rule)."""

    tool: StudioTool
    format: str | None = Field(default=None, max_length=32)
    template: str | None = Field(default=None, max_length=64)
    #: The template's instruction as the student left it under the pencil.
    #: Omitted means the template's own.
    instructions: str | None = Field(default=None, max_length=2000)
    topic: str | None = Field(default=None, max_length=500)
    count: str | None = Field(default=None, max_length=16)
    difficulty: str | None = Field(default=None, max_length=16)
    columns: list[str] | None = Field(default=None, max_length=8)


class ArtifactUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class ArtifactSummaryOut(BaseModel):
    id: int
    tool: StudioTool
    format: str | None = None
    template: str | None = None
    title: str
    #: "gerando" past its deadline reads as "falhou" — derived, never written by
    #: a GET.
    status: ArtifactStatus
    error: str | None = None
    source_count: int
    #: Sections, cards, questions, rows or nodes. ``None`` until it is ready.
    item_count: int | None = None
    #: The choices it was made with — what "Tentar de novo" sends back.
    options: dict = {}
    created_at: datetime
    updated_at: datetime


class MindMapNodeOut(BaseModel):
    id: int
    parent: int | None = None
    label: str
    #: The label broken into lines by the backend, so the screen wraps where
    #: the SVG export does.
    lines: list[str]
    depth: int
    x: float
    y: float
    width: float
    height: float
    citations: list[int] = []


class MindMapEdgeOut(BaseModel):
    source: int
    target: int
    x1: float
    y1: float
    x2: float
    y2: float


class MindMapLayoutOut(BaseModel):
    """The mind map's geometry, computed once in the backend for the screen and
    the SVG export alike (one truth for one figure, the D-53 rule)."""

    width: float
    height: float
    nodes: list[MindMapNodeOut]
    edges: list[MindMapEdgeOut]


class ArtifactOut(ArtifactSummaryOut):
    #: The tool's content (see ``app.notebooks.studio_content``).
    content: dict | None = None
    citations: list[CitationOut] = []
    withheld: list[str] = []
    exports: list[str] = []
    layout: MindMapLayoutOut | None = None


class StudioListOut(BaseModel):
    artifacts: list[ArtifactSummaryOut]
    #: Generations finished today against the daily limit; ones still running
    #: are already taken out of ``remaining``.
    usage: UsageOut


class StudioChoiceOut(BaseModel):
    slug: str
    label: str
    description: str
    instructions: str = ""
    columns: list[str] = []
    amount: int | None = None


class StudioToolOut(BaseModel):
    slug: StudioTool
    label: str
    description: str
    formats: list[StudioChoiceOut]
    templates: list[StudioChoiceOut]
    counts: list[StudioChoiceOut]
    difficulties: list[StudioChoiceOut]
    columns: bool
    exports: list[str]


class StudioCatalogOut(BaseModel):
    tools: list[StudioToolOut]
    max_columns: int
