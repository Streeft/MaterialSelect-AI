"""The demonstration process attributes the seed installs (P0-4).

Deliberately the opposite choice from ``test_process_attributes.py``, which
builds its own namespaced universe so no assertion can drift onto seed data.
This module asserts *about the seed itself* — that the demo catalogue a reader
opens the tool on is internally consistent and exercises the two shapes of value
the engine gained. It is the only place in the suite allowed to name
``fundicao-areia``.

What it does not do is check the numbers. They are fictitious, and asserting them
would freeze invented data as a specification; what matters is that the unit trail
is complete, that absence is absence, and that a discrete value holds labels
rather than a zero.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models.enums import ProcessAttributeKind
from app.models.process import Process
from app.models.process_attribute import ProcessAttributeDefinition, ProcessAttributeValue


@pytest.fixture()
def values_by_process(db_session) -> dict[str, dict[str, ProcessAttributeValue]]:
    rows = (
        db_session.execute(
            select(ProcessAttributeValue, Process.slug, ProcessAttributeDefinition.slug)
            .join(Process, Process.id == ProcessAttributeValue.process_id)
            .join(
                ProcessAttributeDefinition,
                ProcessAttributeDefinition.id == ProcessAttributeValue.attribute_id,
            )
        )
        .tuples()
        .all()
    )
    out: dict[str, dict[str, ProcessAttributeValue]] = {}
    for value, process_slug, attribute_slug in rows:
        out.setdefault(process_slug, {})[attribute_slug] = value
    return out


def test_the_five_attributes_of_exercise_eleven_are_seeded(db_session) -> None:
    """The manual's step 2 names five; an open implementation of it seeds five."""
    attributes = db_session.execute(select(ProcessAttributeDefinition)).scalars().all()
    by_slug = {a.slug: a for a in attributes}

    assert set(by_slug) == {
        "faixa-massa",
        "espessura-secao",
        "lote-economico",
        "forma",
        "caracteristica-processo",
    }
    assert by_slug["faixa-massa"].kind is ProcessAttributeKind.ENVELOPE
    assert by_slug["espessura-secao"].kind is ProcessAttributeKind.ENVELOPE
    assert by_slug["lote-economico"].kind is ProcessAttributeKind.ESCALAR
    assert by_slug["forma"].kind is ProcessAttributeKind.DISCRETO
    assert by_slug["caracteristica-processo"].kind is ProcessAttributeKind.DISCRETO


def test_every_discrete_attribute_has_a_closed_vocabulary(db_session) -> None:
    """A discrete attribute with no vocabulary has nothing to pick from, and a
    numeric one with a vocabulary is a definition the engine cannot read."""
    for attribute in db_session.execute(select(ProcessAttributeDefinition)).scalars():
        if attribute.kind is ProcessAttributeKind.DISCRETO:
            assert attribute.allowed_labels, attribute.slug
            assert attribute.canonical_unit is None, attribute.slug
        else:
            assert not attribute.allowed_labels, attribute.slug
            assert attribute.canonical_unit, attribute.slug


def test_the_unit_trail_is_complete_on_every_seeded_number(db_session) -> None:
    """Principle 4, on the process side: original value and unit, normalised value
    and canonical unit, and the conversion method that links them."""
    rows = db_session.execute(select(ProcessAttributeValue)).scalars().all()
    numeric = [
        v
        for v in rows
        if not v.is_missing and v.attribute.kind is not ProcessAttributeKind.DISCRETO
    ]
    assert numeric  # the fixture would be vacuous otherwise

    for value in numeric:
        assert value.original_unit, value.attribute.slug
        assert value.canonical_unit == value.attribute.canonical_unit
        assert value.conversion_method, value.attribute.slug
        assert value.normalized_value is not None


def test_an_envelope_stores_its_bounds_in_canonical_units(values_by_process) -> None:
    """3 a 120 mm becomes 0,003 a 0,12 m, and it is the **bounds** that are stored
    — in a capability range they are what a threshold is compared against."""
    thickness = values_by_process["fundicao-areia"]["espessura-secao"]

    assert (thickness.value_min, thickness.value_max) == (3.0, 120.0)
    assert thickness.original_unit == "mm"
    assert thickness.normalized_min == pytest.approx(0.003)
    assert thickness.normalized_max == pytest.approx(0.12)
    assert thickness.canonical_unit == "m"
    assert thickness.conversion_method == "pint:mm->m"


def test_a_discrete_value_holds_labels_and_is_not_marked_missing(values_by_process) -> None:
    """It has no number, which is not the same as having no value — marking it
    missing would make it invisible to a criterion that asks about it."""
    shape = values_by_process["fundicao-areia"]["forma"]

    assert shape.labels
    assert shape.is_missing is False
    assert shape.value_scalar is None
    assert shape.normalized_value is None


def test_every_seeded_label_comes_from_its_attribute_vocabulary(db_session) -> None:
    """A label outside the vocabulary is unreachable by the picker, so it would be
    a value nobody can ever select on — the seed's own version of a typo."""
    for value in db_session.execute(select(ProcessAttributeValue)).scalars():
        if not value.labels:
            continue
        allowed = set(value.attribute.allowed_labels)
        assert set(value.labels) <= allowed, (value.attribute.slug, value.labels)


def test_absence_is_seeded_in_both_of_its_shapes(values_by_process) -> None:
    """Two different states of the catalogue, and the demo data has both.

    ``pintura`` has a mass row that says the value was never established;
    ``parafusamento`` has no mass row at all. A reader must not be able to tell
    either apart from a zero, because neither is one.
    """
    pintura = values_by_process["pintura"]["faixa-massa"]
    assert pintura.is_missing is True
    assert pintura.value_min is None
    assert pintura.normalized_value is None

    assert "faixa-massa" not in values_by_process["parafusamento"]


def test_the_seeded_catalogue_answers_the_exercise(client) -> None:
    """End to end over the demo data: "which processes shape a 50 kg part".

    Both states of absence have to stay out of the answer, and a process whose
    envelope reaches 50 kg has to be in it — which is the whole point of the
    reach rule over a capability range.
    """
    resp = client.post(
        "/api/selection/filter",
        json={
            "universe": "process",
            "stages": [
                {
                    "kind": "limit",
                    "constraints": [
                        {"operator": "gte", "property_slug": "faixa-massa", "value": 50.0}
                    ],
                }
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    names = {c["name"] for c in resp.json()["candidates"]}

    assert "Fundição em areia" in names  # reaches 400 kg
    assert "Pintura" not in names  # value explicitly missing
    assert "Parafusamento" not in names  # no value at all
    assert "Prensagem e sinterização" not in names  # reaches only 4 kg
