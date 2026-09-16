"""Backfill MaterialKeyword rows from existing Material.keywords JSON (B5).

Populates the material_keyword indexed association table for all materials that
existed before the B5 migration. Idempotent: safe to run multiple times.

Run after `alembic upgrade head` on a database with existing Material rows:

    python scripts/backfill_material_keywords.py
"""

from __future__ import annotations

import sys
from pathlib import Path

# Add the parent directory to the Python path so we can import app modules
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.orm import Session

from app.db.base import engine
from app.models.material import Material
from app.repositories.material_repository import MaterialRepository


def main() -> None:
    """Backfill MaterialKeyword rows for all materials with keywords."""

    with Session(engine) as db:
        materials = db.query(Material).all()
        repo = MaterialRepository(db)

        count = 0
        for material in materials:
            keywords = material.keywords or []
            if keywords:
                repo.sync_keywords(material.id, keywords)
                count += 1

        db.commit()
        print(f"[backfill] synced keywords for {count} materials.")


if __name__ == "__main__":
    main()
