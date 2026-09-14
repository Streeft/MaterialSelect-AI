"""Whether a ratio between two values in a unit means anything (P2)."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.calculations.units import is_ratio_scale
from app.models.property_definition import PropertyDefinition


@pytest.mark.parametrize("unit", ["kelvin", "Pa", "kg/m**3", "W/(m*K)", "dimensionless"])
def test_a_scale_with_a_true_zero_admits_a_percentage(unit: str) -> None:
    assert is_ratio_scale(unit) is True


@pytest.mark.parametrize("unit", ["degC", "degF"])
def test_a_scale_with_an_offset_does_not(unit: str) -> None:
    """20 °C is not twice 10 °C. A comparison table printing "+100%" there would
    state something false with the authority of a computed number."""
    assert is_ratio_scale(unit) is False


def test_an_unparseable_unit_is_refused_rather_than_assumed() -> None:
    """The conservative answer is the one that does not invent a percentage."""
    assert is_ratio_scale("não é unidade") is False


def test_every_canonical_unit_in_the_seeded_catalogue_admits_a_percentage(
    db_session: Session,
) -> None:
    """A canary on the catalogue rather than on the function: the day somebody
    registers a property in °C, this says so before a reader sees the number.

    It reads through the ``db_session`` fixture, like every other test here, and
    that is not incidental. The first version opened its own ``SessionLocal()``
    — reaching past the in-memory schema the suite builds, into whatever
    ``settings.database_url`` happens to point at. It passed on a developer
    machine (a stale ``materialselect.db`` sits in the working directory from an
    earlier seed) and failed on CI, where no such file exists. A test that reads
    a database the suite did not build is not testing the suite's catalogue.
    """
    units = [row[0] for row in db_session.execute(select(PropertyDefinition.canonical_unit)).all()]

    # A canary over an empty catalogue would pass while proving nothing — the
    # same trap the recents-cap test hit in P1-4.
    assert units, "o catálogo semeado precisa ter propriedades para este canário valer"
    offenders = [unit for unit in units if not is_ratio_scale(unit)]
    assert offenders == [], f"propriedade em escala sem zero verdadeiro: {offenders}"
