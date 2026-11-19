"""The panel's global filters (D-193): which materials and properties it reads.

Four filters, each a *view* in the sense of D-127 — none of them changes a
stored value, and none of them reaches selection, ranking or export:

``class_slug``
    a material class, **with its descendants** (a folder means what is under
    it, as in the catalogue's family page).
``subclasses``
    the free-text ``Material.subclass``, each matched exactly; several at once
    (D-250) mean *any of them* — a union, so "Liga leve" + "Aço estrutural"
    reads both. Empty means no subclass filter.
``level``
    the depth profile (D-127): only properties visible at that level are
    counted, charted or correlated. The materials do not change.
``demo``
    ``todos``, ``demo`` (only demonstration records) or ``reais`` (none).
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Literal

from app.domain.depth_profile import DEFAULT_LEVEL, DepthLevel, is_visible
from app.domain.errors import ValidationError

DemoChoice = Literal["todos", "demo", "reais"]

#: How many subclasses one view may name (D-250). The picker lists the
#: subclasses of the scope, a few dozen at most; twenty keeps a hand-written
#: URL from turning the predicate into a list of hundreds.
MAX_SUBCLASSES = 20
SUBCLASS_MAX_LENGTH = 200


def normalize_subclasses(raw: Iterable[str] | None) -> tuple[str, ...]:
    """The subclasses a request named: blanks dropped, repeats kept once, in order.

    Order is the reader's (the chip lists them as picked); the predicate is a
    set, so the order never changes which materials pass.
    """
    names: list[str] = []
    for item in raw or ():
        name = item.strip()
        if not name or name in names:
            continue
        if len(name) > SUBCLASS_MAX_LENGTH:
            raise ValidationError(
                f"Nome de subclasse com mais de {SUBCLASS_MAX_LENGTH} caracteres."
            )
        names.append(name)
    if len(names) > MAX_SUBCLASSES:
        raise ValidationError(f"No máximo {MAX_SUBCLASSES} subclasses por filtro.")
    return tuple(names)


@dataclass(frozen=True)
class DashboardFilters:
    class_slug: str | None = None
    subclasses: tuple[str, ...] = ()
    level: DepthLevel = DEFAULT_LEVEL
    demo: DemoChoice = "todos"

    def shows_property(self, slug: str) -> bool:
        return is_visible(slug, self.level)

    @property
    def narrows_materials(self) -> bool:
        return bool(self.class_slug or self.subclasses or self.demo != "todos")
