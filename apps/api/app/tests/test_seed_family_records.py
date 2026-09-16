"""The family records the seed installs (P1-4).

Same posture as ``test_seed_process_attributes.py``, and the same licence to
name seeded slugs: this module asserts *about the seed itself*, so the demo
catalogue a reader opens the tool on is internally consistent.

What it does **not** assert is the wording. The text is editorial prose, and
pinning sentences here would turn a paragraph into a specification that nobody
can improve without a red test. What matters is the shape: that a family which
has prose has it on both sides of the API, and that the family deliberately left
without prose comes out as absent rather than as an empty string — because the
interface renders those two differently, and only one of them is honest.
"""

from __future__ import annotations

from sqlalchemy import select

from app.models.material_class import MaterialClass
from app.models.process import ProcessClass

#: The one family seeded without prose, on purpose — the "ninguém escreveu"
#: state, kept in the demo data the way `condutividade_termica` keeps the
#: missing-value state.
WITHOUT_PROSE = "elastomeros"


def test_the_seeded_families_carry_prose(db_session) -> None:
    rows = db_session.execute(select(MaterialClass)).scalars().all()
    by_slug = {c.slug: c for c in rows}

    for slug in ("metais", "polimeros", "ceramicas", "compositos"):
        assert by_slug[slug].characteristics, slug
        assert by_slug[slug].applications, slug


def test_one_family_is_deliberately_left_unwritten(db_session) -> None:
    """Absent, not empty. An empty string would let the screen render a blank
    panel that reads as "this family has no applications" — a different claim
    from "nobody has written this yet", which is what NULL says."""
    elastomeros = (
        db_session.execute(select(MaterialClass).where(MaterialClass.slug == WITHOUT_PROSE))
        .scalars()
        .one()
    )

    assert elastomeros.characteristics is None
    assert elastomeros.applications is None


def test_the_seeded_process_families_carry_prose(db_session) -> None:
    rows = db_session.execute(select(ProcessClass)).scalars().all()
    by_slug = {c.slug: c for c in rows}

    for slug in ("conformacao", "remocao-material", "uniao", "tratamento-superficie"):
        assert by_slug[slug].characteristics, slug
        assert by_slug[slug].applications, slug


def test_the_prose_reaches_the_family_record_endpoint(client) -> None:
    """End to end over the demo data: what the browse screen will actually read."""
    body = client.get("/api/classes/metais").json()

    assert body["characteristics"]
    assert body["applications"]
    assert body["ancestors"] == []  # a root family


def test_a_family_without_prose_reaches_the_endpoint_as_absent(client) -> None:
    body = client.get(f"/api/classes/{WITHOUT_PROSE}").json()

    assert body["characteristics"] is None
    assert body["applications"] is None


def test_the_process_family_record_reaches_the_endpoint_with_its_processes(client) -> None:
    body = client.get("/api/processes/classes/uniao").json()

    assert body["characteristics"]
    # The folder knows what is filed in it, and the count agrees with the list.
    assert body["process_count"] == len(body["processes"])
    assert body["processes"]


def test_a_branch_reports_what_is_below_it(client) -> None:
    """`conformacao` holds nothing directly — its four subfolders do. Without the
    subtree total the tree would show a zero and give the reader no reason to
    open the branch that holds most of the catalogue."""
    body = client.get("/api/processes/classes/conformacao").json()

    assert body["process_count"] == 0
    assert body["descendant_process_count"] > 0
    assert len(body["children"]) == 4
