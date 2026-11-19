"""A page on another origin can read the file name of a download (D-249)."""

from __future__ import annotations

from app.config import settings


def test_the_content_disposition_of_a_download_is_readable_cross_origin(client):
    origin = settings.cors_origins_list[0]
    response = client.get("/api/exports/catalogo.csv", headers={"Origin": origin})
    assert response.status_code == 200, response.text
    assert "filename=" in response.headers["content-disposition"]
    exposed = response.headers.get("access-control-expose-headers", "")
    assert "content-disposition" in exposed.lower()
