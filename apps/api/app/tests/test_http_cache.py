"""D-223: the static lists answer with ``ETag`` and ``Cache-Control: private``.

Every route sits behind the login, so nothing here is ever ``public``: a shared
cache (a proxy, a CDN) must not keep one person's answer for the next. The
browser keeps it, revalidates with ``If-None-Match`` and gets a body-less 304
when nothing changed.
"""

from __future__ import annotations

import pytest

from app.http_cache import STATIC_LIST_PATHS, etag_matches

LISTS = [
    "/api/properties",
    "/api/properties/ordinais",
    "/api/classes",
    "/api/processes",
    "/api/processes/classes",
    "/api/processes/attributes",
    "/api/glossario",
    "/api/padroes",
]


def test_the_list_of_paths_is_the_one_the_screens_use():
    assert set(LISTS) == set(STATIC_LIST_PATHS)


@pytest.mark.parametrize("path", LISTS)
def test_a_static_list_carries_a_private_etag(client, path):
    resp = client.get(path)
    assert resp.status_code == 200
    assert resp.headers["etag"].startswith('W/"')
    cache_control = resp.headers["cache-control"]
    assert "private" in cache_control
    assert "public" not in cache_control
    assert "max-age=300" in cache_control
    assert "cookie" in resp.headers["vary"].lower()


@pytest.mark.parametrize("path", LISTS)
def test_the_same_etag_answers_304_without_a_body(client, path):
    first = client.get(path)
    again = client.get(path, headers={"If-None-Match": first.headers["etag"]})
    assert again.status_code == 304
    assert again.content == b""
    assert again.headers["etag"] == first.headers["etag"]
    assert "private" in again.headers["cache-control"]


def test_a_different_etag_gets_the_body(client):
    resp = client.get("/api/properties", headers={"If-None-Match": 'W/"outro"'})
    assert resp.status_code == 200
    assert resp.json()


def test_the_etag_follows_the_content(client):
    before = client.get("/api/classes").headers["etag"]
    created = client.post("/api/classes", json={"name": "Classe do teste de ETag"})
    assert created.status_code in (200, 201), created.text
    after = client.get("/api/classes", headers={"If-None-Match": before})
    assert after.status_code == 200
    assert after.headers["etag"] != before


def test_other_routes_are_left_alone(client):
    resp = client.get("/api/materials")
    assert resp.status_code == 200
    assert "etag" not in resp.headers


def test_an_error_is_never_cached(anon_client):
    resp = anon_client.get("/api/properties")
    assert resp.status_code == 401
    assert "etag" not in resp.headers
    assert "max-age" not in resp.headers.get("cache-control", "")


def test_etag_matching_follows_the_rfc():
    tag = 'W/"abc"'
    assert etag_matches(tag, 'W/"abc"')
    assert etag_matches(tag, '"abc"')  # weak comparison ignores W/
    assert etag_matches(tag, '"x", W/"abc"')
    assert etag_matches(tag, "*")
    assert not etag_matches(tag, 'W/"abd"')
    assert not etag_matches(tag, None)
    assert not etag_matches(tag, "")
