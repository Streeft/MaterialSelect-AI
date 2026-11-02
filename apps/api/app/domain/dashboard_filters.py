"""The panel's global filters (D-193): which materials and properties it reads.

Four filters, each a *view* in the sense of D-127 — none of them changes a
stored value, and none of them reaches selection, ranking or export:

``class_slug``
    a material class, **with its descendants** (a folder means what is under
    it, as in the catalogue's family page).
``subclass``
    the free-text ``Material.subclass``, matched exactly.
``level``
    the depth profile (D-127): only properties visible at that level are
    counted, charted or correlated. The materials do not change.
``demo``
    ``todos``, ``demo`` (only demonstration records) or ``reais`` (none).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.domain.depth_profile import DEFAULT_LEVEL, DepthLevel, is_visible

DemoChoice = Literal["todos", "demo", "reais"]


@dataclass(frozen=True)
class DashboardFilters:
    class_slug: str | None = None
    subclass: str | None = None
    level: DepthLevel = DEFAULT_LEVEL
    demo: DemoChoice = "todos"

    def shows_property(self, slug: str) -> bool:
        return is_visible(slug, self.level)

    @property
    def narrows_materials(self) -> bool:
        return bool(self.class_slug or self.subclass or self.demo != "todos")
