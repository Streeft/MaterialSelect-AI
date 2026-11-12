"""D-223: a per-minute limit, in memory, on login, AI, exports and notebook writes.

Off in every other test (``conftest._rate_limit_off``); each test here turns it
on with ``monkeypatch`` and a small limit.
"""

from __future__ import annotations

import pytest

from app.config import settings
from app.domain.errors import RateLimitedError
from app.domain.rate_limit import FixedWindowLimiter
from app.services.rate_limit_service import caller_key, check_rate_limit

# --- the counter, alone ---------------------------------------------------


def test_the_limiter_admits_up_to_the_limit_then_says_how_long_to_wait():
    limiter = FixedWindowLimiter(window_seconds=60)
    assert limiter.hit("k", 2, now=0.0) is None
    assert limiter.hit("k", 2, now=1.0) is None
    assert limiter.hit("k", 2, now=10.0) == 50
    assert limiter.hit("k", 2, now=59.5) == 1


def test_a_new_window_starts_from_zero():
    limiter = FixedWindowLimiter(window_seconds=60)
    limiter.hit("k", 1, now=0.0)
    assert limiter.hit("k", 1, now=30.0) is not None
    assert limiter.hit("k", 1, now=60.0) is None


def test_keys_are_counted_apart():
    limiter = FixedWindowLimiter(window_seconds=60)
    assert limiter.hit("a", 1, now=0.0) is None
    assert limiter.hit("b", 1, now=0.0) is None
    assert limiter.hit("a", 1, now=0.0) is not None


def test_a_zero_limit_means_no_limit():
    limiter = FixedWindowLimiter(window_seconds=60)
    for _ in range(100):
        assert limiter.hit("k", 0, now=0.0) is None


def test_closed_windows_are_pruned_when_the_table_grows(monkeypatch):
    from app.domain import rate_limit as module

    monkeypatch.setattr(module, "_PRUNE_ABOVE", 3)
    limiter = FixedWindowLimiter(window_seconds=60)
    for key in "abcd":
        limiter.hit(key, 5, now=0.0)
    limiter.hit("e", 5, now=120.0)
    assert set(limiter._windows) == {"e"}


# --- the key and the setting ----------------------------------------------


def test_a_session_counts_apart_from_its_ip_and_the_cookie_is_not_kept():
    by_session = caller_key(session_cookie="tok", client_ip="1.2.3.4", by_ip_only=False)
    assert by_session.startswith("s:")
    assert "tok" not in by_session
    assert caller_key(session_cookie=None, client_ip="1.2.3.4", by_ip_only=False) == "ip:1.2.3.4"
    assert caller_key(session_cookie="tok", client_ip="1.2.3.4", by_ip_only=True) == "ip:1.2.3.4"


def test_nothing_is_counted_when_the_limit_is_off(monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_enabled", False)
    monkeypatch.setattr(settings, "rate_limit_ai_per_minute", 1)
    for _ in range(5):
        check_rate_limit("ai", session_cookie="x", client_ip=None, now=0.0)


def test_the_refusal_is_in_portuguese_and_carries_the_wait(monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    monkeypatch.setattr(settings, "rate_limit_ai_per_minute", 1)
    check_rate_limit("ai", session_cookie="x", client_ip=None, now=0.0)
    with pytest.raises(RateLimitedError) as caught:
        check_rate_limit("ai", session_cookie="x", client_ip=None, now=15.0)
    assert caught.value.retry_after == 45
    assert "Tente de novo em 45 s" in str(caught.value)
    assert "IA" in str(caught.value)


# --- through HTTP -----------------------------------------------------------


@pytest.fixture()
def _limit_on(monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    monkeypatch.setattr(settings, "rate_limit_ai_per_minute", 2)
    monkeypatch.setattr(settings, "rate_limit_exports_per_minute", 2)
    monkeypatch.setattr(settings, "rate_limit_notebooks_per_minute", 2)
    monkeypatch.setattr(settings, "rate_limit_auth_per_minute", 2)


def _assert_429(resp) -> None:
    assert resp.status_code == 429
    assert int(resp.headers["retry-after"]) >= 1
    assert "Tente de novo" in resp.json()["detail"]


def test_ai_routes_answer_429_with_retry_after(client, _limit_on):
    assert client.get("/api/ai/status").status_code == 200
    assert client.get("/api/ai/status").status_code == 200
    _assert_429(client.get("/api/ai/status"))


def test_exports_are_limited(client, _limit_on):
    assert client.get("/api/exports/cae/formatos").status_code == 200
    assert client.get("/api/exports/cae/formatos").status_code == 200
    _assert_429(client.get("/api/exports/cae/formatos"))


def test_notebook_reads_are_free_and_writes_are_limited(client, _limit_on):
    for _ in range(5):
        assert client.get("/api/notebooks").status_code == 200
    assert client.post("/api/notebooks", json={"title": "Um"}).status_code == 201
    assert client.post("/api/notebooks", json={"title": "Dois"}).status_code == 201
    _assert_429(client.post("/api/notebooks", json={"title": "Três"}))


def test_login_is_limited_per_ip(anon_client, _limit_on):
    # 503 (OAuth not configured in tests) still counts: the limit runs first.
    assert anon_client.get("/api/auth/google/login", follow_redirects=False).status_code == 503
    assert anon_client.get("/api/auth/google/login", follow_redirects=False).status_code == 503
    _assert_429(anon_client.get("/api/auth/google/login", follow_redirects=False))
    # /me is never limited: every page asks it.
    for _ in range(5):
        assert anon_client.get("/api/auth/me").status_code == 401


def test_two_sessions_have_their_own_quota(client, _limit_on):
    client.cookies.set("msai_session", "pessoa-a")
    client.get("/api/ai/status")
    client.get("/api/ai/status")
    _assert_429(client.get("/api/ai/status"))
    client.cookies.set("msai_session", "pessoa-b")
    assert client.get("/api/ai/status").status_code == 200


def test_unlimited_routes_stay_unlimited(client, _limit_on):
    for _ in range(5):
        assert client.get("/api/properties").status_code == 200
