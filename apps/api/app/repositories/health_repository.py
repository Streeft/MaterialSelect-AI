"""The one query the deep health check runs (D-223)."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session


class HealthRepository:
    """A round trip to the database and nothing else."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def ping(self) -> None:
        """Run ``SELECT 1``; raises the driver's error when the database is away."""
        self.db.execute(text("SELECT 1")).scalar_one()
