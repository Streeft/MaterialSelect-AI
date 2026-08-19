"""Reset the end-to-end database, apply migrations, seed it, and serve.

Used only by the Playwright suite (``apps/web/e2e/playwright.config.ts``),
which spawns this with ``DATABASE_URL`` and the other settings already in its
environment — this script does not invent any of them, it just sequences
three steps that would otherwise be three separate webServer commands.

The database is deleted and rebuilt on every run, not reused. Each e2e run
imports its own fictitious materials (see ``e2e/golden-path.spec.ts``), and a
suite that appended to a growing file would keep counting the previous run's
rows into "quantos candidatos restam" — a live measurement quietly turning
into an accumulating one.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def main() -> None:
    database_url = os.environ["DATABASE_URL"]
    if not database_url.startswith("sqlite:///"):
        raise RuntimeError(
            f"e2e_server.py only knows how to reset a sqlite file, got {database_url!r}"
        )
    db_file = Path(database_url.removeprefix("sqlite:///"))
    db_file.parent.mkdir(parents=True, exist_ok=True)
    db_file.unlink(missing_ok=True)

    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True)
    subprocess.run([sys.executable, "-m", "app.db.seed"], check=True)

    port = os.environ.get("E2E_API_PORT", "8811")
    subprocess.run(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", port],
        check=False,
    )


if __name__ == "__main__":
    main()
