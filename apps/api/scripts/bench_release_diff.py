"""Measure the release diff (TM7-d, D-123) on a synthetic catalogue.

Builds two releases of the same fictitious lineage in an in-memory SQLite
database — every row generated here, nothing read from a real catalogue and no
connection to any other database — and times the diff the API serves, counting
the SQL statements it issues.

Usage (from ``apps/api``)::

    python -m scripts.bench_release_diff --records 20000 --properties 40

The numbers this printed when D-123 was decided are written in
``docs/DECISIONS.md`` (D-123); re-run it before revisiting that decision.
"""

from __future__ import annotations

import argparse
import time

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.base import Base, json_serializer
from app.services.catalog_release_service import CatalogReleaseService
from app.tests.synthetic_catalog import build


def measure(records: int, properties: int) -> dict[str, float]:
    engine = create_engine("sqlite://", poolclass=StaticPool, json_serializer=json_serializer)
    Base.metadata.create_all(engine)
    statements: list[str] = []
    with Session(engine) as db:
        build(db, records=records, properties=properties)
        db.commit()
        event.listen(
            engine, "before_cursor_execute", lambda *a: statements.append(a[2]), retval=False
        )
        service = CatalogReleaseService(db)
        start = time.perf_counter()
        out = service.diff("bench-r1", "bench-r2")
        page_seconds = time.perf_counter() - start
        page_statements = len(statements)
        statements.clear()
        start = time.perf_counter()
        service.record("bench-r1", "bench-r2", "MaterialUniverse", "m-0")
        item_seconds = time.perf_counter() - start
        item_statements = len(statements)
        start = time.perf_counter()
        service.materialize_previous("bench-r2")
        db.commit()
        materialize_seconds = time.perf_counter() - start
        statements.clear()
        start = time.perf_counter()
        stored = service.diff("bench-r1", "bench-r2")
        stored_seconds = time.perf_counter() - start
        stored_statements = len(statements)
        assert stored == out, "the stored diff must answer what the rows answer"
    engine.dispose()
    return {
        "records": records,
        "properties": properties,
        "total": out.total,
        "page_seconds": page_seconds,
        "page_statements": page_statements,
        "item_seconds": item_seconds,
        "item_statements": item_statements,
        "materialize_seconds": materialize_seconds,
        "stored_seconds": stored_seconds,
        "stored_statements": stored_statements,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--records", type=int, nargs="+", default=[1000, 5000, 20000])
    parser.add_argument("--properties", type=int, default=40)
    args = parser.parse_args()
    for n in args.records:
        print(measure(n, args.properties), flush=True)


if __name__ == "__main__":
    main()
