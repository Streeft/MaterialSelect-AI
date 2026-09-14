"""The one predicate that decides which material rows a reader may see (P1-4).

``Material.is_active`` is filtered by hand in eleven places across four
repositories, and that repetition is survivable: forgetting it shows a
withdrawn material, which is an annoyance. Ownership is not survivable the same
way — forgetting it shows *another person's record*, which is a leak. So the
rule is written once, here, and every statement that selects materials applies
it by calling this function rather than by remembering the shape of the
comparison.

**It fails closed.** A reader with no identity (``viewer_id is None``) sees the
shared catalogue and nothing else. That is the safe direction of the mistake: a
service constructed without a viewer renders fewer rows than it could, never
more than it may. Every default in this feature points the same way.
"""

from __future__ import annotations

from sqlalchemy import ColumnElement, or_

from app.models.material import Material


def visible_materials(viewer_id: int | None) -> ColumnElement[bool]:
    """Rows ``viewer_id`` may read: the shared catalogue, plus their own records.

    Note this says nothing about ``is_active``. The two filters answer different
    questions — "may I see it" and "is it still in the catalogue" — and a caller
    that needs both applies both, so that a future surface which deliberately
    shows withdrawn records (an undelete screen) cannot get ownership wrong as a
    side effect of getting deactivation right.
    """
    shared = Material.owner_id.is_(None)
    if viewer_id is None:
        return shared
    return or_(shared, Material.owner_id == viewer_id)


def owns(material: Material, viewer_id: int | None) -> bool:
    """True when ``viewer_id`` may *write* to ``material``.

    Writing is not the mirror of reading. A shared catalogue row stays writable
    by any logged-in user — that is what the catalogue has been since D-42, and
    My Records does not quietly take it away. What this adds is the other half:
    a record with an owner is only ever written by that owner.
    """
    if material.owner_id is None:
        return True
    return viewer_id is not None and material.owner_id == viewer_id
