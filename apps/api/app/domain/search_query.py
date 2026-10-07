"""A small query language for the catalogue search.

The reference workflow for a selection tool offers `AND`, `OR`, `NOT`, phrase
search, parentheses and wildcards, and inserts `AND` between bare terms. This
module parses that grammar into a tree; turning the tree into SQL is the
repository's job, so the language can be tested without a database.

Why a hand-written parser and not a search engine: the catalogue is small
enough that `LIKE` over three indexed columns answers in microseconds, and a
dependency that has to be deployed, versioned and kept in sync with the
canonical data would be a second source of truth about which materials exist.
When the catalogue outgrows this, the tree stays and only the compiler changes.

Grammar, loosest to tightest::

    expression := term ( OR term )*
    term       := factor ( AND? factor )*      # AND is implicit when omitted
    factor     := NOT? atom
    atom       := WORD | PHRASE | FIELD | "(" expression ")"
    FIELD      := name ":" ( WORD | PHRASE )   # comp:, norma:, designacao: (D-105)

A field atom asks a structured question instead of matching text: ``comp:Cr>=12``
(chemical composition, read by reach — ``app.domain.composition``),
``norma:UNS`` (has a designation in that system) and ``designacao:S30400`` (has
that code). They combine with ``AND``/``OR``/``NOT`` and parentheses like any
other atom. A word whose prefix before ``:`` is made of letters but names no
field is refused rather than searched as text: ``compo:Cr>=12`` would otherwise
quietly find nothing, which reads as "no material has chromium".
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from app.domain.composition import CompositionCondition, CompositionError, parse_condition
from app.domain.designation import DesignationError, designation_key, resolve_system
from app.models.enums import DesignationSystem

#: Wildcards the user writes, and the LIKE metacharacters they become.
_WILDCARDS = {"*": "%", "?": "_"}


class SearchQueryError(ValueError):
    """The query cannot be parsed. Carries a message meant for the reader."""


@dataclass(frozen=True)
class Term:
    """One word or quoted phrase.

    ``phrase`` records that the text arrived in quotes: operators inside it are
    literal, and no wildcard expansion happens there.
    """

    text: str
    phrase: bool = False


@dataclass(frozen=True)
class CompositionAtom:
    """``comp:…`` — a question about the chemical composition (D-105)."""

    condition: CompositionCondition


@dataclass(frozen=True)
class SystemAtom:
    """``norma:…`` — the material carries a designation in this system."""

    system: DesignationSystem


@dataclass(frozen=True)
class DesignationAtom:
    """``designacao:…`` — the material carries this code, in any system.

    ``key`` is the code in ``designation_key`` form (upper case, no spaces),
    wildcards kept. Unlike a bare word, a code without a wildcard matches
    **exactly**: a code is an identifier, and ``designacao:304`` finding
    ``S30400`` as a substring would be a false hit. ``304*`` is how a reader
    asks for the family.
    """

    key: str
    phrase: bool = False

    @property
    def exact(self) -> bool:
        return self.phrase or not any(w in self.key for w in _WILDCARDS)


@dataclass(frozen=True)
class Not:
    operand: Node


@dataclass(frozen=True)
class And:
    operands: tuple[Node, ...]


@dataclass(frozen=True)
class Or:
    operands: tuple[Node, ...]


Node = Term | And | Or | Not | CompositionAtom | SystemAtom | DesignationAtom
Atom = Term | CompositionAtom | SystemAtom | DesignationAtom

#: What a reader may type before ``:``, folded, and the field it names.
_FIELDS = {
    "comp": "comp",
    "composicao": "comp",
    "norma": "norma",
    "designacao": "designacao",
}
_FIELD_NAMES = "comp:, norma: e designacao:"

_TOKEN = re.compile(
    r"""
    \s*(?:
        (?P<lparen>\()
      | (?P<rparen>\))
      | (?P<fphrase_name>[^\s()":]+):"(?P<fphrase>[^"]*)"
      | "(?P<phrase>[^"]*)"
      | (?P<dangling_quote>")
      | (?P<word>[^\s()"]+)
    )
    """,
    re.VERBOSE,
)

_OPERATORS = {"and", "or", "not"}


def _fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text.casefold())
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def _field_of(prefix: str) -> str:
    """The field a ``prefix:`` names, or the error that it names none."""
    field = _FIELDS.get(_fold(prefix))
    if field is None:
        raise SearchQueryError(
            f"Campo de busca desconhecido: '{prefix}:'. Os campos são {_FIELD_NAMES}."
        )
    return field


#: Comparison signs a composition condition uses; a word that *starts* with one
#: is a condition the reader split with spaces.
_COMPARISON_START = ("<", ">", "=", "≥", "≤")

#: A token: (kind, text, field). ``field`` is set only for kind ``field``.
_Token = tuple[str, str, str | None]


def _tokenize(query: str) -> list[_Token]:
    tokens: list[_Token] = []
    position = 0
    while position < len(query):
        if query[position].isspace():
            position += 1
            continue
        match = _TOKEN.match(query, position)
        if match is None:  # pragma: no cover - the pattern accepts any non-space
            raise SearchQueryError(f"Não entendi a busca a partir de {query[position:]!r}.")
        position = match.end()
        if match.group("dangling_quote") is not None:
            raise SearchQueryError("Há uma aspa aberta que nunca fecha.")
        if match.group("lparen") is not None:
            tokens.append(("lparen", "(", None))
        elif match.group("rparen") is not None:
            tokens.append(("rparen", ")", None))
        elif match.group("fphrase") is not None:
            prefix = match.group("fphrase_name")
            if not prefix.isalpha():
                raise SearchQueryError(f"Não entendi '{prefix}:' antes das aspas.")
            tokens.append(("field_phrase", match.group("fphrase"), _field_of(prefix)))
        elif match.group("phrase") is not None:
            tokens.append(("phrase", match.group("phrase"), None))
        else:
            word = match.group("word")
            if word.startswith(_COMPARISON_START):
                raise SearchQueryError(
                    f"'{word}' parece parte de uma condição de composição. Escreva-a junta, "
                    "sem espaços — por exemplo, comp:Cr>=12."
                )
            prefix, colon, value = word.partition(":")
            if colon and prefix.isalpha():
                tokens.append(("field", value, _field_of(prefix)))
                continue
            kind = word.lower() if word.lower() in _OPERATORS else "word"
            tokens.append((kind, word, None))
    return tokens


class _Parser:
    def __init__(self, tokens: list[_Token]) -> None:
        self.tokens = tokens
        self.at = 0

    def peek(self) -> str | None:
        return self.tokens[self.at][0] if self.at < len(self.tokens) else None

    def take(self) -> _Token:
        token = self.tokens[self.at]
        self.at += 1
        return token

    def parse(self) -> Node:
        node = self.expression()
        if self.at != len(self.tokens):
            raise SearchQueryError("Há um ')' sem abertura correspondente.")
        return node

    def expression(self) -> Node:
        operands = [self.term()]
        while self.peek() == "or":
            self.take()
            operands.append(self.term())
        return operands[0] if len(operands) == 1 else Or(tuple(operands))

    def term(self) -> Node:
        operands = [self.factor()]
        while True:
            nxt = self.peek()
            if nxt == "and":
                self.take()
                operands.append(self.factor())
            # An implicit AND: two atoms side by side. `or` and `rparen` end the
            # run; anything else starts another factor.
            elif nxt in {"word", "phrase", "field", "field_phrase", "lparen", "not"}:
                operands.append(self.factor())
            else:
                break
        return operands[0] if len(operands) == 1 else And(tuple(operands))

    def factor(self) -> Node:
        if self.peek() == "not":
            self.take()
            return Not(self.factor())
        return self.atom()

    def atom(self) -> Node:
        kind = self.peek()
        if kind is None:
            raise SearchQueryError("A busca termina esperando mais um termo.")
        if kind == "lparen":
            self.take()
            node = self.expression()
            if self.peek() != "rparen":
                raise SearchQueryError("Há um '(' que nunca fecha.")
            self.take()
            return node
        if kind in {"and", "or"}:
            raise SearchQueryError(f"'{self.take()[1]}' precisa de um termo antes dele.")
        if kind == "rparen":
            raise SearchQueryError("Há um ')' sem nada dentro dos parênteses.")
        _, text, field = self.take()
        if field is not None:
            return _field_atom(field, text, quoted=kind == "field_phrase")
        if kind == "phrase":
            return Term(text.strip().lower(), phrase=True)
        return Term(text.lower())


def _field_atom(field: str, value: str, *, quoted: bool) -> Atom:
    """Build the atom one ``field:value`` names, turning domain errors into query errors."""
    try:
        if field == "comp":
            if quoted:
                raise SearchQueryError(
                    "Uma condição de composição não vai entre aspas: escreva comp:Cr>=12."
                )
            return CompositionAtom(parse_condition(value))
        if field == "norma":
            if not value.strip():
                raise SearchQueryError(
                    "'norma:' precisa do nome da norma — por exemplo, norma:UNS."
                )
            return SystemAtom(resolve_system(value))
        if not value.strip():
            raise SearchQueryError(
                "'designacao:' precisa de um código — por exemplo, designacao:S30400."
            )
        return DesignationAtom(designation_key(value), phrase=quoted)
    except (CompositionError, DesignationError) as exc:
        raise SearchQueryError(str(exc)) from exc


def parse_query(query: str) -> Node:
    """Parse a user's search string. Raises ``SearchQueryError`` on nonsense."""
    tokens = _tokenize(query)
    if not tokens:
        raise SearchQueryError("A busca está vazia.")
    node = _Parser(tokens).parse()
    _reject_leading_wildcards(node)
    return node


def _reject_leading_wildcards(node: Node) -> None:
    """A pattern starting with a wildcard cannot use an index: it scans everything.

    The reference tool refuses it for the same reason, and refusing is kinder
    than a search that appears to hang on a larger catalogue.
    """
    if isinstance(node, Term):
        if not node.phrase and node.text[:1] in _WILDCARDS:
            raise SearchQueryError("Um termo não pode começar com '*' nem com '?'.")
    elif isinstance(node, DesignationAtom):
        if not node.phrase and node.key[:1] in _WILDCARDS:
            raise SearchQueryError("Um código não pode começar com '*' nem com '?'.")
    elif isinstance(node, Not):
        _reject_leading_wildcards(node.operand)
    elif isinstance(node, And | Or):
        for operand in node.operands:
            _reject_leading_wildcards(operand)


def to_like_pattern(term: Term) -> str:
    """The SQL ``LIKE`` pattern for one term, with ``\\`` as the escape character.

    A term with no wildcard matches as a substring, so typing `inox` still finds
    `Aço inox 304`; a wildcard is how the reader asks for precision. Whatever the
    user typed is escaped first, so a literal `%` in `100%` cannot become a
    wildcard of its own.
    """
    escaped = _escape_like(term.text)
    if term.phrase:
        return f"%{escaped}%"
    if any(w in term.text for w in _WILDCARDS):
        for user, sql in _WILDCARDS.items():
            escaped = escaped.replace(user, sql)
        return escaped
    return f"%{escaped}%"


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def to_designation_pattern(atom: DesignationAtom) -> str:
    """The ``LIKE`` pattern for a code with wildcards, against ``code_key``.

    Only called when ``atom.exact`` is false; an exact code compares with ``=``.
    """
    escaped = _escape_like(atom.key)
    for user, sql in _WILDCARDS.items():
        escaped = escaped.replace(user, sql)
    return escaped


def composition_conditions(node: Node) -> list[CompositionCondition]:
    """Every distinct composition condition in the query, in reading order.

    Under ``NOT`` too: the repository has to decide each one for every material
    before the tree can be evaluated, whatever sits above it.
    """
    found: list[CompositionCondition] = []

    def _collect(n: Node) -> None:
        if isinstance(n, CompositionAtom):
            if n.condition not in found:
                found.append(n.condition)
        elif isinstance(n, Not):
            _collect(n.operand)
        elif isinstance(n, And | Or):
            for op in n.operands:
                _collect(op)

    _collect(node)
    return found


def positive_designations(node: Node) -> list[DesignationAtom]:
    """Designation atoms outside any ``NOT`` — the ones relevance rewards."""
    found: list[DesignationAtom] = []

    def _collect(n: Node) -> None:
        if isinstance(n, DesignationAtom):
            if n not in found:
                found.append(n)
        elif isinstance(n, And | Or):
            for op in n.operands:
                _collect(op)

    _collect(node)
    return found


def extract_positive_terms(node: Node) -> list[str]:
    """Extract terms that affirmatively contribute to matching (ignoring NOT).

    Strips wildcards (* and ?) and returns non-empty lower-cased unique terms
    preserving first-seen order.
    """
    terms: list[str] = []

    def _collect(n: Node) -> None:
        if isinstance(n, Term):
            clean = n.text.replace("*", "").replace("?", "").strip()
            if clean and clean not in terms:
                terms.append(clean)
        elif isinstance(n, Not):
            return
        elif isinstance(n, (And, Or)):
            for op in n.operands:
                _collect(op)

    _collect(node)
    return terms
