"""Pure taxonomy walks over the material class hierarchy.

``MaterialClass`` is self-referential, and until P0-1 nothing in the selection
pipeline read that hierarchy: a constraint compared the material's own class
slug and stopped there. A Tree stage needs the whole ancestry, so this module
turns a ``{slug: parent slug}`` map — the shape a repository can hand over
without dragging SQLAlchemy into the domain — into a root→leaf path per class.
"""

from __future__ import annotations

from collections.abc import Mapping


def lineages(parents: Mapping[str, str | None]) -> dict[str, tuple[str, ...]]:
    """Root→leaf slug path for every class in ``parents``, own slug last.

    Two defences, both against data rather than callers:

    * A parent slug absent from the map (a filtered query, a deleted row) ends
      the walk at the deepest known ancestor. Never a ``KeyError``, and never
      an empty path — a class with unknown ancestry is still matchable by
      itself.
    * ``parent_id`` carries no constraint against cycles, so corrupt data can
      describe one. The walk stops when it revisits a slug instead of looping
      forever.
    """
    result: dict[str, tuple[str, ...]] = {}
    for slug in parents:
        path: list[str] = []
        seen: set[str] = set()
        current: str | None = slug
        while current is not None and current in parents and current not in seen:
            seen.add(current)
            path.append(current)
            current = parents[current]
        result[slug] = tuple(reversed(path))
    return result
