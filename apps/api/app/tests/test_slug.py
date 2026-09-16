"""Tests for the slug helper."""

from __future__ import annotations

import pytest

from app.domain.slug import slugify


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Módulo de Young", "modulo-de-young"),
        ("Custo por massa", "custo-por-massa"),
        ("  Aço  Inox  ", "aco-inox"),
        ("Resistência à Tração", "resistencia-a-tracao"),
        ("A/B (teste)", "a-b-teste"),
        ("Polímero-C", "polimero-c"),
    ],
)
def test_slugify(text: str, expected: str) -> None:
    assert slugify(text) == expected
