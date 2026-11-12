"""The catalogue as pages: filters, facet counts, order and slicing (D-215).

Pure rules over rows the repository already matched and ranked — no database,
no HTTP. The service turns materials into ``ListingRow`` and asks this module
four questions:

1. **Which rows pass the filters?** Class (with every class under it),
   subclass, data quality and demo flag, all together (AND).
2. **How many rows each chip would leave** (facet counts). A facet is counted
   with every *other* filter applied but not its own, so "Classe: Metais (12)"
   is what choosing Metais would show, whatever class is chosen now.
3. **In which order?** The search's relevance (the order rows arrived in), by
   name, by class, or by a property's value. A material without that value is
   never read as zero (D-24): it goes after every material that has one, in
   both directions, and the order among them is by name.
4. **Which slice?** ``offset``/``limit``; no limit means every row, which is
   what the callers that predate pagination still get.

"Nível" (D-127) is deliberately not a facet: the depth level is a way of
*showing* properties, never a filter of data, and no material belongs to a
level.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Generic, Literal, TypeVar

from app.domain.text_fold import fold_accents

Quality = Literal["complete", "gaps", "measured", "referenced"]
QUALITIES: tuple[Quality, ...] = ("complete", "gaps", "measured", "referenced")

#: The most rows one page may ask for; a larger ``limit`` is a 422.
MAX_PAGE_SIZE = 200

R = TypeVar("R")


@dataclass(frozen=True)
class ListingRow(Generic[R]):
    """What the rules need to know about one material; ``ref`` goes back out."""

    name: str
    class_slug: str
    subclass: str | None
    is_demo: bool
    measured: int
    imported: int
    estimated: int
    missing: int
    reference_count: int
    ref: R


def matches_quality(row: ListingRow, quality: Quality) -> bool:
    """The four quality chips, in the words a reader thinks in.

    "Completo" needs at least one value and no hole; a material with nothing
    registered is not complete, it is empty.
    """
    filled = row.measured + row.imported + row.estimated
    if quality == "complete":
        return row.missing == 0 and filled > 0
    if quality == "gaps":
        return row.missing > 0
    if quality == "measured":
        return row.measured > 0
    return row.reference_count > 0


@dataclass(frozen=True)
class ListingFilters:
    """The chips. ``None`` means the chip does not filter."""

    #: The chosen class *and every class under it* (resolved by the caller,
    #: which knows the tree); ``None`` when no class is chosen.
    class_slugs: frozenset[str] | None = None
    subclass: str | None = None
    quality: Quality | None = None
    demo: bool | None = None


Facet = Literal["classe", "subclasse", "qualidade", "demo"]


def _passes(row: ListingRow, filters: ListingFilters, skip: Facet | None = None) -> bool:
    if skip != "classe" and filters.class_slugs is not None:
        if row.class_slug not in filters.class_slugs:
            return False
    if skip != "subclasse" and filters.subclass is not None:
        if row.subclass != filters.subclass:
            return False
    if skip != "qualidade" and filters.quality is not None:
        if not matches_quality(row, filters.quality):
            return False
    if skip != "demo" and filters.demo is not None:
        if row.is_demo is not filters.demo:
            return False
    return True


def apply_filters(rows: Iterable[ListingRow[R]], filters: ListingFilters) -> list[ListingRow[R]]:
    """The rows every chip lets through, in the order they came."""
    return [row for row in rows if _passes(row, filters)]


@dataclass(frozen=True)
class FacetCounts:
    """How many rows each chip value would leave, given the other chips."""

    #: Per class slug, counting the class **and everything under it**, so the
    #: number on a family is what choosing that family shows.
    classe: dict[str, int]
    subclasse: dict[str, int]
    qualidade: dict[str, int]
    #: ``"true"``/``"false"``: demonstration data or not.
    demo: dict[str, int]


def facet_counts(
    rows: Sequence[ListingRow],
    filters: ListingFilters,
    ancestors: Mapping[str, Sequence[str]],
) -> FacetCounts:
    """Count each facet with every other filter on (see the module docstring).

    ``ancestors`` maps a class slug to the slugs above it, nearest first; a
    material counts for its own class and for each of them. A value no row
    has is absent rather than zero: the chip simply does not offer it.
    """
    classe: Counter[str] = Counter()
    for row in rows:
        if _passes(row, filters, skip="classe"):
            classe[row.class_slug] += 1
            for parent in ancestors.get(row.class_slug, ()):
                classe[parent] += 1
    subclasse: Counter[str] = Counter(
        row.subclass for row in rows if row.subclass and _passes(row, filters, skip="subclasse")
    )
    qualidade: Counter[str] = Counter()
    for row in rows:
        if _passes(row, filters, skip="qualidade"):
            for quality in QUALITIES:
                if matches_quality(row, quality):
                    qualidade[quality] += 1
    demo: Counter[str] = Counter(
        "true" if row.is_demo else "false" for row in rows if _passes(row, filters, skip="demo")
    )
    return FacetCounts(
        classe=dict(classe), subclasse=dict(subclasse), qualidade=dict(qualidade), demo=dict(demo)
    )


Direction = Literal["asc", "desc"]


def _name_key(row: ListingRow) -> str:
    return fold_accents(row.name)


def order_rows(
    rows: Sequence[ListingRow[R]],
    by: Literal["relevance", "name", "class"],
    direction: Direction = "asc",
) -> list[ListingRow[R]]:
    """Relevance keeps the order the search returned (``direction`` is ignored)."""
    if by == "relevance":
        return list(rows)
    reverse = direction == "desc"
    if by == "name":
        return sorted(rows, key=_name_key, reverse=reverse)
    return sorted(
        rows,
        key=lambda row: (fold_accents(row.class_slug), _name_key(row)),
        reverse=reverse,
    )


def order_by_value(
    rows: Sequence[ListingRow[R]],
    value_of: Callable[[ListingRow[R]], float | None],
    direction: Direction = "asc",
) -> list[ListingRow[R]]:
    """By a property's value; rows without one go last in both directions.

    ``value_of`` returns ``None`` for an absent value — never ``0``, which
    would put every hole at the top of an ascending order.
    """
    with_value = [(row, value_of(row)) for row in rows]
    present = [(row, v) for row, v in with_value if v is not None]
    absent = [row for row, v in with_value if v is None]
    present.sort(key=lambda pair: (pair[1], _name_key(pair[0])))
    if direction == "desc":
        present.sort(key=lambda pair: pair[1], reverse=True)
    absent.sort(key=_name_key)
    return [row for row, _ in present] + absent


def page(rows: Sequence[R], offset: int, limit: int | None) -> list[R]:
    """``rows[offset:offset+limit]``; ``limit=None`` is everything from ``offset``."""
    if offset < 0:
        raise ValueError("offset must be >= 0")
    if limit is None:
        return list(rows[offset:])
    if not 1 <= limit <= MAX_PAGE_SIZE:
        raise ValueError(f"limit must be between 1 and {MAX_PAGE_SIZE}")
    return list(rows[offset : offset + limit])
