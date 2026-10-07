"""Production-safe seed for reusable non-demo reference data.

This module exists so production can maintain taxonomies, property definitions
and real reference catalogues without ever recreating the fictional demo
materials/processes/transport modes after the official catalogue cutover.
"""

from __future__ import annotations

from app.db.base import Base, SessionLocal, engine
from app.db.seed import seed_reference


def main() -> None:
    """Apply the reference seed and print the created/ensured categories."""
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        summary = seed_reference(db)
        db.commit()
    print(f"[seed_reference] Concluído: {summary}")


if __name__ == "__main__":
    main()
