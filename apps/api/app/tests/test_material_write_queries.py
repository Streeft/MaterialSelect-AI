"""D-223: writing a material's values costs the same few queries for 2 or 8 values.

Before, every value looked its property up by slug, and every value with a
source looked the source up by label: two queries per value, so a material
with 20 properties paid 40 round trips (N+1). The definitions and the sources
are now read once per call. The counter listens on the engine and counts the
lookups of those two tables; the inserts themselves are one row each on
SQLite and batched by the driver on PostgreSQL.
"""

from __future__ import annotations

from contextlib import contextmanager

import pytest
from sqlalchemy import event, select

from app.models.material_class import MaterialClass
from app.models.property_definition import PropertyDefinition
from app.schemas.material import MaterialCreate, PropertyValueIn
from app.services.material_service import MaterialService


@contextmanager
def _count_statements(db_session):
    engine = db_session.get_bind().engine
    statements: list[str] = []

    def _before(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", _before)
    try:
        yield statements
    finally:
        event.remove(engine, "before_cursor_execute", _before)


def _missing_values(definitions, *, with_source: bool) -> list[PropertyValueIn]:
    # "missing" needs no unit: the count does not depend on conversions.
    return [
        PropertyValueIn(
            property_slug=d.slug,
            kind="missing",
            source_label=f"Fonte do teste {i % 2}" if with_source else None,
        )
        for i, d in enumerate(definitions)
    ]


@pytest.fixture()
def definitions(db_session):
    rows = db_session.execute(select(PropertyDefinition).order_by(PropertyDefinition.id))
    found = list(rows.scalars().all())
    assert len(found) >= 8
    return found[:8]


@pytest.fixture()
def class_id(db_session):
    return db_session.execute(select(MaterialClass.id).limit(1)).scalar_one()


def _create(db_session, class_id, values, name):
    service = MaterialService(db_session)
    payload = MaterialCreate(name=name, class_id=class_id, values=values)
    with _count_statements(db_session) as statements:
        service.create_material(payload)
    return statements


def _lookups(statements, table: str) -> int:
    return sum(
        1 for s in statements if s.lstrip().upper().startswith("SELECT") and f"FROM {table}" in s
    )


@pytest.mark.parametrize("with_source", [False, True])
def test_create_reads_definitions_and_sources_once_whatever_the_count(
    db_session, definitions, class_id, with_source
):
    two = _create(
        db_session, class_id, _missing_values(definitions[:2], with_source=with_source), "Lote 2"
    )
    eight = _create(
        db_session, class_id, _missing_values(definitions, with_source=with_source), "Lote 8"
    )

    assert _lookups(eight, "property_definition") == _lookups(two, "property_definition")
    assert _lookups(eight, "source") == _lookups(two, "source")


def test_replacing_values_does_not_grow_with_the_number_of_values(
    db_session, definitions, class_id
):
    service = MaterialService(db_session)
    created = service.create_material(
        MaterialCreate(name="Lote troca", class_id=class_id, values=[])
    )

    with _count_statements(db_session) as two:
        service.replace_property_values(
            created.id, _missing_values(definitions[:2], with_source=True)
        )
    with _count_statements(db_session) as eight:
        service.replace_property_values(created.id, _missing_values(definitions, with_source=True))

    assert _lookups(eight, "property_definition") == _lookups(two, "property_definition")
    assert _lookups(eight, "source") == _lookups(two, "source")


def test_an_unknown_slug_is_still_refused_by_name(db_session, definitions, class_id):
    from app.domain.errors import NotFoundError

    values = [*_missing_values(definitions[:1], with_source=False)]
    values.append(PropertyValueIn(property_slug="nao-existe", kind="missing"))
    with pytest.raises(NotFoundError, match="nao-existe"):
        MaterialService(db_session).create_material(
            MaterialCreate(name="Lote recusado", class_id=class_id, values=values)
        )


def test_a_new_source_label_is_created_once_and_shared(db_session, definitions, class_id):
    from app.models.source import Source

    values = [
        PropertyValueIn(property_slug=d.slug, kind="missing", source_label="Fonte única nova")
        for d in definitions[:3]
    ]
    detail = MaterialService(db_session).create_material(
        MaterialCreate(name="Lote fonte", class_id=class_id, values=values)
    )
    rows = db_session.execute(select(Source).where(Source.label == "Fonte única nova"))
    assert len(rows.scalars().all()) == 1
    assert detail.id is not None
