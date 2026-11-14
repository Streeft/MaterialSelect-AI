"""The AI memos are bounded in size and in time (D-224, D-228; checked by D-231).

They live in the one API process for its whole life, so an unbounded one would
grow with every distinct question until the VM ran out of memory.
"""

from __future__ import annotations

import time

from app.services import ai_service
from app.services.ai_service import _TTLCache


def test_the_least_recently_used_entry_is_the_one_dropped() -> None:
    cache = _TTLCache(max_entries=2)
    cache.put("a", 1, ttl=60)
    cache.put("b", 2, ttl=60)
    assert cache.get("a") == 1  # "a" is now the most recent
    cache.put("c", 3, ttl=60)
    assert cache.get("b") is None
    assert (cache.get("a"), cache.get("c")) == (1, 3)


def test_an_entry_expires_after_its_ttl(monkeypatch) -> None:
    cache = _TTLCache(max_entries=4)
    now = time.monotonic()
    monkeypatch.setattr(ai_service.time, "monotonic", lambda: now)
    cache.put("a", 1, ttl=10)
    assert cache.get("a") == 1
    monkeypatch.setattr(ai_service.time, "monotonic", lambda: now + 11)
    assert cache.get("a") is None
    assert len(cache._items) == 0


def test_a_zero_ttl_stores_nothing() -> None:
    cache = _TTLCache(max_entries=4)
    cache.put("a", 1, ttl=0)
    assert cache.get("a") is None


def test_every_process_wide_ai_memo_has_a_small_ceiling() -> None:
    memos = [
        ai_service._CONTEXT_CACHE,
        ai_service._RANGE_CACHE,
        ai_service._PLAN_CACHE,
        ai_service._SUGGEST_CACHE,
    ]
    assert all(isinstance(memo, _TTLCache) for memo in memos)
    assert all(0 < memo._max <= 1024 for memo in memos)
