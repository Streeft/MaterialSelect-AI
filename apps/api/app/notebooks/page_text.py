"""The text of a web page for a notebook source: Trafilatura first, the built-in reader second (D-252).

``app.notebooks.html_text`` reads a page with the standard library and drops what it can *see*
is chrome (``<nav>``, ``<aside>``, a ``hidden`` subtree…). It cannot tell a cookie banner or a
"leia também" strip made of plain ``<div>`` elements from the article around it. Trafilatura
can: it scores the page's blocks (link density, text length, class and id hints, the position in
the tree) and keeps the main content. This module is the swap the old docstring promised, kept
*in front of* the built-in reader instead of replacing it:

1. The page is parsed by the built-in reader (``html_text._parse``), which also marks every
   subtree a person cannot see — ``hidden``, ``aria-hidden``, a style that hides it, text too
   small or too clear to read. **That rule survives the swap by construction**: Trafilatura is
   not given the page, it is given :func:`clean_markup`, the page *without* those subtrees,
   without the chrome the built-in reader drops, and with superscripts already written as ``³``.
   An instruction hidden for a model is not in what Trafilatura reads, so it cannot be in what
   it returns.
2. Trafilatura's Markdown is written back into the shape the rest of the pipeline reads
   (headings the chunker recognises, ``- `` for a list item, ``a | b`` for a table row, blank
   lines between blocks) by :func:`from_markdown`, with the same helpers the built-in writer uses.
3. Its answer is used only when it passes four checks, and **any failure is the built-in
   reader's answer, unchanged**: Trafilatura raising, returning nothing, returning less than
   :data:`MIN_LEGIBLE_CHARS` letters, keeping less than :data:`MIN_SHARE_OF_BASELINE` of what
   the built-in reader kept (it picked the wrong block), or containing **a number the page
   never wrote** (the rule "a figure is never manufactured by flattening": every number in the
   text must be one the page's own text has).

``NOTEBOOK_HTML_EXTRACTOR=builtin`` turns step 2 and 3 off. Trafilatura (Apache-2.0; its
dependencies courlan and htmldate are Apache-2.0, jusText BSD-2, dateparser BSD-3) is imported
only when a page is read, never at boot: about 20 MB of resident memory the first time (D-235's
rule for heavy imports), measured in the D-252 entry.
"""

from __future__ import annotations

import logging
import re
from html import escape

from app.config import settings
from app.domain.errors import ValidationError
from app.knowledge.readers import ExtractedText, storable_text
from app.notebooks import html_text as builtin

logger = logging.getLogger(__name__)

#: Trafilatura's answer must keep at least this share of the letters and digits the built-in
#: reader kept, or the page's main block was probably misjudged and the built-in text wins. Low
#: on purpose: removing boilerplate *inside* the article is exactly what Trafilatura is for.
MIN_SHARE_OF_BASELINE = 0.2

#: A cleaned page larger than this is read by the built-in reader alone: Trafilatura builds a
#: second tree of it in memory, and the process has 1 GB (``NOTEBOOK_FETCH_MAX_BYTES`` lets
#: pages of 5 MB in).
MAX_CLEAN_CHARS = 1_500_000

_NUMBER = re.compile(r"\d+(?:[.,]\d+)*")
_MD_HEADING = re.compile(r"^#{1,6}\s+(.*\S)\s*$")
_MD_ITEM = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+(.*\S)\s*$")
_MD_ROW = re.compile(r"^\s*\|(.*)\|\s*$")
_MD_RULE = re.compile(r"^[\s:|\-]+$")
_MD_BOLD = re.compile(r"(\*\*|__)(?=\S)(.+?)(?<=\S)\1")
_MD_EMPHASIS = re.compile(r"(?<![\w*])([*_])(?=\S)([^*_\n]+?)(?<=\S)\1(?![\w*])")
_MD_CODE = re.compile(r"`([^`\n]+)`")

#: Tags written to the cleaned markup. Everything else is its children, without the tag.
_KEPT = frozenset(
    "p div section article main header footer h1 h2 h3 h4 h5 h6 ul ol li dl dt dd blockquote "
    "pre code br hr table thead tbody tfoot tr td th caption figure figcaption span a em strong "
    "b i u small mark cite q abbr details summary address".split()
)
_TABLE_TAGS = frozenset("table thead tbody tfoot tr td th caption".split())
_VOID_WRITTEN = frozenset({"br", "hr"})


# --- public -----------------------------------------------------------------


def extract_page(data: bytes | str, charset: str | None = None) -> tuple[str | None, ExtractedText]:
    """The page's title and readable text; the signature of ``html_text.extract_html``.

    Raises:
        ValidationError: the page has too little readable text to be a source
            (:data:`html_text.EMPTY_PAGE_MESSAGE`), whichever reader looked at it.
    """
    markup = data if isinstance(data, str) else builtin.decode_html(data, charset)
    root = builtin._parse(markup)
    baseline = storable_text(builtin._content(root))
    text = baseline
    if settings.notebook_html_extractor.strip().lower() == "trafilatura":
        better = _trafilatura_text(root, baseline)
        if better is not None:
            text = better
    if builtin._legible(text) < builtin.MIN_LEGIBLE_CHARS:
        raise ValidationError(builtin.EMPTY_PAGE_MESSAGE)
    title = builtin._title(root)
    return (storable_text(title) if title is not None else None), ExtractedText(pages=[text])


def clean_markup(root: builtin._Node) -> str:
    """The page as HTML for Trafilatura: only what a person sees, in a shape that cannot lie.

    Walks the built-in reader's tree with the built-in reader's own rules (``_skipped``,
    ``mute``), so the hidden subtrees, the chrome landmarks, ``<script>`` and ``<style>`` are
    not written at all, text too small or clear to read becomes a space, a superscript is
    written as ``³`` (``10<sup>3</sup>`` must never become ``103``), a MathML formula as its
    ``alttext`` and a table used for layout as plain blocks. Attributes are dropped except
    ``class`` and ``id``, which Trafilatura's boilerplate heuristics read. Iterative, because
    broken markup nests thousands of unclosed tags deep.
    """
    parts: list[str] = []
    # (node, inside a sectioning element, inside a layout table) or the closing markup to write.
    stack: list[tuple[builtin._Node | str, bool, bool] | str] = [(root, False, False)]
    while stack:
        item = stack.pop()
        if isinstance(item, str):
            parts.append(item)
            continue
        node, in_section, layout = item
        if isinstance(node, str):
            parts.append(escape(node.translate(builtin._INVISIBLE), quote=False))
            continue
        if builtin._skipped(node, in_section):
            continue
        tag = node.tag
        if tag == "math":
            parts.append(f" {'' if node.mute else escape(node.attrs.get('alttext', ''))} ")
            continue
        if tag in ("sup", "sub"):
            parts.append(escape(_script(node), quote=False))
            continue
        inner_section = in_section or tag in builtin._SECTIONING
        inner_layout = layout
        if tag == "table":
            inner_layout = not builtin._is_data_table(node)
        name = "div" if (layout or inner_layout) and tag in _TABLE_TAGS else tag
        if tag == "#root":
            opening, closing = "", ""
        elif tag in _VOID_WRITTEN:
            parts.append(f"<{tag}>")
            continue
        elif tag in _KEPT:
            opening, closing = _open(name, node), f"</{name}>"
        else:
            opening, closing = "", ""
        parts.append(opening)
        if closing:
            stack.append(closing)
        # Unreadable text goes, its children stay (they may set the font size back); a space
        # keeps the words on either side apart.
        stack.extend(
            (" " if node.mute and isinstance(child, str) else child, inner_section, inner_layout)
            for child in reversed(node.children)
        )
    return "".join(parts)


def from_markdown(markdown: str) -> str:
    """Trafilatura's Markdown as the blocks the chunker and the citations read.

    A heading is written by the built-in ``_heading_line`` (so the chunker knows it), a list
    item as ``- text``, a table row as ``a | b`` (the rule row dropped), and a line the chunker
    could take for a heading but is not one ends with ``;`` (``_not_a_heading``): exactly the
    conventions of the built-in writer, so the two readers' texts are interchangeable.
    """
    blocks: list[str] = []
    paragraph: list[str] = []

    def flush() -> None:
        if paragraph:
            text = "\n".join(line for line in paragraph if line)
            if text:
                blocks.append(text)
            paragraph.clear()

    for raw in markdown.splitlines():
        line = raw.translate(builtin._INVISIBLE)
        if not line.strip():
            flush()
            continue
        if heading := _MD_HEADING.match(line):
            flush()
            text = _plain(heading.group(1))
            if text:
                blocks.append(builtin._heading_line(text))
        elif row := _MD_ROW.match(line):
            flush()
            if _MD_RULE.fullmatch(row.group(1)):
                continue
            cells = [_plain(cell) for cell in re.split(r"(?<!\\)\|", row.group(1))]
            if any(cells):
                blocks.append(builtin._not_a_heading(" | ".join(cells)))
        elif item := _MD_ITEM.match(line):
            flush()
            text = _plain(item.group(1))
            if text:
                blocks.append(builtin._not_a_heading(f"- {text}"))
        else:
            paragraph.append(_plain(line))
    flush()
    return "\n\n".join(blocks)


# --- internals ----------------------------------------------------------------


def _open(name: str, node: builtin._Node) -> str:
    attributes = "".join(
        f' {key}="{escape(node.attrs[key], quote=True)}"'
        for key in ("class", "id")
        if node.attrs.get(key)
    )
    return f"<{name}{attributes}>"


def _script(node: builtin._Node) -> str:
    """A superscript or subscript as the built-in writer writes it (D-252).

    ``10<sup>3</sup>`` is ``10³`` and ``H<sub>2</sub>O`` is ``H₂O``; text that cannot be written
    with those characters but starts with a digit gets a caret (``10^3,5``). The built-in
    writer's own ``close_script`` does it, over the element rendered alone: what comes back is
    exactly what the built-in reader would have written in that place.
    """
    return builtin._flat(node, sectioning=True)


def _plain(text: str) -> str:
    """One line of Trafilatura's Markdown without its inline marks (bold, emphasis, code)."""
    text = _MD_BOLD.sub(r"\2", text)
    text = _MD_EMPHASIS.sub(r"\2", text)
    text = _MD_CODE.sub(r"\1", text)
    return builtin._collapse(text)


def _numbers(text: str) -> set[str]:
    return set(_NUMBER.findall(text))


def _trafilatura_text(root: builtin._Node, baseline: str) -> str | None:
    """Trafilatura's reading of the page, or ``None`` when it cannot or should not be used."""
    try:
        import trafilatura
    except ImportError:  # a deploy without the dependency still reads pages
        logger.warning("trafilatura não está instalado; lendo a página com o leitor embutido.")
        return None
    clean = clean_markup(root)
    if len(clean) > MAX_CLEAN_CHARS:
        logger.info(
            "Página grande demais para o Trafilatura (%d caracteres); leitor embutido.", len(clean)
        )
        return None
    try:
        markdown = trafilatura.extract(
            clean,
            output_format="markdown",
            include_tables=True,
            include_comments=False,
            include_links=False,
            include_images=False,
            favor_recall=True,
            deduplicate=False,
            with_metadata=False,
        )
    except Exception:  # noqa: BLE001 - any failure of a third-party parser is a fallback
        logger.warning("Trafilatura falhou nesta página; leitor embutido.", exc_info=True)
        return None
    if not markdown:
        return None
    text = storable_text(from_markdown(markdown))
    legible = builtin._legible(text)
    if legible < builtin.MIN_LEGIBLE_CHARS:
        return None
    kept = builtin._legible(baseline)
    if kept >= builtin.MIN_LEGIBLE_CHARS and legible < MIN_SHARE_OF_BASELINE * kept:
        logger.info("Trafilatura guardou só %d de %d letras; leitor embutido.", legible, kept)
        return None
    page_numbers = _numbers(builtin._render(root, sectioning=False))
    invented = _numbers(text) - page_numbers
    if invented:
        logger.warning(
            "Trafilatura escreveu número(s) que a página não tem (%s); leitor embutido.",
            ", ".join(sorted(invented)[:5]),
        )
        return None
    return text
