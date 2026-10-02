"""Readable text of a web page, for a notebook source fetched by link (D-97).

A page arrives as markup built for a browser: menus, cookie banners, share
buttons, scripts, and — somewhere in the middle — the text a student meant to
add. This module keeps that text and returns it in the shape every other reader
returns, :class:`~app.knowledge.readers.ExtractedText` (one page, because a web
page has no pages), so the chunker, the search and the citation checks never
learn that the source was HTML.

**Why the standard library.** ``html.parser`` ships with Python: no C
extension, no new licence, nothing new in the supply chain of a server that
now reads pages chosen by its users. Its price is that it only tokenises — it
does not build a tree, and it does not repair broken markup — so the small tree
builder below does both, following the parts of the WHATWG algorithm that decide
*where text ends up* (implied ``</p>``, ``</li>`` and ``</td>``, end tags that
cannot reach across a table cell). Dedicated extractors such as ``trafilatura``
read boilerplate better. If extraction quality becomes the bottleneck, **this
module is the single swap point**: ``extract_html`` keeps its signature and
nothing else changes, exactly as ``app.knowledge.readers`` is for PDF.

Three rules shape what is kept:

* **What the student cannot see, the model does not read.** Text in a
  ``hidden`` or ``aria-hidden="true"`` subtree, or one an inline style hides
  (``display:none``, an empty ``clip``/``clip-path``, an off-page offset, a
  zero-size clipped box, a ``scale(0)`` — see ``_style_hides``), and text too
  small, too clear or hidden by visibility to read (``font-size:0``,
  ``color:transparent``, ``visibility:hidden``, inherited until a child sets
  them back — see ``_mark_style``), is the classic place to hide an instruction
  aimed at a model, so it is dropped. Any declaration that hides counts, not
  only the last one, and a style the reader cannot follow — past one of its
  budgets (``_MAX_STYLE_CHARS`` and the rest), or math it cannot evaluate in
  a property that hides — hides too. Text hidden by a *stylesheet* class cannot
  be seen without a CSS engine; that is why every source is framed as data, never
  instruction, further down — this is defence in depth, not the defence.
* **Chrome is dropped, content is preferred.** Navigation, page header and
  footer, sidebars, forms and embedded media go; then ``<article>`` is preferred
  when it holds the bulk of the page, then ``<main>``, then the whole body.
* **A figure is never manufactured by flattening.** ``10<sup>3</sup>`` becomes
  ``10³``, not ``103``: the number check reads figures back from this text, and
  concatenated markup would hand it a number the page never wrote.

Nothing here raises except the one honest failure: a page whose readable text is
too short to be a source — usually because it is an empty shell that JavaScript
fills in — is refused with a message that says what to do instead.
"""

from __future__ import annotations

import codecs
import itertools
import math
import re
import unicodedata
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import TypeVar

from app.domain.errors import ValidationError
from app.knowledge.chunking import looks_like_heading
from app.knowledge.readers import ExtractedText

EMPTY_PAGE_MESSAGE = (
    "A página não trouxe texto legível (talvez dependa de JavaScript). "
    "Copie o texto e cole como fonte."
)

#: Fewer letters and digits than this and the page is not a source. Counted on
#: letters and digits, not characters, so the " | " and "- " this module writes
#: cannot lift a page over the line. 200 is two or three sentences: an
#: application shell ("Ative o JavaScript…") and a cookie notice both stay
#: under it, a single real paragraph of an article clears it, and a passage
#: this short is already near the chunker's floor (``MIN_CHARS``) for
#: something worth retrieving on its own.
MIN_LEGIBLE_CHARS = 200

#: ``<article>`` wins only when it holds at least this share of the page's
#: legible text. A "leia também" strip of teaser cards is made of ``<article>``
#: elements too, and each card is a sliver of the page, where the story itself is
#: most of what the page says once the chrome is gone.
ARTICLE_MIN_SHARE = 0.25

#: How far into the bytes a ``<meta charset>`` is looked for. The HTML standard
#: prescans 1024 bytes; pages with a long ``<head>`` put it later, and reading a
#: little further costs nothing.
_SNIFF_BYTES = 4096

_VOID = frozenset(
    "area base basefont bgsound br col embed hr img input keygen link meta param "
    "source track wbr".split()
)

#: Never text for a reader: metadata, code, forms, embedded media, and the
#: landmarks that are chrome wherever they appear.
_DROPPED = frozenset(
    "head title script style noscript template iframe svg nav aside form button "
    "select textarea canvas video audio object embed noembed noframes map".split()
)

#: ARIA roles of chrome: the same landmarks as the tags above, written on a
#: ``<div>``, plus the dialogs cookie notices are built from.
_CHROME_ROLES = frozenset(
    "navigation banner contentinfo complementary search dialog alertdialog".split()
)

#: Inside one of these, ``<header>``/``<footer>`` belong to that section (an
#: article's title and byline); outside, they are the page's banner and footer.
#: The rule is the ARIA mapping of ``banner`` and ``contentinfo``.
_SECTIONING = frozenset("article aside main nav section".split())

_HEADINGS = frozenset("h1 h2 h3 h4 h5 h6".split())

#: Elements whose start and end are paragraph breaks in the text.
_BLOCKS = frozenset(
    "#root html body address article blockquote caption center dd details dialog dir "
    "div dl dt fieldset figcaption figure footer header hgroup hr legend li main menu "
    "ol p pre section summary table tbody td tfoot th thead tr ul search".split()
)

#: The HTML standard's "special" elements: an end tag for an inline element does
#: not reach past one of them. A stray ``</span>`` inside a ``<div>`` is ignored
#: rather than closing whatever encloses the div.
_SPECIAL = (
    _BLOCKS | _DROPPED | _HEADINGS | frozenset("applet marquee listing plaintext xmp".split())
)

#: Scopes, as the HTML standard defines them: an end tag only closes an element
#: it can reach without crossing one of these. Without this, a ``</div>`` inside a
#: table cell would close a hidden ``<div>`` around the table and let the text
#: after it out, where a browser keeps it hidden.
_SCOPE = frozenset("#root html table td th caption template applet marquee object".split())
_LIST_SCOPE = _SCOPE | {"ol", "ul"}
_BUTTON_SCOPE = _SCOPE | {"button"}
_TABLE_SCOPE = frozenset({"#root", "html", "table", "template"})

#: A start tag of one of these closes an open ``<p>``.
_CLOSES_P = frozenset(
    "address article aside blockquote center details dialog dir div dl fieldset "
    "figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr main menu nav ol "
    "p pre search section summary table ul li dd dt".split()
)

#: What may sit in ``<head>``; any other start tag means the body has begun.
_HEAD_CONTENT = frozenset("base link meta noscript script style template title".split())

#: A CSS comment — an unterminated one runs to the end, as in CSS. Replaced by
#: a space, never by nothing: ``display:/**/none`` is ``display: none`` to a
#: browser, but ``dis/**/play`` is two tokens and no property at all.
_CSS_COMMENT = re.compile(r"/\*.*?(?:\*/|$)", re.DOTALL)
#: A CSS escape: ``displ\61y`` is ``display`` to a browser, so it is to us.
_CSS_ESCAPE = re.compile(r"\\(?:([0-9a-f]{1,6})[ \t\n\r\f]?|(.))", re.IGNORECASE | re.DOTALL)
_IMPORTANT = re.compile(r"!\s*important$")
_CSS_NUMBER = re.compile(r"^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)([a-z%]*)$")
_CSS_FUNCTION = re.compile(r"([a-z0-9-]+)\(([^()]*)\)")
_CSS_MATH = frozenset({"calc", "min", "max", "clamp"})
#: Every CSS math function, the ones :func:`_math` evaluates and the ones it
#: does not (N-5): a value that is one of these and cannot be evaluated is
#: not a reason to keep a node it would hide.
_CSS_MATH_ALL = _CSS_MATH | frozenset(
    "round mod rem abs sign sin cos tan asin acos atan atan2 pow sqrt hypot log exp "
    "calc-size".split()
)
_MATH_CALL = re.compile(r"([a-z-]+)\(")
#: A negative length written as such — ``-9999px``, not the ``- 9999px`` of a
#: subtraction, which CSS spells with spaces around the operator.
_NEGATIVE_LITERAL = re.compile(
    r"(?:^|(?<=[(,\s*/]))(-(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?[a-z%]*)"
)
#: Absolute lengths in CSS pixels; a font-relative one at the 16 px default.
_PX_PER = {"px": 1.0, "pt": 4 / 3, "pc": 16.0, "in": 96.0, "cm": 96 / 2.54, "mm": 96 / 25.4}
_PX_PER |= {"q": 96 / 101.6, "em": 16.0, "rem": 16.0, "ex": 8.0, "ch": 8.0}
#: A viewport unit read on a 1000 px viewport: a page cannot know the reader's.
_VIEWPORT = frozenset({"vw", "vh", "vmin", "vmax", "svw", "svh", "lvw", "lvh", "dvw", "dvh"})
_PX_PER |= dict.fromkeys(_VIEWPORT, 10.0)
#: How far off the page an offset has to throw a node to hide it: past any
#: plausible layout nudge (-10px, a hanging -1em indent), well short of the
#: -9999px of the image-replacement and "off-screen" idioms.
_FAR_PX = 500.0
#: Text this small is not text a reader can read.
_TINY_FONT_PX = 2.0
#: A box this narrow, with its overflow clipped, shows nothing (the
#: ``width:1px; overflow:hidden`` of a visually-hidden label).
_SLIVER_PX = 1.0
#: Below this opacity text is not legible; 0.5 is a muted label, not a hidden one.
_INVISIBLE_OPACITY = 0.1
#: A transform that shrinks a box below this factor leaves nothing to read;
#: ``scale(0.5)`` is a small label, ``scale(0.01)`` is a dot.
_VANISHING_SCALE = 0.05
#: Budgets of the inline-style reader. A page chooses its own styles, and a
#: reader that follows ``var()`` can be made to build values far larger than
#: the page (one custom property declared thousands of times, referenced in a
#: long value) or to copy a growing scope at every node. Past any budget the
#: node is read as hiding — the direction of D-99: a page that needs more to
#: say what a declaration means is not one to trust with the benefit of doubt.
#:
#: One ``style`` attribute: its length, and how many ordinary declarations it
#: makes. Custom properties do not count here — a theme that writes its design
#: tokens inline on ``<html>`` writes a hundred of them —, only in the length.
_MAX_STYLE_CHARS = 8192
_MAX_DECLARATIONS = 64
#: Custom-property declarations in scope at a node, its ancestors' included.
#: Not a cost bound — a lookup walks the scopes of the chain and pays that to
#: the work budget — but a ceiling on how far one may walk, set past what a
#: page builder writes (a Framer page reaches 256 about 43 levels down).
_MAX_CUSTOM_PROPERTIES = 4096
#: One ``var()`` expansion: the values a declaration may take, how deeply one
#: reference may point into the next (references side by side in one value do
#: not add up — their breadth is what the work budget pays for), and the length
#: of any value it builds.
_MAX_CANDIDATES = 64
_MAX_VAR_DEPTH = 8
_MAX_VALUE_CHARS = 8192
#: The work of expanding — characters scanned and built, plus a fixed cost per
#: step — for one attribute and for the whole page. The page's budget is what
#: bounds the time a hostile page costs: past it, every later value that still
#: needs a ``var()`` expanded hides its node.
_ATTRIBUTE_WORK = 1 << 16
_DOCUMENT_WORK = 1 << 22
_STEP_WORK = 32
#: ``font-size`` keywords, in CSS pixels at the 16 px default.
_FONT_KEYWORDS = {"xx-small": 9.0, "x-small": 10.0, "small": 13.0, "medium": 16.0}
_FONT_KEYWORDS |= {"large": 18.0, "x-large": 24.0, "xx-large": 32.0, "xxx-large": 48.0}
_CSS_WIDE = frozenset({"inherit", "unset", "revert", "revert-layer"})
_COLOR_FUNCTIONS = frozenset(
    "rgb rgba hsl hsla hwb lab lch oklab oklch color color-mix light-dark".split()
)
_ASCII_WHITESPACE = re.compile(r"[ \t\n\r\f]+")
#: Invisible characters that only break words apart for search: soft hyphen,
#: zero-width space, word joiner, byte-order mark, and NUL.
_INVISIBLE = dict.fromkeys(map(ord, "\u00ad\u200b\u2060\ufeff\x00"))
_BLANK_RUN = re.compile(r"\n{3,}")

_SUPERSCRIPT = str.maketrans("0123456789+-\u2212=()", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁼⁽⁾")
_SUBSCRIPT = str.maketrans("0123456789+-\u2212=()", "₀₁₂₃₄₅₆₇₈₉₊₋₋₌₍₎")
_SCRIPTABLE = re.compile(r"[0-9+\-\u2212=()]+")
_SCRIPT_START = frozenset("0123456789+-\u2212")

_META_CHARSET = re.compile(rb"""<meta[^>]*?charset\s*=\s*["']?\s*([A-Za-z0-9._:\-]+)""", re.I)
_XML_ENCODING = re.compile(rb"""^\s*<\?xml[^>]*?encoding\s*=\s*["']([A-Za-z0-9._:\-]+)""", re.I)
_BOMS = (
    (codecs.BOM_UTF8, "utf-8"),
    (codecs.BOM_UTF16_LE, "utf-16-le"),
    (codecs.BOM_UTF16_BE, "utf-16-be"),
)

#: Short words a heading may carry and still be safe to write in capitals.
_FUNCTION_WORDS = frozenset(
    "a à ao aos as às da das de do dos e em na nas no nos o os ou se um "  # pt
    "an at by in of on or to".split()  # en
)
_WORD_SPLIT = re.compile(r"[\s\-‐–—]+")
_WORD_EDGE = "()[]{}\"'“”‘’«»¿?¡!,.;:"


# --- public -----------------------------------------------------------------


def extract_html(data: bytes | str, charset: str | None = None) -> tuple[str | None, ExtractedText]:
    """The page's title and readable text.

    ``charset`` is the one the server declared in ``Content-Type``, if any. The
    title is the ``<title>`` or, without one, the first visible ``<h1>``; ``None``
    when the page has neither.

    Raises:
        ValidationError: the page has too little readable text to be a source
            (:data:`EMPTY_PAGE_MESSAGE`).
    """
    markup = data if isinstance(data, str) else decode_html(data, charset)
    root = _parse(markup)
    text = _content(root)
    if _legible(text) < MIN_LEGIBLE_CHARS:
        raise ValidationError(EMPTY_PAGE_MESSAGE)
    return _title(root), ExtractedText(pages=[text])


def decode_html(data: bytes, charset: str | None = None) -> str:
    """Bytes of a page as text: byte-order mark, then the declared charset, then
    ``<meta charset>`` (or the XML declaration), then UTF-8.

    That is the browser's order. A byte that does not decode becomes U+FFFD
    rather than failing the page: one bad byte in a footer is not a reason to
    refuse the article above it.
    """
    for bom, encoding in _BOMS:
        if data.startswith(bom):
            return data[len(bom) :].decode(encoding, errors="replace")
    for label, from_markup in ((charset, False), (_declared_charset(data), True)):
        codec = _codec(label, from_markup)
        if codec is None:
            continue
        try:
            return data.decode(codec, errors="replace")
        except LookupError:  # a codec that exists but is not a text encoding
            continue
    return data.decode("utf-8", errors="replace")


# --- decoding ---------------------------------------------------------------


def _declared_charset(data: bytes) -> str | None:
    head = data[:_SNIFF_BYTES]
    match = _XML_ENCODING.match(head) or _META_CHARSET.search(head)
    return match.group(1).decode("ascii") if match else None


def _codec(label: str | None, from_markup: bool) -> str | None:
    """A Python codec for a charset label, the way a browser maps it."""
    if not label:
        return None
    try:
        name = codecs.lookup(label.strip()).name
    except LookupError:
        return None
    if name == "utf-7":
        # Browsers refuse it: it turns plain ASCII into markup the page never
        # showed anyone.
        return None
    if name in {"latin-1", "iso8859-1", "ascii"}:
        # The web reads "iso-8859-1" and "us-ascii" as windows-1252, which is
        # what such pages are really written in (curly quotes, en dashes).
        return "cp1252"
    if from_markup and name.startswith("utf-16"):
        # A document whose <meta> could be read as ASCII is not UTF-16.
        return "utf-8"
    return name


# --- tree -------------------------------------------------------------------


@dataclass(eq=False)
class _Node:
    tag: str
    attrs: dict[str, str]
    children: list[_Node | str] = field(default_factory=list)
    #: Holds a table, a heading or a sectioning element somewhere below — what
    #: makes a table one used for layout (:func:`_is_data_table`).
    structured: bool = False
    #: Its inline style takes it and everything under it out of view
    #: (:func:`_mark_style`).
    concealed: bool = False
    #: Its own text cannot be read — an effective font size of about nothing,
    #: or ink with nothing to paint it —, though a child may set it back.
    mute: bool = False


#: Groups of tags the builder asks about, kept as positions like a tag is.
_CATEGORIES: dict[str, frozenset[str]] = {
    "@scope": _SCOPE,
    "@list": _LIST_SCOPE,
    "@button": _BUTTON_SCOPE,
    "@table": _TABLE_SCOPE,
    "@special": _SPECIAL,
    # What stops the search for an open <li> (or <dd>/<dt>) to close.
    "@li": _SPECIAL - {"address", "div", "p", "li"},
    "@dd": _SPECIAL - {"address", "div", "p", "dd", "dt"},
    "@foreign": frozenset({"svg", "math"}),
}
_KEYS: dict[str, tuple[str, ...]] = {}


def _keys(tag: str) -> tuple[str, ...]:
    keys = _KEYS.get(tag)
    if keys is None:
        keys = (tag, *(name for name, members in _CATEGORIES.items() if tag in members))
        _KEYS[tag] = keys
    return keys


class _OpenElements:
    """The stack of open elements, indexed by what the builder asks of it.

    Every question is "is an X open, nearer than any Y?". Scanning the stack
    answers it in time proportional to its depth, and broken or hostile markup
    can leave a hundred thousand tags open — a page that would then take
    minutes to read. Each tag and each category keeps the positions where it is
    open, so the answer is one comparison, and each element is pushed and
    popped once.
    """

    def __init__(self, root: _Node) -> None:
        self.nodes: list[_Node] = []
        self._at: dict[str, list[int]] = {}
        self.push(root)

    @property
    def top(self) -> _Node:
        return self.nodes[-1]

    def push(self, node: _Node) -> None:
        for key in _keys(node.tag):
            self._at.setdefault(key, []).append(len(self.nodes))
        self.nodes.append(node)

    def truncate(self, index: int | None) -> None:
        """Close the element at ``index`` and everything opened inside it."""
        if index is None or index < 1:  # the root is never closed
            return
        while len(self.nodes) > index:
            node = self.nodes.pop()
            for key in _keys(node.tag):
                self._at[key].pop()

    def last(self, names: set[str] | frozenset[str]) -> int:
        """Position of the nearest open element named in ``names``; -1 if none."""
        return max((self._at[name][-1] for name in names if self._at.get(name)), default=-1)

    def nearest(self, names: set[str], boundary: str) -> int | None:
        """The nearest open ``names`` element, if no ``boundary`` element is
        nearer. An element that is both — a ``</td>`` looking for its ``<td>``
        in table scope — is found."""
        target = self.last(names)
        if target < 0:
            return None
        limit = self._at[boundary][-1] if self._at.get(boundary) else -1
        return target if target >= limit else None


class _TreeBuilder(HTMLParser):
    """Tokens into a tree, closing what HTML leaves implied.

    ``HTMLParser`` reports tags as written; a browser does more. The subset
    reproduced here is the one that moves text between elements — and so
    between visible and hidden, or into and out of ``<article>``.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = _Node("#root", {})
        self.open = _OpenElements(self.root)
        self._body_seen = False

    # tokens

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._start(tag, attrs, self_closing=False)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        # In HTML, "<div/>" opens a div: the slash only closes void elements
        # and SVG/MathML ones. Closing it here would end a hidden <div/> at once
        # and let out the text a browser hides inside it.
        self._start(tag, attrs, self_closing=self.open.last({"@foreign"}) >= 0)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"html", "body"}:
            return  # text after </body> still lands in the body in a browser
        if tag == "br":
            self._start("br", [], self_closing=False)  # "</br>" is read as "<br>"
            return
        if tag in _VOID:
            return
        if tag in {"svg", "math"}:
            self.open.truncate(self.open.nearest({tag}, "#root"))
        elif tag in _SPECIAL:
            if tag == "li":
                scope = "@list"
            elif tag == "p":
                scope = "@button"
            elif tag in {"table", "tbody", "thead", "tfoot", "tr", "td", "th"}:
                scope = "@table"
            else:
                scope = "@scope"
            self.open.truncate(self.open.nearest({tag}, scope))
        else:
            # Any other end tag closes the nearest element of its name, unless a
            # special element stands in between: a stray </span> inside a <div>
            # does not close what encloses the div.
            self.open.truncate(self.open.nearest({tag}, "@special"))

    def handle_data(self, data: str) -> None:
        if self.open.top.tag == "head" and data.strip():
            self.open.truncate(len(self.open.nodes) - 1)  # text means the body has begun
        children = self.open.top.children
        if children and isinstance(children[-1], str):
            children[-1] += data
        else:
            children.append(data)

    # structure

    def _start(self, tag: str, raw_attrs: list[tuple[str, str | None]], self_closing: bool) -> None:
        if tag in {"html", "body"} and self.open.last({tag}) >= 0:
            return  # a second <body> merges into the first; it opens nothing
        if tag == "head" and (self._body_seen or self.open.top.tag not in {"#root", "html"}):
            return  # a <head> inside the body is ignored, as a browser ignores it
        self._close_implied(tag)
        self._body_seen = self._body_seen or tag == "body"
        attrs: dict[str, str] = {}
        for name, value in raw_attrs:
            attrs.setdefault(name, value or "")  # the first of a repeated attribute wins
        node = _Node(tag, attrs)
        self.open.top.children.append(node)
        if tag not in _VOID and not self_closing:
            self.open.push(node)

    def _close_implied(self, tag: str) -> None:
        if tag not in _HEAD_CONTENT:
            self.open.truncate(self.open.nearest({"head"}, "#root"))
        if tag in _HEADINGS and self.open.top.tag in _HEADINGS:
            self.open.truncate(len(self.open.nodes) - 1)
        if tag == "li":
            self.open.truncate(self.open.nearest({"li"}, "@li"))
        elif tag in {"dd", "dt"}:
            self.open.truncate(self.open.nearest({"dd", "dt"}, "@dd"))
        elif tag in {"td", "th"}:
            self.open.truncate(self.open.nearest({"td", "th"}, "@table"))
            if self.open.top.tag in {"table", "tbody", "thead", "tfoot"}:
                # A cell without a row gets one, as a browser gives it; the
                # table reader walks rows.
                row = _Node("tr", {})
                self.open.top.children.append(row)
                self.open.push(row)
        elif tag == "tr":
            self.open.truncate(self.open.nearest({"tr"}, "@table"))
        elif tag in {"thead", "tbody", "tfoot"}:
            self.open.truncate(self.open.nearest({"thead", "tbody", "tfoot"}, "@table"))
        if tag in _CLOSES_P:
            self.open.truncate(self.open.nearest({"p"}, "@button"))


def _parse(markup: str) -> _Node:
    builder = _TreeBuilder()
    builder.feed(markup)
    builder.close()
    root = builder.root
    _mark_structure(root)
    _mark_style(root)
    return root


_STRUCTURE = frozenset({"table"}) | _HEADINGS | _SECTIONING


def _mark_structure(root: _Node) -> None:
    """Set ``structured`` bottom-up in one pass, so that deciding what each of
    a thousand nested tables is does not walk the page a thousand times."""
    order: list[_Node] = []
    stack = [root]
    while stack:
        node = stack.pop()
        order.append(node)
        stack.extend(child for child in node.children if isinstance(child, _Node))
    for node in reversed(order):  # children before their parent
        node.structured = any(
            isinstance(child, _Node) and (child.tag in _STRUCTURE or child.structured)
            for child in node.children
        )


# --- what is visible --------------------------------------------------------


def _skipped(node: _Node, sectioning: bool) -> bool:
    """True when ``node`` and everything under it is not text for a reader."""
    if node.tag in _DROPPED:
        return True
    if node.tag in {"header", "footer"} and not sectioning:
        return True
    role = node.attrs.get("role", "").split()
    if role and role[0].lower() in _CHROME_ROLES:
        return True
    return _hidden(node)


def _hidden(node: _Node) -> bool:
    attrs = node.attrs
    if "hidden" in attrs:
        return True
    if attrs.get("aria-hidden", "").strip().lower() == "true":
        return True
    if node.tag == "dialog" and "open" not in attrs:
        return True
    return node.concealed


# --- inline style -----------------------------------------------------------
#
# **A node is hidden when any declaration of its inline style hides it,**
# whatever comes before or after that declaration. A browser drops a
# declaration whose value it does not accept and keeps the one before, so
# reading "the last one wins" let ``display:none;display:bogus`` through as
# visible. Knowing which values a browser accepts would mean re-implementing
# its grammar, and any disagreement — a unitless ``left:5`` is invalid in
# standards mode and valid in quirks mode — reopens the hole. The value a
# browser ends up applying is always one of the declared ones, so checking
# them all cannot miss it: the rule has no parse to get wrong. Its price is a
# style that hides a node and then shows it again in the same attribute
# (``display:none;display:block``), which is rare there, and is dropped.
#
# What *rescues* text (a shadow, a stroke, a background clipped to the glyphs)
# counts the other way round: only when every declaration of it rescues.


@dataclass(frozen=True, eq=False)
class _Scope:
    """The custom properties in scope at a node: its own, then its ancestors'
    through ``parent``.

    Shared, never copied. A child that declares one more links to its parent's
    scope instead of copying it, so a page of nested declarations costs what
    it weighs and not its square (N-3); :data:`_MAX_CUSTOM_PROPERTIES` bounds
    how far a lookup walks.

    A value may be empty — ``--off: ;`` is a valid custom property, and the
    "space toggle" ``display: var(--off) none`` reads ``none`` (B-1). A name
    declared ``initial`` is here with no value at all (the guaranteed-invalid
    value: ``var()`` takes its fallback), and one declared ``inherit`` —
    ``unset``, ``revert`` and ``revert-layer`` too, custom properties being
    inherited — is in ``inherits`` and adds its parent's values to its own.
    """

    own: dict[str, tuple[str, ...]] = field(default_factory=dict)
    parent: _Scope | None = None
    #: Declarations here and above — a name declared again counts again.
    size: int = 0
    #: Scopes in the chain, this one included: what a lookup may walk.
    links: int = 0
    #: Names this scope hands on from its parent as well as its own values.
    inherits: frozenset[str] = frozenset()

    def get(self, name: str) -> tuple[str, ...]:
        found: list[str] = []
        scope: _Scope | None = self
        while scope is not None:
            values = scope.own.get(name)
            if values is not None:
                if name not in scope.inherits:
                    return tuple(found) + values if found else values
                found += values
            scope = scope.parent
        return tuple(found)


_NO_SCOPE = _Scope()


class _Unfollowable(Exception):
    """A ``var()`` expansion past one of the reader's budgets."""


class _Budget:
    """What expanding ``var()`` may still cost, on this attribute and on the
    page (:data:`_ATTRIBUTE_WORK`, :data:`_DOCUMENT_WORK`)."""

    def __init__(self, document: int | None = None) -> None:
        self.document = _DOCUMENT_WORK if document is None else document
        self.attribute = _ATTRIBUTE_WORK

    def start_attribute(self) -> None:
        self.attribute = _ATTRIBUTE_WORK

    def spend(self, amount: int) -> None:
        """Take ``amount`` plus the cost of a step; past either budget, raise."""
        amount += _STEP_WORK
        self.attribute -= amount
        self.document -= amount
        if self.attribute < 0 or self.document < 0:
            raise _Unfollowable


@dataclass(frozen=True)
class _Inherited:
    """What an element's inline style hands down to its children."""

    scope: _Scope = _NO_SCOPE
    font_px: float = 16.0
    root_px: float = 16.0
    scale: float = 1.0
    opacity: float = 1.0
    ink_clear: bool = False
    #: ``-webkit-text-fill-color``: ``True`` clear, ``False`` opaque, ``None``
    #: unset (the fill is ``color``).
    fill: bool | None = None
    shadow: bool = False
    stroke_width: bool = False
    stroke_color: bool = False
    #: An ancestor paints its background through the glyphs
    #: (``background-clip: text``, the gradient-heading idiom).
    backdrop: bool = False
    visible: bool = True


def _mark_style(root: _Node) -> None:
    """Read every inline style once, top-down, into ``concealed`` and ``mute``.

    Top-down because a font size, a colour, an opacity and a custom property
    reach the children: whether a node's text can be read depends on its
    ancestors, and :func:`_render` may start at an ``<article>`` deep inside
    the page. ``concealed`` takes the subtree away (nothing a child declares
    brings back what ``display:none`` or a clipped box removed); ``mute``
    takes only the element's own text, because a child may set a readable font
    size or colour again — the ``font-size:0`` container of an inline-block
    layout holds columns that are perfectly legible.

    A style this reader cannot follow — past one of its budgets, or one that
    trips it in a way nobody foresaw — hides its node: the page is still read,
    and what could not be judged is not handed to the model (D-99).
    """
    budget = _Budget()
    stack: list[tuple[_Node, _Inherited]] = [(root, _Inherited())]
    while stack:
        node, outer = stack.pop()
        style = node.attrs.get("style")
        inner = outer
        if style:
            try:
                css, scope, ambiguous = _declarations(style, outer.scope, budget)
                inner = _inherit(node.tag, css, scope, outer)
                node.concealed = ambiguous or _conceals(css) or inner.opacity < _INVISIBLE_OPACITY
            except Exception:  # a style the reader trips on hides its node, never the page
                inner = outer
                node.concealed = True
        node.mute = _unreadable(inner)
        # Reversed onto the stack, so nodes are read in document order: once
        # the page's budget is spent, what hides is the end of the page.
        stack.extend(
            (child, inner) for child in reversed(node.children) if isinstance(child, _Node)
        )


def _style_hides(style: str) -> bool:
    """Whether an inline ``style`` takes its node, and its subtree, out of view.

    Covers ``display``, ``visibility`` and ``content-visibility``; an opacity
    too low to read (``opacity``, ``filter: opacity()``); a ``clip`` or
    ``clip-path`` with no area left; an offset that throws the node far off
    the page (``left``/``top`` of any positioned node, ``inset``,
    ``text-indent``, a negative ``margin``, a ``translate``); a zero-width or
    zero-height box whose overflow is clipped; and a transform, ``scale`` or
    ``zoom`` that shrinks it to nothing. Text too small or too faint to read
    is decided per text by :func:`_mark_style`, since a child can set it back.
    Written for the inline attribute only — the stylesheet case is out of
    reach without a CSS engine, and the defence there is that a source is
    data, never instruction (D-97). Thresholds err towards keeping text: a
    muted ``opacity:0.5``, a ``-1em`` hanging indent or the ``translateY(-100%)``
    of a tooltip stays. A style the reader cannot follow hides (D-99).
    """
    try:
        css, _, ambiguous = _declarations(style, _NO_SCOPE, _Budget())
        if ambiguous or _conceals(css):
            return True
        return any(v in ("hidden", "collapse") for v in css.get("visibility", ()))
    except Exception:  # the same fail-safe as :func:`_mark_style`
        return True


def _declarations(
    style: str, scope: _Scope, budget: _Budget
) -> tuple[dict[str, list[str]], _Scope, bool]:
    """Every value of every declaration of an inline style, lower-cased.

    Returns the values per property (``var()`` references expanded against
    ``scope`` and the style's own custom properties; a value that expands to
    nothing is no value), the scope for the children, and whether the style
    is *ambiguous* — which the caller reads as hiding: longer than
    :data:`_MAX_STYLE_CHARS`, more than :data:`_MAX_DECLARATIONS` ordinary
    declarations, more than :data:`_MAX_CUSTOM_PROPERTIES` custom ones in
    scope, or an expansion past the budgets of :func:`_resolve`.
    ``!important`` changes nothing: every value is looked at. A custom
    property may be empty, an ordinary declaration may not (B-1).
    """
    if len(style) > _MAX_STYLE_CHARS:
        return {}, scope, True
    text = _CSS_ESCAPE.sub(_unescape, _CSS_COMMENT.sub(" ", style)).lower()
    declared: list[tuple[str, str]] = []
    own: dict[str, list[str]] = {}
    for declaration in text.split(";"):
        name, colon, value = declaration.partition(":")
        name, value = name.strip(), " ".join(value.split())
        value = _IMPORTANT.sub("", value).strip()
        if not colon or not name:
            continue
        if name.startswith("--"):
            own.setdefault(name, []).append(value)
        elif value:
            declared.append((name, value))
    if len(declared) > _MAX_DECLARATIONS:
        return {}, scope, True
    inner = scope
    if own:
        size = scope.size + sum(len(values) for values in own.values())
        if size > _MAX_CUSTOM_PROPERTIES:
            return {}, scope, True
        own_scope = {
            name: tuple(dict.fromkeys(v for v in values if v not in _CSS_WIDE and v != "initial"))
            for name, values in own.items()
        }
        inherits = frozenset(
            name for name, values in own.items() if any(v in _CSS_WIDE for v in values)
        )
        inner = _Scope(own_scope, scope, size, scope.links + 1, inherits)
    budget.start_attribute()
    css: dict[str, list[str]] = {}
    for name, value in declared:
        try:
            resolved = _resolve(value, inner, budget)
        except _Unfollowable:
            return {}, scope, True
        # ``var(--x,)`` expands to nothing, which a browser treats as invalid
        # at computed-value time: it is no value, not an empty one (N-2).
        values = [candidate for raw in resolved if (candidate := " ".join(raw.split()))]
        if values:
            css.setdefault(name, []).extend(values)
    return css, inner, False


def _unescape(match: re.Match[str]) -> str:
    hexadecimal, char = match.groups()
    if hexadecimal is None:
        return char
    code = int(hexadecimal, 16)
    return "\ufffd" if code == 0 or code > 0x10FFFF or 0xD800 <= code <= 0xDFFF else chr(code)


_VAR_CALL = re.compile(r"(?<![a-z0-9_-])var\(")


def _resolve(value: str, scope: _Scope, budget: _Budget, depth: int = 0) -> list[str]:
    """``value`` with each ``var()`` replaced by every value it may take — the
    custom property's declared values and its fallback. A reference with
    neither makes the declaration invalid, as in a browser (no value).

    Each value a reference may take is expanded on its own, one level deeper,
    before it is spliced in, so ``depth`` is how deeply one reference points
    into the next, never how many stand side by side (N-4). Nothing is built
    before it is known to fit: the number of values (:data:`_MAX_CANDIDATES`)
    and the longest one (:data:`_MAX_VALUE_CHARS`) are counted from the parts
    first, and every scan and every build is paid from ``budget`` (N-1).

    Raises:
        _Unfollowable: past any of those, or deeper than :data:`_MAX_VAR_DEPTH`.
    """
    if "var(" not in value:
        return [value]
    budget.spend(len(value))
    segments: list[list[str]] = []
    count = 1
    longest = 0
    position = 0
    while (call := _VAR_CALL.search(value, position)) is not None:
        if depth >= _MAX_VAR_DEPTH:
            raise _Unfollowable
        end, inner = _call_body(value, call.end())
        name, comma, fallback = inner.partition(",")
        values = scope.get(name.strip())
        budget.spend(scope.links + len(values))
        options = list(values)
        if comma:
            options.append(fallback.strip())
        alternatives: list[str] = []
        for option in options:
            alternatives += _resolve(option, scope, budget, depth + 1)
            if len(alternatives) > _MAX_CANDIDATES:
                raise _Unfollowable
        if not alternatives:
            return []  # a reference with no value: the declaration has none
        literal = value[position : call.start()]
        segments += [[literal], alternatives]
        count *= len(alternatives)
        longest += len(literal) + max(map(len, alternatives))
        if count > _MAX_CANDIDATES or longest > _MAX_VALUE_CHARS:
            raise _Unfollowable
        position = end
    tail = value[position:]
    segments.append([tail])
    longest += len(tail)
    if longest > _MAX_VALUE_CHARS:
        raise _Unfollowable
    budget.spend(count * longest)
    return ["".join(parts) for parts in itertools.product(*segments)]


def _call_body(text: str, start: int) -> tuple[int, str]:
    """The inside of a function call opened just before ``start``, and the
    index past its closing parenthesis (the end of ``text`` when unclosed)."""
    depth = 1
    for index in range(start, len(text)):
        if text[index] == "(":
            depth += 1
        elif text[index] == ")":
            depth -= 1
            if depth == 0:
                return index + 1, text[start:index]
    return len(text), text[start:]


def _conceals(css: dict[str, list[str]]) -> bool:
    """Whether any declaration takes the node and its subtree out of view."""

    def values(*names: str) -> list[str]:
        return [value for name in names for value in css.get(name, ())]

    if "none" in values("display"):
        return True
    if "hidden" in values("content-visibility"):
        return True
    if _own_opacity(css) < _INVISIBLE_OPACITY:
        return True
    positions = set(values("position"))
    if positions & {"absolute", "fixed"} and any(_empty_rect(v) for v in values("clip")):
        return True  # ``clip`` applies to an absolutely positioned box only
    if any(_empty_clip_path(v) for v in values("clip-path", "-webkit-clip-path")):
        return True
    # ``left``/``top`` move any box that is not ``static``: a relative or
    # sticky one is thrown off the page as surely as an absolute one.
    offsets = values("left", "top", "inset-inline-start", "inset-block-start")
    offsets += _starts(values("inset"))
    if positions & {"absolute", "fixed", "relative", "sticky"} and any(
        _far_negative(v) for v in offsets
    ):
        return True
    if any(_far_negative(_first(v)) for v in values("text-indent")):
        return True
    # A margin percentage is of the container's width: ``margin-left:-100%``
    # is how the holy-grail layout places a visible sidebar. Only a length.
    margins = values("margin-left", "margin-top", "margin-inline-start", "margin-block-start")
    margins += _starts(values("margin"))
    if any(_far_negative(v, percent=False) for v in margins):
        return True
    clip = ("hidden", "clip")
    overflow = values("overflow")
    clipped_x = any(v in clip for v in values("overflow-x")) or any(
        _first(v) in clip for v in overflow
    )
    clipped_y = any(v in clip for v in values("overflow-y")) or any(
        _last(v) in clip for v in overflow
    )
    if clipped_x and any(_sliver(v) for v in values("width", "max-width")):
        return True
    if clipped_y and any(_sliver(v) for v in values("height", "max-height")):
        return True
    if _scale_factor(css) < _VANISHING_SCALE:
        return True
    # A translation percentage is of the element's own size:
    # ``translateY(-100%)`` puts a tooltip just above its anchor. Only a length.
    return any(_far_negative(v, percent=False) for v in _translations(css))


def _first(value: str) -> str:
    """The first word of a value; ``""`` for a blank one."""
    words = value.split()
    return words[0] if words else ""


def _last(value: str) -> str:
    words = value.split()
    return words[-1] if words else ""


def _starts(shorthands: list[str]) -> list[str]:
    """The top and left of box shorthands (``inset``, ``margin``)."""
    starts: list[str] = []
    for value in shorthands:
        sides = _box_sides(_split_top(value, " "))
        if len(sides) == 4:
            starts += [sides[0], sides[3]]
    return starts


def _inherit(tag: str, css: dict[str, list[str]], scope: _Scope, outer: _Inherited) -> _Inherited:
    """What an element with these declarations hands to its children."""
    font = outer.font_px
    sizes = css.get("font-size", []) + [
        size for value in css.get("font", ()) if (size := _font_shorthand_size(value))
    ]
    if sizes:
        font = min(_font_px(value, outer.font_px, outer.root_px) for value in sizes)

    ink_clear = _clear(css.get("color"), outer.ink_clear)
    fill = outer.fill
    fills = css.get("-webkit-text-fill-color")
    if fills:
        if all(value == "currentcolor" for value in fills):
            fill = None
        else:
            fill = _clear(fills, outer.fill)

    shadow = outer.shadow
    shadows = [value for value in css.get("text-shadow", ()) if value not in _CSS_WIDE]
    if shadows:
        shadow = all(_shadow_paints(value) for value in shadows)

    stroke_width, stroke_color = outer.stroke_width, outer.stroke_color
    for value in css.get("-webkit-text-stroke", ()):
        parts = _split_top(value, " ")
        widths = [_stroke_px(part) for part in parts]
        stroke_width = any(width is not None and width > 0 for width in widths)
        colors = [part for part, width in zip(parts, widths, strict=True) if width is None]
        stroke_color = bool(colors) and all(_visible_color(part) for part in colors)
    widths = [_stroke_px(value) for value in css.get("-webkit-text-stroke-width", ())]
    if widths:
        stroke_width = all(width is not None and width > 0 for width in widths)
    stroke_colors = css.get("-webkit-text-stroke-color")
    if stroke_colors:
        stroke_color = all(_visible_color(value) for value in stroke_colors)

    clips = css.get("background-clip", []) + css.get("-webkit-background-clip", [])
    backdrop = outer.backdrop or (bool(clips) and all("text" in value for value in clips))

    visible = outer.visible
    visibilities = css.get("visibility", ())
    if any(v in ("hidden", "collapse") for v in visibilities):
        visible = False
    elif any(v in ("visible", "initial") for v in visibilities):
        visible = True

    return _Inherited(
        scope=scope,
        font_px=font,
        root_px=font if tag == "html" else outer.root_px,
        scale=outer.scale * _scale_factor(css),
        opacity=outer.opacity * _own_opacity(css),
        ink_clear=ink_clear,
        fill=fill,
        shadow=shadow,
        stroke_width=stroke_width,
        stroke_color=stroke_color,
        backdrop=backdrop,
        visible=visible,
    )


def _unreadable(state: _Inherited) -> bool:
    """Text too small to read, drawn in ink with nothing to paint it, or not visible."""
    if not state.visible:
        return True
    if state.font_px * state.scale < _TINY_FONT_PX:
        return True
    clear = state.ink_clear if state.fill is None else state.fill
    painted = state.shadow or (state.stroke_width and state.stroke_color) or state.backdrop
    return clear and not painted


def _clear(values: list[str] | None, inherited: bool | None) -> bool | None:
    """Whether a colour property leaves the text clear: any clear value makes
    it so; all opaque values make it opaque; otherwise it stays as inherited
    (``inherit``, ``currentcolor``, a value this module cannot read)."""
    if not values:
        return inherited
    alphas = [_alpha(value) for value in values]
    if any(alpha is not None and alpha < _INVISIBLE_OPACITY for alpha in alphas):
        return True
    if all(alpha is not None for alpha in alphas):
        return False
    return inherited


def _alpha(value: str) -> float | None:
    """A colour's alpha, 0 to 1; ``None`` for ``currentcolor``, a CSS-wide
    keyword or a value this module cannot read."""
    value = value.strip()
    if value == "transparent":
        return 0.0
    if value == "currentcolor" or value in _CSS_WIDE:
        return None
    if value.startswith("#"):
        digits = value[1:]
        if not re.fullmatch(r"[0-9a-f]+", digits):
            return None
        if len(digits) == 4:
            return int(digits[3] * 2, 16) / 255
        if len(digits) == 8:
            return int(digits[6:], 16) / 255
        return 1.0 if len(digits) in (3, 6) else None
    match = _CSS_FUNCTION.fullmatch(value)
    if match is not None:
        name, args = match.groups()
        if name not in _COLOR_FUNCTIONS:
            return None
        if "/" in args:
            return _alpha_channel(args.rsplit("/", 1)[1])
        parts = args.split(",")
        if name in ("rgb", "rgba", "hsl", "hsla") and len(parts) == 4:
            return _alpha_channel(parts[3])
        return 1.0
    return 1.0 if re.fullmatch(r"[a-z]+", value) else None  # a named colour


def _alpha_channel(value: str) -> float | None:
    value = value.strip()
    if value == "none":
        return 0.0
    alpha = _fraction(value)
    return None if alpha is None else min(max(alpha, 0.0), 1.0)


def _visible_color(value: str) -> bool:
    alpha = _alpha(value)
    return alpha is not None and alpha >= _INVISIBLE_OPACITY


def _shadow_paints(value: str) -> bool:
    """A ``text-shadow`` that draws the glyphs in a colour of its own. One in
    ``currentcolor`` (no colour given) is as clear as the text it shadows."""
    if value == "none":
        return False
    for shadow in _split_top(value, ","):
        colors = [part for part in _split_top(shadow, " ") if _number(part) is None]
        if any(_visible_color(color) for color in colors):
            return True
    return False


def _stroke_px(value: str) -> float | None:
    keyword = {"thin": 1.0, "medium": 3.0, "thick": 5.0}.get(value)
    return keyword if keyword is not None else _px(value)


def _font_shorthand_size(value: str) -> str | None:
    """The size in a ``font`` shorthand: ``0/0 a`` → ``0``, ``bold 12px/1.5
    serif`` → ``12px``; ``None`` for a system font (``caption``)."""
    size = None
    for token in re.sub(r"\s*/\s*", "/", value).split():
        if token.startswith(("'", '"')) or "," in token:
            break  # the family list has begun
        head = token.split("/", 1)[0]
        parsed = _number(head)
        is_size = parsed is not None and (parsed[1] != "" or parsed[0] == 0)
        if is_size or head in _FONT_KEYWORDS or head in ("smaller", "larger"):
            size = head
        elif head.startswith(tuple(f"{name}(" for name in _CSS_MATH)):
            size = head
        if "/" in token:
            break
    return size


def _font_px(value: str, parent: float, root: float) -> float:
    """A ``font-size`` in CSS pixels, given the parent's and the root's. What
    cannot be read — or is invalid, like a negative size — is the parent's,
    which is what a browser does with a declaration it drops."""
    if value in _FONT_KEYWORDS:
        return _FONT_KEYWORDS[value]
    if value == "initial":
        return 16.0
    if value == "smaller":
        return parent / 1.2
    if value == "larger":
        return parent * 1.2
    px = _px(value, em=parent, rem=root, percent_of=parent)
    return parent if px is None or px < 0 else px


def _number(value: str | None) -> tuple[float, str] | None:
    """A CSS number and its unit (``""`` for none), or ``None``."""
    match = _CSS_NUMBER.match(value.strip()) if value else None
    return (float(match.group(1)), match.group(2)) if match else None


def _px(
    value: str | None,
    *,
    em: float = 16.0,
    rem: float = 16.0,
    percent_of: float | None = None,
) -> float | None:
    """A length in CSS pixels; ``None`` for a keyword or a unit with no fixed
    size. A bare ``0`` is a length; a percentage only when ``percent_of``
    gives it a base. ``calc()``, ``min()``, ``max()`` and ``clamp()`` are
    evaluated, so ``calc(-9999px)`` is not a way around ``-9999px``."""
    if not value:
        return None

    def unit_px(number: float, unit: str) -> float | None:
        if unit == "":
            return number if number == 0 else None
        if unit == "%":
            return number * percent_of / 100 if percent_of is not None else None
        if unit == "em":
            return number * em
        if unit == "rem":
            return number * rem
        if unit in ("ex", "ch"):
            return number * em / 2
        per = _PX_PER.get(unit)
        return number * per if per is not None else None

    parsed = _number(value)
    if parsed is not None:
        return unit_px(*parsed)
    return _math(value, unit_px)


def _fraction(value: str | None) -> float | None:
    """A number or a percentage as a plain number (``50%`` → 0.5)."""
    parsed = _number(value)
    if parsed is not None:
        number, unit = parsed
        return number / 100 if unit == "%" else number if unit == "" else None
    return _math(value or "", lambda number, unit: number / 100 if unit == "%" else None, True)


_MATH_TOKEN = re.compile(
    r"\s*(?:((?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)([a-z%]*)|([a-z-]+)\(|([-+*/(),]))"
)
_MATH_MAX_TOKENS = 200
_MATH_MAX_NESTING = 64


def _math(
    value: str, unit_px: Callable[[float, str], float | None], unitless: bool = False
) -> float | None:
    """A ``calc()``, ``min()``, ``max()`` or ``clamp()`` evaluated, with each
    dimension converted by ``unit_px``; ``None`` for anything else. The result
    is a length unless ``unitless``, where it is a plain number."""
    if not value.startswith(tuple(f"{name}(" for name in _CSS_MATH)):
        return None
    if value.count("(") > _MATH_MAX_NESTING:
        return None
    tokens: list[tuple[float, bool] | str] = []
    position = 0
    while position < len(value):
        match = _MATH_TOKEN.match(value, position)
        if match is None:
            if value[position:].strip():
                return None
            break
        position = match.end()
        number, unit, function, symbol = match.groups()
        if number is not None:
            if unit:
                converted = unit_px(float(number), unit)
                if converted is None:
                    return None
                tokens.append((converted, not unitless))
            else:
                tokens.append((float(number), False))
        elif function is not None:
            if function not in _CSS_MATH:
                return None
            tokens.append(function + "(")
        else:
            tokens.append(symbol)
        if len(tokens) > _MATH_MAX_TOKENS:
            return None
    parser = _MathParser(tokens)
    try:
        result, is_length = parser.sum()
    except (ValueError, IndexError, ZeroDivisionError):
        return None
    if parser.at != len(tokens):
        return None
    if unitless:
        return None if is_length else result
    return result if is_length or result == 0 else None


class _MathParser:
    """Recursive descent over :func:`_math`'s tokens; a value is a number and
    whether it is a length."""

    def __init__(self, tokens: list[tuple[float, bool] | str]) -> None:
        self.tokens = tokens
        self.at = 0

    def _peek(self) -> tuple[float, bool] | str | None:
        return self.tokens[self.at] if self.at < len(self.tokens) else None

    def _take(self, expected: str | None = None) -> tuple[float, bool] | str:
        token = self.tokens[self.at]
        if expected is not None and token != expected:
            raise ValueError(token)
        self.at += 1
        return token

    def sum(self) -> tuple[float, bool]:
        value, length = self._product()
        while self._peek() in ("+", "-"):
            sign = self._take()
            other, other_length = self._product()
            value = value + other if sign == "+" else value - other
            length = length or other_length
        return value, length

    def _product(self) -> tuple[float, bool]:
        value, length = self._factor()
        while self._peek() in ("*", "/"):
            operator = self._take()
            other, other_length = self._factor()
            value = value * other if operator == "*" else value / other
            length = length or other_length
        return value, length

    def _factor(self) -> tuple[float, bool]:
        token = self._take()
        if isinstance(token, tuple):
            return token
        if token == "-":
            value, length = self._factor()
            return -value, length
        if token == "+":
            return self._factor()
        if token in ("(", "calc("):
            value = self.sum()
            self._take(")")
            return value
        if token in ("min(", "max(", "clamp("):
            args = [self.sum()]
            while self._peek() == ",":
                self._take()
                args.append(self.sum())
            self._take(")")
            numbers = [number for number, _ in args]
            length = any(is_length for _, is_length in args)
            if token == "min(":
                return min(numbers), length
            if token == "max(":
                return max(numbers), length
            if len(numbers) != 3:
                raise ValueError(token)
            return max(numbers[0], min(numbers[1], numbers[2])), length
        raise ValueError(token)


def _opacity(value: str | None) -> float | None:
    """An opacity, clamped to 0–1 as a browser clamps it (``-1`` is 0).

    Math this reader cannot evaluate is read as 0 (N-5): an opacity has no
    percentage base or unit to be missing, so what is left unevaluable is an
    unknown function or a nesting past the parser's bound, and D-99 reads a
    value it cannot judge in a property that hides as hiding. A keyword it does
    not know is ``None`` — a browser drops that declaration.
    """
    fraction = _fraction(value)
    if fraction is None:
        return 0.0 if _unevaluable_math(value) else None
    return min(max(fraction, 0.0), 1.0)


def _factor(value: str | None) -> float | None:
    """A scale factor (``0.5``, ``50%``); unevaluable math is 0, as for
    :func:`_opacity` — a factor has no base to be missing either."""
    fraction = _fraction(value)
    if fraction is None and _unevaluable_math(value):
        return 0.0
    return fraction


def _own_opacity(css: dict[str, list[str]]) -> float:
    """The lowest opacity the declarations can give: ``opacity`` times the
    ``opacity()`` functions of a ``filter``."""
    opacity = min(
        (o for value in css.get("opacity", ()) if (o := _opacity(value)) is not None),
        default=1.0,
    )
    filtered = 1.0
    for value in css.get("filter", []) + css.get("-webkit-filter", []):
        product = 1.0
        for function in _split_top(value, " "):
            name, _, rest = function.partition("(")
            if name == "opacity":
                amount = _opacity(rest[:-1].strip() or "1")
                product *= 1.0 if amount is None else amount
        filtered = min(filtered, product)
    return opacity * filtered


def _far_negative(value: str | None, *, percent: bool = True) -> bool:
    """An offset that moves a node off the page: far past any layout nudge,
    at least a viewport (-100vw) away, or — where ``percent`` says a
    percentage is of the page's width — a whole box (-100%) away."""
    parsed = _number(value)
    if parsed is not None:
        number, unit = parsed
        if unit == "%":
            return percent and number <= -100
        if unit in _VIEWPORT:
            return number <= -100
    px = _px(value)
    if px is not None:
        return px <= -_FAR_PX
    # Math this reader cannot evaluate — an unknown function (``sign()``,
    # ``round()``), or one nested past :data:`_MATH_MAX_NESTING` — does not
    # keep a node it throws off the page: a far-negative length written
    # inside it hides (N-5). Only with such a literal, because the common
    # unevaluable offset is a percentage with no base here — the
    # ``calc(50% - 10px)`` that centres a box — and it is visible.
    return _unevaluable_math(value) and any(
        _far_negative(literal, percent=percent)
        for literal in _NEGATIVE_LITERAL.findall(value or "")
    )


def _unevaluable_math(value: str | None) -> bool:
    """A CSS math function call (:data:`_CSS_MATH_ALL`) that :func:`_px` and
    :func:`_fraction` could not reduce to a number — the caller has already
    tried."""
    match = _MATH_CALL.match(value or "")
    return match is not None and match.group(1) in _CSS_MATH_ALL


def _sliver(value: str | None) -> bool:
    parsed = _number(value)
    if parsed is not None and parsed[1] == "%":
        return parsed[0] <= 0
    px = _px(value)
    return px is not None and px <= _SLIVER_PX


def _arguments(text: str) -> list[str]:
    return [part for part in re.split(r"[\s,]+", text.strip()) if part]


def _split_top(value: str, separator: str) -> list[str]:
    """``value`` split on ``separator`` (a space means any whitespace) outside
    parentheses: ``scale(calc(0)) rotate(3deg)`` is two functions."""
    parts: list[str] = []
    depth = start = 0
    for index, char in enumerate(value):
        if char == "(":
            depth += 1
        elif char == ")":
            depth = max(depth - 1, 0)
        elif depth == 0 and (char == separator or (separator == " " and char.isspace())):
            parts.append(value[start:index])
            start = index + 1
    parts.append(value[start:])
    return [part.strip() for part in parts if part.strip()]


def _functions(value: str) -> list[tuple[str, list[str]]]:
    """The top-level function calls of a value and their arguments, split on
    commas and spaces outside parentheses."""
    calls: list[tuple[str, list[str]]] = []
    for part in _split_top(value, " "):
        name, paren, rest = part.partition("(")
        if paren and rest.endswith(")"):
            args = [arg for chunk in _split_top(rest[:-1], ",") for arg in _split_top(chunk, " ")]
            calls.append((name, args))
    return calls


def _empty_rect(value: str | None) -> bool:
    """``clip: rect(top, right, bottom, left)`` with no area left; ``auto``
    is the box's own edge, so it never collapses a side on its own."""
    match = _CSS_FUNCTION.fullmatch(value or "")
    if match is None or match.group(1) != "rect":
        return False
    edges = _arguments(match.group(2))
    if len(edges) != 4:
        return False
    top, right, bottom, left = (_px(edge) for edge in edges)
    collapsed_y = top is not None and bottom is not None and bottom <= top
    collapsed_x = left is not None and right is not None and right <= left
    return collapsed_x or collapsed_y


def _empty_clip_path(value: str | None) -> bool:
    """``inset()`` that meets itself (the insets of one axis reach 100%), a
    ``circle()``/``ellipse()`` of zero radius, or a ``polygon()`` of one point."""
    match = _CSS_FUNCTION.match(value or "")
    if match is None:
        return False
    shape = match.group(1)
    args = _arguments(match.group(2).split(" at ")[0].split(" round ")[0])
    if shape == "inset" and 1 <= len(args) <= 4:
        percents: list[float] = []
        for arg in args:
            parsed = _number(arg)
            if parsed is None or (parsed[1] != "%" and parsed[0] != 0):
                return False  # a fixed inset cannot be weighed against the box
            percents.append(parsed[0])
        top, right, bottom, left = _box_sides(percents)
        return top + bottom >= 100 or left + right >= 100
    if shape in ("circle", "ellipse") and args:
        radii = [_px(arg, percent_of=100.0) for arg in args[:2]]
        return any(radius is not None and radius <= 0 for radius in radii)
    if shape == "polygon":
        points = {point.strip() for point in match.group(2).split(",") if point.strip()}
        return len(points) == 1
    return False


_T = TypeVar("_T")


def _box_sides(values: list[_T]) -> list[_T]:
    """One to four values as top, right, bottom, left — the CSS box shorthand."""
    if len(values) == 1:
        return values * 4
    if len(values) == 2:
        return [values[0], values[1], values[0], values[1]]
    if len(values) == 3:
        return [values[0], values[1], values[2], values[1]]
    return values[:4]


def _scale_factor(css: dict[str, list[str]]) -> float:
    """The smallest factor by which the declarations can shrink the box along
    an axis: ``transform`` (``scale*``, ``matrix*``), ``scale`` and ``zoom``."""
    transform = min((_transform_scale(value) for value in css.get("transform", ())), default=1.0)
    scale = 1.0
    for value in css.get("scale", ()):
        factors = [_factor(arg) for arg in _split_top(value, " ")[:2]]
        known = [abs(factor) for factor in factors if factor is not None]
        if known:
            scale = min(scale, *known)
    zoom = 1.0
    for value in css.get("zoom", ()):
        factor = _fraction(value)
        if factor is not None and factor > 0:  # ``zoom: 0`` is read as 1
            zoom = min(zoom, factor)
    return transform * scale * zoom


def _transform_scale(value: str) -> float:
    """The factor of the axis a transform list shrinks most (rotations and
    skews aside, which do not shrink a box to nothing)."""
    x = y = 1.0
    for name, args in _functions(value):
        numbers = [_factor(arg) for arg in args]
        if any(number is None for number in numbers):
            continue
        values = [number for number in numbers if number is not None]
        if name == "scale" and values:
            x, y = x * values[0], y * (values[1] if len(values) > 1 else values[0])
        elif name == "scale3d" and len(values) >= 2:
            x, y = x * values[0], y * values[1]
        elif name == "scalex" and values:
            x *= values[0]
        elif name == "scaley" and values:
            y *= values[0]
        elif name == "matrix" and len(values) == 6:
            x, y = x * math.hypot(values[0], values[1]), y * math.hypot(values[2], values[3])
        elif name == "matrix3d" and len(values) == 16:
            x *= math.hypot(values[0], values[1], values[2])
            y *= math.hypot(values[4], values[5], values[6])
    return min(abs(x), abs(y))


def _translations(css: dict[str, list[str]]) -> list[str]:
    """Every distance a ``transform`` or ``translate`` moves the box by, along
    x and y — a matrix's translation included, in pixels."""
    moves: list[str] = []
    for value in css.get("transform", ()):
        for name, args in _functions(value):
            if name in ("translate", "translate3d"):
                moves += args[:2]
            elif name in ("translatex", "translatey"):
                moves += args[:1]
            elif name == "matrix" and len(args) == 6:
                moves += [f"{arg}px" if _number(arg) else arg for arg in args[4:6]]
            elif name == "matrix3d" and len(args) == 16:
                moves += [f"{arg}px" if _number(arg) else arg for arg in args[12:14]]
    for value in css.get("translate", ()):
        moves += _split_top(value, " ")[:2]
    return moves


def _visible(root: _Node, tag: str, outermost: bool) -> Iterator[_Node]:
    """Visible elements named ``tag``, in document order.

    With ``outermost``, one found is not searched inside: a nested one can
    never hold more text than the one around it."""
    stack: list[tuple[_Node, bool]] = [(root, False)]
    while stack:
        node, sectioning = stack.pop()
        if _skipped(node, sectioning):
            continue
        if node.tag == tag:
            yield node
            if outermost:
                continue
        inner = sectioning or node.tag in _SECTIONING
        stack.extend(
            (child, inner) for child in reversed(node.children) if isinstance(child, _Node)
        )


def _content(root: _Node) -> str:
    """The text of the element that holds the page's content."""
    page = _render(root, sectioning=False)
    articles = [_render(node, sectioning=True) for node in _visible(root, "article", True)]
    if articles:
        best = max(articles, key=_legible)
        if _legible(best) >= MIN_LEGIBLE_CHARS and _legible(best) >= ARTICLE_MIN_SHARE * _legible(
            page
        ):
            return best
    mains = [_render(node, sectioning=True) for node in _visible(root, "main", True)]
    if mains:
        best = max(mains, key=_legible)
        if _legible(best) >= MIN_LEGIBLE_CHARS:
            return best
    # The whole document, not only <body>: <head> is dropped anyway, and text a
    # broken page put outside its <body> is still text a browser shows.
    return page


def _title(root: _Node) -> str | None:
    stack: list[_Node] = [root]
    while stack:
        node = stack.pop()
        if node.tag in {"svg", "math", "template"}:
            continue  # an SVG <title> names a drawing, not the page
        if node.tag == "title":
            title = _collapse(_all_text(node))
            if title:
                return title
            continue
        stack.extend(child for child in reversed(node.children) if isinstance(child, _Node))
    for heading in _visible(root, "h1", outermost=True):
        title = _flat(heading, sectioning=True)
        if title:
            return title
    return None


def _all_text(node: _Node) -> str:
    parts: list[str] = []
    stack: list[_Node | str] = [node]
    while stack:
        item = stack.pop()
        if isinstance(item, str):
            parts.append(item)
        else:
            stack.extend(reversed(item.children))
    return "".join(parts)


def _legible(text: str) -> int:
    return sum(1 for char in text if char.isalnum())


def _collapse(text: str) -> str:
    return _ASCII_WHITESPACE.sub(" ", text.translate(_INVISIBLE)).strip()


# --- rendering --------------------------------------------------------------


class _Writer:
    """Accumulates inline text into blocks; a block is a paragraph of output.

    ``flat`` writes one line for a heading or a table cell: no list markers, no
    headings of its own — the caller joins the blocks with spaces."""

    def __init__(self, flat: bool) -> None:
        self.flat = flat
        self.blocks: list[str] = []
        self._parts: list[str] = []
        self._prefix = ""
        self._block = 0  # which block ``_parts`` belongs to
        self._scripts: list[tuple[int, int]] = []

    def text(self, value: str, pre: bool) -> None:
        value = value.translate(_INVISIBLE)
        if not pre:
            self._parts.append(_ASCII_WHITESPACE.sub(" ", value))
            return
        for index, line in enumerate(value.split("\n")):
            if index:
                self.line_break()
            self._parts.append(line)

    def line_break(self) -> None:
        self._parts.append("\n")

    def start_item(self) -> None:
        self.end_block()
        self._prefix = "" if self.flat else "- "

    def end_item(self) -> None:
        self.end_block()
        self._prefix = ""

    def end_block(self) -> None:
        raw = "".join(self._parts)
        self._parts = []
        self._block += 1
        text = "\n".join(_ASCII_WHITESPACE.sub(" ", line).strip() for line in raw.split("\n"))
        text = _BLANK_RUN.sub("\n\n", text).strip()
        if not text:
            return  # an <li> whose text is in a <p> keeps its marker for it
        if self._prefix:
            text = _not_a_heading(self._prefix + text)
            self._prefix = ""
        self.blocks.append(text)

    def heading(self, text: str) -> None:
        self.end_block()
        if text:
            self.blocks.append(_heading_line(text))

    def row(self, cells: list[str]) -> None:
        self.end_block()
        if any(cells):
            self.blocks.append(_not_a_heading(" | ".join(cells)))

    def open_script(self) -> None:
        self._scripts.append((self._block, len(self._parts)))

    def close_script(self, tag: str) -> None:
        """Write a superscript or subscript so that its digits stay apart.

        ``10<sup>3</sup>`` becomes ``10³`` — and a footnote link glued to a
        figure, ``7850<sup><a>2</a></sup>``, becomes ``7850²``, which is also
        what the reader sees. Concatenated as ``103`` or ``78502`` it would be a
        number the page never stated, and one the number check would then
        accept. What cannot be written with those characters but still starts
        with a digit gets a caret (``10^3,5``); anything else is left inline.
        """
        if not self._scripts:
            return
        block, start = self._scripts.pop()
        if block != self._block:
            return  # a block ended inside the element; there is nothing to glue
        text = _collapse("".join(self._parts[start:]))
        if _SCRIPTABLE.fullmatch(text):
            text = text.translate(_SUPERSCRIPT if tag == "sup" else _SUBSCRIPT)
        elif text[:1] in _SCRIPT_START:
            text = ("^" if tag == "sup" else "_") + text
        else:
            return
        self._parts[start:] = [text]


def _render(root: _Node, sectioning: bool, flat: bool = False) -> str:
    writer = _Writer(flat)
    _walk(root, writer, sectioning)
    writer.end_block()
    return (" " if flat else "\n\n").join(writer.blocks)


def _flat(node: _Node, sectioning: bool) -> str:
    return _collapse(_render(node, sectioning, flat=True))


# Markers on the walk's stack, for what happens when an element ends.
_END_BLOCK, _END_ITEM = "block", "item"


def _walk(root: _Node, writer: _Writer, sectioning: bool) -> None:
    """Depth-first, with an explicit stack: broken markup can nest thousands of
    unclosed tags deep, which recursion would not survive.

    A stack entry is a node with two facts about where it sits (inside a
    section, inside ``<pre>``), or a marker for the end of an element.
    """
    stack: list[tuple[_Node | str, bool, bool] | str] = [(root, sectioning, False)]
    while stack:
        item = stack.pop()
        if isinstance(item, str):
            if item == _END_BLOCK:
                writer.end_block()
            elif item == _END_ITEM:
                writer.end_item()
            else:
                writer.close_script(item)
            continue
        node, in_section, in_pre = item
        if isinstance(node, str):
            writer.text(node, in_pre)
            continue
        tag = node.tag
        if _skipped(node, in_section):
            continue
        if tag == "br":
            writer.line_break()
            continue
        if tag == "math":
            # MathML flattened would glue <mn>10</mn><mn>3</mn> into "103"; the
            # author's own linear form, when given, is the safe reading.
            writer.text(f" {'' if node.mute else node.attrs.get('alttext', '')} ", pre=False)
            continue
        if tag in _HEADINGS and not writer.flat:
            writer.heading(_flat(node, in_section))
            continue
        if tag == "table" and not writer.flat and _is_data_table(node):
            _table(node, writer, in_section)
            continue

        if tag == "li":
            writer.start_item()
            stack.append(_END_ITEM)
        elif tag in _BLOCKS or tag in _HEADINGS:
            writer.end_block()
            stack.append(_END_BLOCK)
        elif tag in {"sup", "sub"}:
            writer.open_script()
            stack.append(tag)
        inner_section = in_section or tag in _SECTIONING
        inner_pre = in_pre or tag in {"pre", "listing"}
        # Unreadable text goes, its children stay (they may set the font size
        # or the colour back); a space keeps the words on either side apart,
        # so dropping "1" between "2" and "3" never writes "23".
        stack.extend(
            (" " if node.mute and isinstance(child, str) else child, inner_section, inner_pre)
            for child in reversed(node.children)
        )


def _is_data_table(table: _Node) -> bool:
    """A table of values, as opposed to one used to lay a page out.

    Old pages still put the whole article in one cell of a layout table;
    reading that as rows would glue the sidebar to the text with " | ". A table
    that nests another table, a heading or a sectioning element is layout.
    """
    role = table.attrs.get("role", "").split()
    if role and role[0].lower() in {"presentation", "none"}:
        return False
    return not table.structured


def _table(table: _Node, writer: _Writer, sectioning: bool) -> None:
    """One output line per row, cells joined by " | " — the DOCX reader's form.

    A value kept on the same line as its row label is a value that can still be
    cited next to what it measures."""
    writer.end_block()
    stack: list[_Node] = [table]
    while stack:
        node = stack.pop()
        if node is not table and _skipped(node, sectioning):
            continue
        if node.tag == "caption":
            caption = _flat(node, sectioning)
            if caption:
                writer.blocks.append(caption)
            continue
        if node.tag == "tr":
            cells = [
                child
                for child in node.children
                if isinstance(child, _Node)
                and child.tag in {"td", "th"}
                and not _skipped(child, sectioning)
            ]
            writer.row([_flat(cell, sectioning) for cell in cells])
            continue
        stack.extend(child for child in reversed(node.children) if isinstance(child, _Node))


# --- headings ---------------------------------------------------------------


def _heading_line(text: str) -> str:
    """A heading written so the chunker recognises it as one.

    The chunker knows a heading by its shape — numbered, or in capitals — and
    not by markup it never sees (``app.knowledge.chunking.looks_like_heading``).
    A heading already in that shape is kept as written. Otherwise it is
    written in capitals **only when capitals cannot change what it says**:
    "Propriedades mecânicas" can be, "Viscosidade (mPa·s)" cannot — "MPA" reads
    as mega, not milli — and neither can a Greek symbol (σ is not Σ) or a
    chemical symbol (Al, Fe). A heading left as written is still its own
    paragraph; the chunker then reads it as text, which costs a section label
    and nothing else.
    """
    if looks_like_heading(text):
        return text
    upper = text.upper()
    if looks_like_heading(upper) and _case_carries_no_meaning(text):
        return upper
    return text


def _case_carries_no_meaning(text: str) -> bool:
    """True when every word is plain Latin prose whose case is typography.

    A word qualifies when it is already in capitals, is a short function word,
    or has three letters or more with at most its first one capitalised. Units,
    element symbols and formulae are one or two letters, mixed case, or carry
    digits and symbols — all of which fail.
    """
    for raw in _WORD_SPLIT.split(text):
        word = raw.strip(_WORD_EDGE)
        if not word:
            continue
        if not all(
            char.isalpha() and unicodedata.name(char, "").startswith("LATIN") for char in word
        ):
            return False
        if word.isupper() or word.lower() in _FUNCTION_WORDS:
            continue
        if len(word) < 3 or not word[1:].islower():
            return False
    return True


def _not_a_heading(line: str) -> str:
    """A table row or list item, guarded against being read as a heading.

    The chunker takes a short numbered or all-capitals line for a section title
    and moves it out of the passage text — and "1 | Aço 1020 | 7,85" or
    "- ABNT NBR 6118" has exactly that shape. A row moved into the heading slot
    is a row no answer can quote, so where (and only where) that misreading
    would happen the line ends with ";", the smallest mark the chunker reads as
    prose.
    """
    return f"{line};" if looks_like_heading(line) else line
