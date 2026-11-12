"""``folded(column)``: the column lowercased and without accents, in SQL (D-215).

PostgreSQL has ``translate``, and the table of letters is bound to it as
parameters. SQLite (tests, local development) has neither ``translate`` nor a
``lower()`` that knows "Ç", and a chain of ``replace`` calls overflows its
parser; there the same Python function the palette uses is registered on every
new connection as ``ms_fold``. Both read the table from
``app.domain.text_fold``, so the two databases fold alike.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from sqlalchemy import String, event, func, literal
from sqlalchemy.engine import Engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.sql.functions import FunctionElement

from app.domain.text_fold import ACCENTED, PLAIN, fold_accents

SQLITE_FUNCTION = "ms_fold"


class folded(FunctionElement):  # noqa: N801 - reads like the SQL function it stands for
    """``lower(<column> without accents)``; one argument."""

    type = String()
    inherit_cache = True
    name = "folded"


@compiles(folded, "postgresql")
def _folded_postgresql(element: folded, compiler: Any, **kw: Any) -> str:
    (arg,) = element.clauses
    expr = func.lower(func.translate(arg, literal(ACCENTED), literal(PLAIN)))
    return compiler.process(expr, **kw)


@compiles(folded)
def _folded_default(element: folded, compiler: Any, **kw: Any) -> str:
    (arg,) = element.clauses
    return compiler.process(getattr(func, SQLITE_FUNCTION)(arg), **kw)


def _sqlite_fold(value: object) -> str | None:
    return None if value is None else fold_accents(str(value))


@event.listens_for(Engine, "connect")
def _register_sqlite_fold(dbapi_connection: Any, _record: Any) -> None:
    """Teach every new SQLite connection ``ms_fold``; other drivers are left alone."""
    if isinstance(dbapi_connection, sqlite3.Connection):
        dbapi_connection.create_function(SQLITE_FUNCTION, 1, _sqlite_fold, deterministic=True)
