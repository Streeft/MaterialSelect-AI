"""Nobody reads anybody else's record — proved against the whole API surface.

``test_visibility.py`` proves what the rule *says*. This file proves every
surface *asks* it, and it is deliberately written so that a **new** endpoint is
covered the day it is added rather than the day someone remembers to test it:
the sweep enumerates ``app.openapi()``, which is the documented surface itself.
That matters more here than anywhere else in the codebase. A forgotten
``is_active`` filter shows a withdrawn material and somebody files a bug; a
forgotten ownership filter hands one person's record to another, quietly, and
nothing in the product would ever say so.

The sweep alone would be a weak proof — most of these routes could 404 and the
test would still be green — so it runs twice. Once as the owner, where the name
**must** appear; once as a stranger, where it must not. A change that hid the
record from everybody would pass the second half and fail the first.
"""

from __future__ import annotations

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.integrations.http import get_http_transport, get_resolver
from app.main import app
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition
from app.models.user import User
from app.tests.conftest import _ban_network

#: Distinctive enough that finding it in any response body is unambiguous —
#: it cannot collide with a class name, a slug or a seeded material.
PRIVATE_NAME = "Superliga confidencial de Bruno"

#: Stand-ins for the path parameters of the documented GET routes. A parameter
#: with no plausible value gets ``1``, which 404s — harmless, because a 404 body
#: cannot carry the name either.
PATH_VALUES = {
    "material_id": None,  # filled with the private record's own id
    "property_slug": "densidade",
    "slug": "metais",
    "fmt": "csv",
    "study_id": "1",
    "job_id": "1",
    "chart_id": "1",
    # D-92: filled with the private notebook's own ids by `_sweep`.
    "notebook_id": "1",
    "source_id": "1",
    # D-94: filled with the private notebook's Studio artifact.
    "artifact_id": "1",
}

#: Query strings for the GETs that need one to return anything at all.
QUERY_STRINGS = {
    "/api/materials/chart": "?x=densidade&y=modulo_young",
    "/api/materials": "?search=Superliga",
}


@pytest.fixture()
def private_record(db_session: Session, other_user: User) -> Material:
    """A material owned by the *other* user, carrying a real property value.

    The value matters: a record with no numbers would never reach a chart, a
    distribution or an export, and those are exactly the surfaces where an
    ownership filter is easiest to forget.
    """
    klass = (
        db_session.execute(select(MaterialClass).where(MaterialClass.slug == "metais"))
        .scalars()
        .one()
    )
    # Both axes of the map below, because a point needs an x *and* a y: a
    # record carrying only one of them never reaches the figure, and the sweep
    # would then prove nothing about the surface where a stray point is least
    # likely to be noticed.
    properties = {
        definition.slug: definition
        for definition in db_session.execute(
            select(PropertyDefinition).where(
                PropertyDefinition.slug.in_(["densidade", "modulo_young"])
            )
        ).scalars()
    }

    material = Material(
        name=PRIVATE_NAME,
        class_id=klass.id,
        keywords=[],
        owner_id=other_user.id,
        is_demo=False,
    )
    db_session.add(material)
    db_session.flush()
    for slug, value, unit in (
        ("densidade", 7850.0, "kg/m**3"),
        ("modulo_young", 210e9, "Pa"),
    ):
        db_session.add(
            MaterialPropertyValue(
                material_id=material.id,
                property_id=properties[slug].id,
                value_scalar=value,
                normalized_value=value,
                canonical_unit=unit,
                original_unit=unit,
                is_missing=False,
            )
        )
    db_session.flush()
    return material


def _documented_get_paths() -> list[str]:
    """Every GET path the API publishes, straight from its own schema.

    Read from the OpenAPI document rather than from a hand-written list so that
    an endpoint added tomorrow is swept without anyone editing this file.
    """
    schema = app.openapi()
    return sorted(path for path, operations in schema["paths"].items() if "get" in operations)


#: A page the private notebook reads from outside (D-97), under the private name.
PRIVATE_PAGE = "https://exemplo.org/superliga"


def _private_page(_request: httpx.Request) -> httpx.Response:
    paragraph = f"<p>{PRIVATE_NAME} resiste a 900 °C em serviço contínuo. " + "Texto " * 60
    return httpx.Response(
        200,
        headers={"content-type": "text/html; charset=utf-8"},
        content=(
            f"<html><head><title>{PRIVATE_NAME}</title></head>"
            f"<body><article>{paragraph}</p></article></body></html>"
        ).encode(),
    )


@pytest.fixture()
def private_notebook(client, login_as, other_user: User) -> dict[str, str]:
    """A notebook of the *other* user (D-92), titled and filled with the same
    distinctive name, so the sweep asks every GET about it too. It also holds a
    page read from outside (D-97), whose title, link and credit carry the name —
    an external source is a record like any other and must not travel either."""
    app.dependency_overrides[get_http_transport] = lambda: httpx.MockTransport(_private_page)
    app.dependency_overrides[get_resolver] = lambda: lambda _host, _port: ["93.184.216.34"]
    with login_as(other_user):
        notebook = client.post("/api/notebooks", json={"title": PRIVATE_NAME}).json()
        source = client.post(
            f"/api/notebooks/{notebook['id']}/sources/text",
            json={"title": "Fonte", "text": f"{PRIVATE_NAME} resiste a 900 °C."},
        ).json()
        # Flashcards export as CSV — the `fmt` the sweep fills in — so the
        # export route is asked about the private name too (D-94).
        artifact = client.post(
            f"/api/notebooks/{notebook['id']}/studio", json={"tool": "flashcards"}
        ).json()
        site = client.post(
            f"/api/notebooks/{notebook['id']}/sources/url", json={"url": PRIVATE_PAGE}
        )
        assert site.status_code == 201, site.text
    _ban_network()
    return {
        "notebook_id": str(notebook["id"]),
        "source_id": str(source["id"]),
        "artifact_id": str(artifact["id"]),
        "site_source_id": str(site.json()["id"]),
    }


def _sweep(client, material_id: int, notebook: dict[str, str] | None = None) -> dict[str, str]:
    """Call every documented GET and return ``path -> response body``."""
    values = {**PATH_VALUES, **(notebook or {}), "material_id": str(material_id)}
    bodies: dict[str, str] = {}
    for path in _documented_get_paths():
        url = path
        for name, value in values.items():
            url = url.replace(f"{{{name}}}", str(value))
        url += QUERY_STRINGS.get(path, "")
        # Never follow a redirect: the Google login route would leave the
        # application entirely, and the redirect itself is the response.
        response = client.get(url, follow_redirects=False)
        bodies[path] = response.text
    return bodies


def test_the_sweep_covers_the_whole_documented_get_surface() -> None:
    """A guard on the guard: if the schema ever came back empty, every isolation
    assertion below would pass over nothing at all."""
    paths = _documented_get_paths()
    assert len(paths) >= 30
    assert "/api/materials" in paths
    assert "/api/exports/catalogo.{fmt}" in paths
    # D-97: the one GET of the outside sources is swept like every other.
    assert "/api/notebooks/source-capabilities" in paths


def test_the_owner_finds_their_record_across_the_api(
    client, login_as, other_user: User, private_record: Material, private_notebook
) -> None:
    """The positive control, and the half that makes the other half mean
    something. Without it, hiding the record from *everyone* would read as a
    pass."""
    with login_as(other_user):
        bodies = _sweep(client, private_record.id, private_notebook)

    carrying = sorted(path for path, body in bodies.items() if PRIVATE_NAME in body)
    assert "/api/notebooks" in carrying
    assert "/api/notebooks/{notebook_id}" in carrying
    assert "/api/notebooks/{notebook_id}/sources/{source_id}" in carrying
    assert "/api/notebooks/{notebook_id}/studio" in carrying
    assert "/api/notebooks/{notebook_id}/studio/{artifact_id}" in carrying
    assert "/api/notebooks/{notebook_id}/studio/{artifact_id}/export.{fmt}" in carrying
    assert "/api/materials" in carrying
    assert "/api/materials/{material_id}" in carrying
    assert "/api/exports/catalogo.{fmt}" in carrying
    assert "/api/materials/chart" in carrying


def test_no_documented_get_route_leaks_another_persons_record(
    client, private_record: Material, private_notebook
) -> None:
    """The whole feature, asserted over the whole surface at once.

    ``client`` is logged in as ``test_user``; the record belongs to
    ``other_user``. Any path that comes back carrying the name is a leak, and
    the failure names it.
    """
    bodies = _sweep(client, private_record.id, private_notebook)

    leaking = sorted(path for path, body in bodies.items() if PRIVATE_NAME in body)
    assert leaking == [], f"rotas vazando registro alheio: {leaking}"


def test_another_persons_outside_source_neither_leaks_nor_fetches(
    client, login_as, other_user: User, private_notebook
) -> None:
    """D-97. The outside source is read back by its owner — link, credit and
    all — and is a 404 for anybody else. Every POST that would reach outside is
    refused on the stranger's behalf before any network: the conftest ban would
    fail this test on the first lookup or request."""
    notebook = f"/api/notebooks/{private_notebook['notebook_id']}"
    site = f"{notebook}/sources/{private_notebook['site_source_id']}"
    with login_as(other_user):
        owned = client.get(site).json()
    assert owned["url"] == PRIVATE_PAGE and PRIVATE_NAME in owned["attribution"]

    assert client.get(site).status_code == 404
    for path, payload in (
        ("/sources/url", {"url": PRIVATE_PAGE}),
        ("/sources/youtube", {"url": "https://youtu.be/dQw4w9WgXcQ"}),
        ("/search", {"provider": "wikipedia", "query": "superliga"}),
        ("/sources/external", {"provider": "wikipedia", "key": "1"}),
    ):
        response = client.post(notebook + path, json=payload)
        assert response.status_code == 404, (path, response.text)
        assert PRIVATE_NAME not in response.text


def test_the_datasheet_of_another_persons_record_is_not_found(
    client, private_record: Material
) -> None:
    """Not 403. "Forbidden" would confirm that a record with this id exists and
    belongs to somebody — which is itself the thing being protected."""
    response = client.get(f"/api/materials/{private_record.id}")
    assert response.status_code == 404


def test_a_property_map_never_plots_another_persons_record(
    client, private_record: Material
) -> None:
    """The POST surfaces are swept by hand, and this is the one that matters
    most: a figure is where a stray point is least likely to be noticed and
    most likely to be published."""
    response = client.post(
        "/api/charts/property-map",
        json={"x": "densidade", "y": "modulo_young"},
    )
    assert response.status_code == 200
    assert PRIVATE_NAME not in response.text


def test_a_selection_run_never_admits_another_persons_record(
    client, private_record: Material
) -> None:
    response = client.post(
        "/api/selection/run",
        json={"stages": [{"kind": "limit", "constraints": []}]},
    )
    assert response.status_code == 200, response.text
    assert PRIVATE_NAME not in response.text


def test_the_weights_preview_never_ranks_another_persons_record(
    client, login_as, other_user: User, private_record: Material
) -> None:
    """D-87: the preview ranks the catalogue on every pause in the typing, so it
    is a POST surface like the run. Both directions: invisible to the stranger,
    ranked for the owner — ``top_n`` wide enough that only visibility decides."""
    payload = {"criteria": [{"key": "modulo_young", "weight": 1}], "top_n": 10}

    stranger = client.post("/api/selection/weights-preview", json=payload)
    assert stranger.status_code == 200, stranger.text
    assert PRIVATE_NAME not in stranger.text

    with login_as(other_user):
        owner = client.post("/api/selection/weights-preview", json=payload)
    assert PRIVATE_NAME in owner.text


def test_the_panel_does_not_count_another_persons_record(
    client, login_as, other_user: User, private_record: Material
) -> None:
    """An aggregate leaks no name, so it needs its own assertion: the number
    itself is the leak, and it has to move for the owner and stand still for
    everybody else."""
    stranger_total = client.get("/api/dashboard/overview").json()["materials"]
    with login_as(other_user):
        owner_total = client.get("/api/dashboard/overview").json()["materials"]

    assert owner_total == stranger_total + 1


def test_no_write_reaches_another_persons_record(client, private_record: Material) -> None:
    """Writing needs no predicate of its own, and this is the proof of that claim.

    ``visibility.py`` argues that a "may I write" rule would have no reachable
    branch: a record owned by somebody else is invisible, so every mutation
    already stops at the lookup. That argument is only worth what the endpoints
    do, so the endpoints are asked — all three of them, each with a payload that
    would have succeeded on a record of the caller's own.
    """
    material_id = private_record.id

    patched = client.patch(f"/api/materials/{material_id}", json={"name": "Renomeado"})
    replaced = client.put(f"/api/materials/{material_id}/values", json=[])
    deleted = client.delete(f"/api/materials/{material_id}")

    assert [patched.status_code, replaced.status_code, deleted.status_code] == [404, 404, 404]


def test_the_record_survives_every_refused_write(
    client, login_as, other_user: User, private_record: Material
) -> None:
    """A 404 has to mean "nothing happened", not "it happened and I said no"."""
    client.patch(f"/api/materials/{private_record.id}", json={"name": "Renomeado"})
    client.delete(f"/api/materials/{private_record.id}")

    with login_as(other_user):
        sheet = client.get(f"/api/materials/{private_record.id}").json()
    assert sheet["name"] == PRIVATE_NAME
    assert sheet["is_active"] is True


def test_my_own_record_takes_part_in_my_own_selection(
    client, login_as, other_user: User, private_record: Material
) -> None:
    """The other direction, and the one a leak test structurally cannot see.

    Every assertion above fails when a record is shown to somebody who may not
    see it. None of them fails when a record is hidden from the person who
    *may* — and that is a real defect with a real cause: the viewer defaults to
    "shared catalogue only", so any read path that forgets to pass the user
    silently drops the caller's own records. It shipped exactly that way for
    one commit, on every selection and every export, and looked like data loss
    rather than a permissions bug.

    An own record is not a separate shelf. It selects, charts and gets exported
    with the catalogue, which is the entire point of having one.
    """
    with login_as(other_user):
        run = client.post(
            "/api/selection/run",
            json={"stages": [{"kind": "limit", "constraints": []}]},
        )
        assert run.status_code == 200, run.text
        assert PRIVATE_NAME in run.text

        assert PRIVATE_NAME in client.get("/api/exports/catalogo.csv").text
        assert (
            PRIVATE_NAME
            in client.post(
                "/api/charts/property-map", json={"x": "densidade", "y": "modulo_young"}
            ).text
        )
