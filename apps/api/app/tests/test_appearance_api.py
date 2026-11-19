"""The account's appearance: ``GET/PUT /api/me/appearance`` (D-249).

Colour, contrast, motion and the side rail follow the person between devices. One row per user,
written whole; never saved reads back as the defaults with ``saved: false`` (so a device with a
local choice can tell and offer it); a value outside the closed sets is a 422; another account's
choice is not reachable, because nothing takes an id.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models.user_appearance import UserAppearance

DEFAULTS = {"color": "route", "contrast": "standard", "motion": "standard", "rail": "dark"}
CHOSEN = {"color": "verde-azulado", "contrast": "high", "motion": "reduced", "rail": "light"}


def test_a_new_account_reads_the_defaults_and_says_nothing_was_saved(client):
    body = client.get("/api/me/appearance").json()
    assert body == {**DEFAULTS, "saved": False, "updated_at": None}


def test_put_stores_the_whole_choice_and_get_reads_it_back(client, db_session):
    saved = client.put("/api/me/appearance", json=CHOSEN)
    assert saved.status_code == 200, saved.text
    assert saved.json()["saved"] is True and saved.json()["updated_at"]
    assert {k: saved.json()[k] for k in CHOSEN} == CHOSEN

    again = client.get("/api/me/appearance").json()
    assert {k: again[k] for k in CHOSEN} == CHOSEN and again["saved"] is True
    row = db_session.execute(select(UserAppearance)).scalars().one()
    assert (row.color, row.contrast, row.motion, row.rail) == tuple(CHOSEN.values())


def test_a_second_put_replaces_the_row_instead_of_adding_one(client, db_session):
    client.put("/api/me/appearance", json=CHOSEN)
    client.put("/api/me/appearance", json={**CHOSEN, "color": "rosa", "motion": "standard"})
    rows = db_session.execute(select(UserAppearance)).scalars().all()
    assert len(rows) == 1 and rows[0].color == "rosa" and rows[0].motion == "standard"
    assert rows[0].contrast == "high"


def test_a_field_left_out_goes_back_to_its_default_the_write_is_whole(client):
    client.put("/api/me/appearance", json=CHOSEN)
    reply = client.put("/api/me/appearance", json={"color": "azul"}).json()
    assert reply["color"] == "azul"
    assert (reply["contrast"], reply["motion"], reply["rail"]) == (
        "standard",
        "standard",
        "dark",
    )


@pytest.mark.parametrize(
    "body",
    [
        {**DEFAULTS, "color": "magenta"},
        {**DEFAULTS, "contrast": "extreme"},
        {**DEFAULTS, "motion": "none"},
        {**DEFAULTS, "rail": "blue"},
        {**DEFAULTS, "theme": "dark"},
    ],
)
def test_a_value_outside_the_closed_sets_is_refused_and_stores_nothing(client, db_session, body):
    assert client.put("/api/me/appearance", json=body).status_code == 422
    assert db_session.execute(select(UserAppearance)).first() is None


def test_each_account_has_its_own_choice(client, other_user, login_as):
    client.put("/api/me/appearance", json=CHOSEN)
    with login_as(other_user):
        assert client.get("/api/me/appearance").json()["saved"] is False
        client.put("/api/me/appearance", json={**DEFAULTS, "color": "terracota"})
        assert client.get("/api/me/appearance").json()["color"] == "terracota"
    assert client.get("/api/me/appearance").json()["color"] == "verde-azulado"


def test_it_needs_a_login(anon_client):
    assert anon_client.get("/api/me/appearance").status_code == 401
    assert anon_client.put("/api/me/appearance", json=DEFAULTS).status_code == 401


def test_the_choice_goes_away_with_the_account(client, db_session, test_user):
    client.put("/api/me/appearance", json=CHOSEN)
    # ``ON DELETE CASCADE``: the row belongs to the user. SQLite enforces it with the pragma the
    # app sets on connect; the ORM-level check here is that the foreign key is declared.
    (fk,) = UserAppearance.__table__.foreign_keys
    assert fk.column.table.name == "user" and fk.ondelete == "CASCADE"
