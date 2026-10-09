"""One list of axis quantities, in the domain, and the database follows it (D-106, TM4-f).

``app.domain.curve_quantities.QUANTITIES`` is the single source of truth. The
ORM model builds its ``CHECK`` from it, but a migration is frozen text: the
``CHECK`` written by revision ``0925e0787863`` names the quantities of the day.
A quantity added to the domain without a new migration would leave the model
(and every ``create_all`` test database) accepting what a real database
refuses — a failure that only shows up in production. These tests run the real
migrations to ``head`` and compare, so that divergence fails here, in CI.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config

from alembic import command
from app.config import settings
from app.db.base import Base
from app.domain.curve_quantities import QUANTITIES
from app.models import material_curve  # noqa: F401  (registers the tables)

COLUMNS = {
    "ck_material_curve_x_quantity": "x_quantity",
    "ck_material_curve_y_quantity": "y_quantity",
    "ck_material_curve_parameter_quantity": "parameter_quantity",
}
HOW_TO_FIX = (
    "Uma grandeza de eixo foi acrescentada ou removida em app/domain/curve_quantities.py "
    "sem migração: gere uma com `alembic revision --autogenerate` que recrie os três CHECKs "
    "ck_material_curve_{x,y,parameter}_quantity (batch_alter_table, portável)."
)


def _quoted(text: str) -> set[str]:
    return set(re.findall(r"'([^']+)'", text))


def _checks(engine: sa.Engine) -> dict[str, set[str]]:
    found: dict[str, set[str]] = {}
    for check in sa.inspect(engine).get_check_constraints("material_curve"):
        if check["name"] in COLUMNS:
            found[check["name"]] = _quoted(check["sqltext"])
    return found


@pytest.fixture()
def migrated_engine(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    url = f"sqlite:///{tmp_path / 'quantities.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "head")
    engine = sa.create_engine(url)
    try:
        yield engine
    finally:
        engine.dispose()


def test_migrated_check_lists_exactly_the_domain_quantities(migrated_engine: sa.Engine) -> None:
    found = _checks(migrated_engine)
    assert set(found) == set(COLUMNS), "um CHECK de grandeza sumiu da migração"
    for name, quantities in found.items():
        assert quantities == set(QUANTITIES), f"{name}: {HOW_TO_FIX}"


def test_model_check_matches_migrated_check(migrated_engine: sa.Engine) -> None:
    table = Base.metadata.tables["material_curve"]
    model = {
        c.name: _quoted(str(c.sqltext))
        for c in table.constraints
        if isinstance(c, sa.CheckConstraint) and c.name in COLUMNS
    }
    assert model == _checks(migrated_engine), HOW_TO_FIX


def test_every_quantity_key_is_a_plain_identifier() -> None:
    # The CHECK is built by interpolating the keys; a quote would break it.
    for key in QUANTITIES:
        assert re.fullmatch(r"[a-z_]+", key), key
