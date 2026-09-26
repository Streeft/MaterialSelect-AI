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
  ``hidden``, ``aria-hidden="true"`` or inline ``display:none`` /
  ``visibility:hidden`` subtree is the classic place to hide an instruction
  aimed at a model, so it is dropped. Text hidden by a *stylesheet* class cannot
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
import re
import unicodedata
from collections.abc import Iterator
from dataclasses import dataclass, field
from html.parser import HTMLParser

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

_HIDING_STYLE = re.compile(r"(?:^|;)(?:display:none|visibility:(?:hidden|collapse))")
_ASCII_WHITESPACE = re.compile(r"[ \t\n\r\f]+")
#: Invisible characters that only break words apart for search: soft hyphen,
#: zero-width space, word joiner, byte-order mark, and NUL.
_INVISIBLE = dict.fromkeys(map(ord, "\u00ad\u200b\u2060\ufeff\x00"))
_BLANK_RUN = re.compile(r"\n{3,}")

_SUPERSCRIPT = str.maketrans("0123456789+-\u2212=()", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁼⁽⁾")
_SUBSCRIPT = str.maketrans("0123456789+-\u2212=()", "₀₁₂₃₄₅₆₇₈₉₊₋₋₌₍₎")
_SCRIPTABLE = re.compile("[0-9+\\-\u2212=()]+")
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
    style = attrs.get("style")
    return bool(style and _HIDING_STYLE.search("".join(style.lower().split())))


def _visible(root: _Node, tag: str, outermost: bool) -> Iterator[_Node]:
    """Visible elements named ``tag``, in document order.

    With ``outermost``, one found is not searched inside: a nested one can
    never hold more text than the one around it.
    """
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
    headings of its own — the caller joins the blocks with spaces.
    """

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
            writer.text(f" {node.attrs.get('alttext', '')} ", pre=False)
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
        stack.extend((child, inner_section, inner_pre) for child in reversed(node.children))


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
    cited next to what it measures.
    """
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
