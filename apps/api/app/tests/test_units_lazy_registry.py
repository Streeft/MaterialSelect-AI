"""The unit registry is built on first use, once, even under threads (D-237)."""

from __future__ import annotations

import subprocess
import sys
import threading
from pathlib import Path

import pytest

from app.calculations import units

API_ROOT = Path(__file__).resolve().parents[2]


def test_booting_the_app_does_not_build_the_registry() -> None:
    """A fresh process that imports the whole app has not parsed Pint's units."""
    code = (
        "import app.main\n"
        "import app.calculations.units as u\n"
        "assert u._registry is None, 'registry built at import'\n"
        "u.to_canonical(1.0, 'GPa', 'Pa')\n"
        "assert u._registry is not None\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", code], cwd=API_ROOT, capture_output=True, text=True, timeout=120
    )
    assert result.returncode == 0, result.stderr


def test_concurrent_first_uses_share_one_registry(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(units, "_registry", None)
    seen: list[object] = []
    barrier = threading.Barrier(8)

    def first_use() -> None:
        barrier.wait()
        seen.append(units.get_registry())

    threads = [threading.Thread(target=first_use) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert len(seen) == 8
    assert all(registry is seen[0] for registry in seen)


def test_ureg_stays_a_module_attribute_for_the_same_registry() -> None:
    from app.calculations.units import ureg

    assert ureg is units.get_registry()
    with pytest.raises(AttributeError):
        units.not_a_thing  # noqa: B018
