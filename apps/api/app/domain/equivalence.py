"""Declared equivalence between designations: the rules, with no database (D-115, TM1).

Three rules live here and nowhere else.

**Nothing is inferred.** This module has no function that takes two codes and
answers "are they equivalent": equivalence is a row a curator entered from a
source, and the only operations are validating that row and reading it back.
Matching by name would be the Find Similar question (D-63), and a shared code
is not a declaration (``designation_key`` already refuses to fold punctuation
for the same reason).

**A group is at least two distinct designations.** One designation
"equivalent to itself" is not a statement, and the same designation twice is
one fact written twice.

**Demo and real never mix.** A fictitious source, a fictitious designation or a
fictitious material in a group makes the whole group fictitious, and a group
with both kinds is refused: ``clear_demo`` has to be able to remove every demo
row without taking a real statement with it, and a real source cannot have
declared a correspondence with a made-up code.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.models.enums import EquivalenceKind

MIN_MEMBERS = 2


class EquivalenceError(ValueError):
    """A group that cannot be stored, or a kind that does not exist. Portuguese message."""


#: How each kind is written on screen.
KIND_LABELS: dict[EquivalenceKind, str] = {
    EquivalenceKind.EQUIVALENTE: "Equivalente",
    EquivalenceKind.APROXIMADA: "Aproximada",
    EquivalenceKind.SIMILAR: "Similar",
}

#: What the word means **as a source's claim**. Deliberately about the
#: declaration, not about the materials: this application does not say how close
#: two alloys are, it says what the cited source says.
KIND_MEANINGS: dict[EquivalenceKind, str] = {
    EquivalenceKind.EQUIVALENTE: "A fonte declara as designações equivalentes.",
    EquivalenceKind.APROXIMADA: "A fonte declara uma correspondência aproximada, com diferenças.",
    EquivalenceKind.SIMILAR: "A fonte declara as designações similares, sem equivalência.",
}

KNOWN_KINDS = "equivalente, aproximada e similar"


def resolve_kind(raw: str) -> EquivalenceKind:
    """The kind a curator named, or an error listing the ones that exist."""
    wanted = raw.strip().upper()
    for kind in EquivalenceKind:
        if kind.value == wanted:
            return kind
    raise EquivalenceError(
        f"Tipo de equivalência desconhecido: '{raw}'. Os tipos são {KNOWN_KINDS}."
    )


def kind_label(kind: EquivalenceKind) -> str:
    return KIND_LABELS[kind]


def kind_meaning(kind: EquivalenceKind) -> str:
    return KIND_MEANINGS[kind]


@dataclass(frozen=True)
class MemberCandidate:
    """What validation needs to know about a designation proposed as a member."""

    designation_id: int
    is_demo: bool
    material_is_demo: bool

    @property
    def fictitious(self) -> bool:
        return self.is_demo or self.material_is_demo


def validate_group(members: list[MemberCandidate], *, source_is_demo: bool) -> bool:
    """Check a proposed group and return whether it is fictitious (``is_demo``).

    Raises ``EquivalenceError`` for fewer than two members, a repeated
    designation, or a mix of fictitious and real parts.
    """
    ids = [m.designation_id for m in members]
    if len(set(ids)) != len(ids):
        raise EquivalenceError("A mesma designação aparece mais de uma vez no grupo.")
    if len(ids) < MIN_MEMBERS:
        raise EquivalenceError(
            "Uma equivalência liga pelo menos duas designações; uma só não declara nada."
        )
    flags = {source_is_demo, *(m.fictitious for m in members)}
    if len(flags) > 1:
        raise EquivalenceError(
            "Dado fictício e dado real não se misturam no mesmo grupo: a fonte e todas "
            "as designações têm de ser fictícias, ou nenhuma delas."
        )
    return flags.pop()
