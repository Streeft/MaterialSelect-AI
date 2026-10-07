"""Production-safe reference seed never recreates demo catalogue rows."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.clear_demo import clear_demo_data
from app.db.seed import seed_reference
from app.models.battery_chemistry import BatteryChemistry
from app.models.material import Material
from app.models.process import Process
from app.models.transport_mode import TransportMode


def test_reference_seed_does_not_restore_demo_catalogue(db_session: Session) -> None:
    clear_demo_data(db_session)
    db_session.flush()

    summary = seed_reference(db_session)
    db_session.flush()

    assert summary["classes"] > 0
    assert summary["properties"] > 0
    assert (
        db_session.scalar(
            select(func.count(Material.id)).where(Material.is_demo.is_(True))
        )
        == 0
    )
    assert (
        db_session.scalar(
            select(func.count(Process.id)).where(Process.is_demo.is_(True))
        )
        == 0
    )
    assert (
        db_session.scalar(
            select(func.count(TransportMode.id)).where(TransportMode.is_demo.is_(True))
        )
        == 0
    )
    assert db_session.scalar(select(func.count(BatteryChemistry.id))) > 0
