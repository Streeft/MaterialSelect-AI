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
    atom       := WORD | PHRASE | "(" expression ")"
"""

from __future__ import annotations

import re
from dataclasses import dataclass

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
class Not:
    operand: Term | And | Or | Not


@dataclass(frozen=True)
class And:
    operands: tuple[Term | And | Or | Not, ...]


@dataclass(frozen=True)
class Or:
    operands: tuple[Term | And | Or | Not, ...]


Node = Term | And | Or | Not

_TOKEN = re.compile(
    r"""
    \s*(?:
        (?P<lparen>\()
      | (?P<rparen>\))
      | "(?P<phrase>[^"]*)"
      | (?P<dangling_quote>")
      | (?P<word>[^\s()"]+)
    )
    """,
    re.VERBOSE,
)

_OPERATORS = {"and", "or", "not"}


def _tokenize(query: str) -> list[tuple[str, str]]:
    tokens: list[tuple[str, str]] = []
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
            tokens.append(("lparen", "("))
        elif match.group("rparen") is not None:
            tokens.append(("rparen", ")"))
        elif match.group("phrase") is not None:
            tokens.append(("phrase", match.group("phrase")))
        else:
            word = match.group("word")
            kind = word.lower() if word.lower() in _OPERATORS else "word"
            tokens.append((kind, word))
    return tokens


class _Parser:
    def __init__(self, tokens: list[tuple[str, str]]) -> None:
        self.tokens = tokens
        self.at = 0

    def peek(self) -> str | None:
        return self.tokens[self.at][0] if self.at < len(self.tokens) else None

    def take(self) -> tuple[str, str]:
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
            elif nxt in {"word", "phrase", "lparen", "not"}:
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
        _, text = self.take()
        if kind == "phrase":
            return Term(text.strip().lower(), phrase=True)
        return Term(text.lower())


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
    elif isinstance(node, Not):
        _reject_leading_wildcards(node.operand)
    else:
        for operand in node.operands:
            _reject_leading_wildcards(operand)


def to_like_pattern(term: Term) -> str:
    """The SQL ``LIKE`` pattern for one term, with ``\\`` as the escape character.

    A term with no wildcard matches as a substring, so typing `inox` still finds
    `Aço inox 304`; a wildcard is how the reader asks for precision. Whatever the
    user typed is escaped first, so a literal `%` in `100%` cannot become a
    wildcard of its own.
    """
    escaped = term.text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    if term.phrase:
        return f"%{escaped}%"
    if any(w in term.text for w in _WILDCARDS):
        for user, sql in _WILDCARDS.items():
            escaped = escaped.replace(user, sql)
        return escaped
    return f"%{escaped}%"
