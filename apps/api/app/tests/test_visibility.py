"""The one predicate that decides who may read which material (P1-4).

These are the rule's own tests, kept apart from the endpoints that apply it:
``test_my_records_isolation.py`` proves every surface *calls* this, and this
file proves what it *says*. Splitting them matters because the two fail for
different reasons — a leak is either a surface that forgot to ask, or a rule
that answered wrong, and a single test file would not tell the two apart.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.user import User
from app.repositories.visibility import owns, visible_materials


@pytest.fixture()
def catalogue(db_session: Session, test_user: User, other_user: User) -> dict[str, Material]:
    """One shared material and one private record for each of two users."""
    klass = MaterialClass(name="Classe de visibilidade", slug="classe-visibilidade")
    db_session.add(klass)
    db_session.flush()

    materials = {
        "shared": Material(name="Aço partilhado", class_id=klass.id, keywords=[], owner_id=None),
        "mine": Material(name="Liga da Ana", class_id=klass.id, keywords=[], owner_id=test_user.id),
        "theirs": Material(
            name="Liga do Bruno", class_id=klass.id, keywords=[], owner_id=other_user.id
        ),
    }
    for material in materials.values():
        db_session.add(material)
    db_session.flush()
    return materials


def _names(db_session: Session, viewer_id: int | None) -> set[str]:
    stmt = select(Material.name).where(visible_materials(viewer_id))
    return {row[0] for row in db_session.execute(stmt).all()}


def test_a_reader_sees_the_shared_catalogue_and_their_own_records(
    db_session: Session, test_user: User, catalogue: dict[str, Material]
) -> None:
    assert _names(db_session, test_user.id) >= {"Aço partilhado", "Liga da Ana"}


def test_a_reader_never_sees_another_persons_record(
    db_session: Session, test_user: User, catalogue: dict[str, Material]
) -> None:
    """The whole feature is this line. Everything else is plumbing that has to
    keep calling it."""
    assert "Liga do Bruno" not in _names(db_session, test_user.id)


def test_the_other_reader_sees_the_mirror_image(
    db_session: Session, other_user: User, catalogue: dict[str, Material]
) -> None:
    """Asserted from both sides on purpose: a predicate that returned *only*
    shared rows would pass the test above and still be wrong."""
    visible = _names(db_session, other_user.id)
    assert "Liga do Bruno" in visible
    assert "Liga da Ana" not in visible


def test_a_reader_with_no_identity_sees_only_the_shared_catalogue(
    db_session: Session, catalogue: dict[str, Material]
) -> None:
    """It fails closed, and that is the point of the default.

    A service constructed without a viewer renders fewer rows than it could,
    never more than it may. The opposite default — no viewer means no filter —
    would turn every place that forgot to pass the user into a leak, silently.
    """
    visible = _names(db_session, None)
    assert "Aço partilhado" in visible
    assert visible.isdisjoint({"Liga da Ana", "Liga do Bruno"})


def test_writing_to_a_shared_catalogue_row_is_not_taken_away(
    catalogue: dict[str, Material], other_user: User
) -> None:
    """Writing is not the mirror of reading. The catalogue has been communally
    writable since D-42, and My Records adds the other half rather than
    quietly revoking that."""
    assert owns(catalogue["shared"], other_user.id) is True


def test_only_the_owner_writes_to_an_owned_record(
    catalogue: dict[str, Material], test_user: User, other_user: User
) -> None:
    assert owns(catalogue["mine"], test_user.id) is True
    assert owns(catalogue["mine"], other_user.id) is False


def test_an_anonymous_writer_never_owns_an_owned_record(
    catalogue: dict[str, Material],
) -> None:
    assert owns(catalogue["mine"], None) is False
