"""The pure diff between two catalogue releases (D-107): every rule, without a database.

The snapshots here are fictitious and minimal on purpose: each test builds the
two sides of exactly one situation, so a failure names the rule that broke.
"""

from __future__ import annotations

import pytest

from app.domain.display_units import Reading
from app.domain.errors import ValidationError
from app.domain.release_diff import (
    ChangeKind,
    PropertyInfo,
    RecordSnapshot,
    RecordStatus,
    ReleaseIdentity,
    ValueSnapshot,
    ValueState,
    canonical_numbers,
    compare_values,
    count_by_class,
    count_by_status,
    diff_releases,
    ensure_comparable,
    filter_diffs,
    paginate,
    parse_status,
    value_view,
)

DENSITY = PropertyInfo("densidade", "Densidade", "kg/m**3")
TEMPERATURE = PropertyInfo("temp_minima", "Temperatura mínima", "K")
PROPERTIES = {p.slug: p for p in (DENSITY, TEMPERATURE)}


def scalar(value: float, unit: str, canonical: float, canonical_unit: str = "kg/m**3"):
    return ValueSnapshot(
        is_missing=False,
        value_scalar=value,
        original_unit=unit,
        normalized_value=canonical,
        canonical_unit=canonical_unit,
        conversion_method=f"pint:{unit}->{canonical_unit}",
    )


MISSING = ValueSnapshot(is_missing=True)


def record(
    external_id: str, name: str = "Liga Fictícia", **values: ValueSnapshot
) -> RecordSnapshot:
    return RecordSnapshot(
        external_table="MaterialUniverse",
        external_record_id=external_id,
        raw_record_sha256="a" * 64,
        material_id=hash(external_id) % 10_000,
        name=name,
        class_slug="metais",
        class_name="Metais",
        values=values,
    )


# -- compare_values --------------------------------------------------------------


def test_the_same_quantity_in_another_unit_is_a_change_of_writing_not_of_value() -> None:
    before = scalar(7850.0, "kg/m**3", 7850.0)
    after = scalar(7.85, "g/cm**3", 7850.000000000001)
    assert compare_values(before, after, "kg/m**3") is ChangeKind.WRITING


def test_a_different_canonical_number_is_a_value_change_even_across_units() -> None:
    before = scalar(7850.0, "kg/m**3", 7850.0)
    after = scalar(7.9, "g/cm**3", 7900.0)
    assert compare_values(before, after, "kg/m**3") is ChangeKind.VALUE


def test_identical_values_are_no_change() -> None:
    value = scalar(7850.0, "kg/m**3", 7850.0)
    assert compare_values(value, value, "kg/m**3") is None
    assert compare_values(None, None, "kg/m**3") is None
    assert compare_values(MISSING, MISSING, "kg/m**3") is None


@pytest.mark.parametrize(
    ("before", "after"),
    [
        (MISSING, scalar(2700.0, "kg/m**3", 2700.0)),
        (scalar(2700.0, "kg/m**3", 2700.0), MISSING),
        (None, scalar(2700.0, "kg/m**3", 2700.0)),
        (scalar(2700.0, "kg/m**3", 2700.0), None),
        (None, MISSING),
        (MISSING, None),
    ],
)
def test_appearing_or_disappearing_is_a_change_of_presence(before, after) -> None:
    assert compare_values(before, after, "kg/m**3") is ChangeKind.PRESENCE


def test_a_missing_value_is_never_read_as_zero() -> None:
    """A real zero and a declared absence are two different states — never equal."""
    zero = ValueSnapshot(
        is_missing=False,
        value_scalar=0.0,
        original_unit="K",
        normalized_value=0.0,
        canonical_unit="K",
    )
    assert compare_values(MISSING, zero, "K") is ChangeKind.PRESENCE
    assert canonical_numbers(MISSING, "K") is None
    assert canonical_numbers(None, "K") is None
    # A row with no number that does not declare itself missing is still missing.
    assert ValueSnapshot(is_missing=False).state is ValueState.MISSING


def test_single_value_to_range_is_a_change_of_form() -> None:
    before = scalar(7850.0, "kg/m**3", 7850.0)
    after = ValueSnapshot(
        is_missing=False,
        value_min=7800.0,
        value_max=7900.0,
        value_typical=7850.0,
        original_unit="kg/m**3",
        normalized_value=7850.0,
        canonical_unit="kg/m**3",
    )
    assert compare_values(before, after, "kg/m**3") is ChangeKind.FORM


def test_a_range_compares_its_bounds_in_canonical_units() -> None:
    def interval(lo: float, hi: float, unit: str, typical: float) -> ValueSnapshot:
        return ValueSnapshot(
            is_missing=False,
            value_min=lo,
            value_max=hi,
            value_typical=typical,
            original_unit=unit,
            normalized_value=None,
            canonical_unit="kg/m**3",
        )

    same = interval(7.8, 7.9, "g/cm**3", 7.85)
    assert (
        compare_values(interval(7800, 7900, "kg/m**3", 7850), same, "kg/m**3") is ChangeKind.WRITING
    )
    wider = interval(7.7, 7.9, "g/cm**3", 7.85)
    assert compare_values(same, wider, "kg/m**3") is ChangeKind.VALUE


def test_an_offset_scale_is_converted_not_scaled() -> None:
    """−40 °C and 233,15 K are the same temperature; −40 K is not one at all."""
    celsius = scalar(-40.0, "degC", 233.15, "K")
    kelvin = scalar(233.15, "K", 233.15, "K")
    assert compare_values(celsius, kelvin, "K") is ChangeKind.WRITING
    colder = scalar(-50.0, "degC", 223.15, "K")
    assert compare_values(celsius, colder, "K") is ChangeKind.VALUE


def test_uncertainty_is_compared_as_a_difference() -> None:
    """±5 °C is ±5 K: equal uncertainties in two units are no change."""
    base = scalar(-40.0, "degC", 233.15, "K")
    with_c = ValueSnapshot(**{**base.__dict__, "uncertainty": 5.0})
    with_k = ValueSnapshot(
        **{
            **scalar(233.15, "K", 233.15, "K").__dict__,
            "uncertainty": 5.0,
        }
    )
    assert canonical_numbers(with_c, "K").uncertainty == pytest.approx(5.0)
    # Written differently (unit), same physics, same uncertainty.
    assert compare_values(with_c, with_k, "K") is ChangeKind.WRITING
    wider = ValueSnapshot(**{**base.__dict__, "uncertainty": 6.0})
    assert compare_values(with_c, wider, "K") is ChangeKind.METADATA


# -- diff_releases ---------------------------------------------------------------


def test_records_are_matched_by_external_identity_never_by_name() -> None:
    base = [record("mat-1", "Aço Fictício"), record("mat-2", "Nome repetido")]
    target = [record("mat-1", "Aço Fictício renomeado"), record("mat-3", "Nome repetido")]
    diffs = {d.external_record_id: d for d in diff_releases(base, target, PROPERTIES)}

    assert diffs["mat-1"].status is RecordStatus.CHANGED
    assert [(c.field, c.before_text, c.after_text) for c in diffs["mat-1"].changes] == [
        ("nome", "Aço Fictício", "Aço Fictício renomeado")
    ]
    # Same name, different identity: one left, another arrived.
    assert diffs["mat-2"].status is RecordStatus.REMOVED
    assert diffs["mat-3"].status is RecordStatus.NEW


def test_every_status_and_the_deterministic_order() -> None:
    base = [
        record("same", "B", densidade=scalar(1000, "kg/m**3", 1000)),
        record("gone", "A"),
        record("changed", "Z", densidade=scalar(1000, "kg/m**3", 1000)),
    ]
    target = [
        record("changed", "Z", densidade=scalar(2000, "kg/m**3", 2000)),
        record("same", "B", densidade=scalar(1000, "kg/m**3", 1000)),
        record("new", "C"),
    ]
    diffs = diff_releases(base, target, PROPERTIES)
    assert [(d.status, d.external_record_id) for d in diffs] == [
        (RecordStatus.CHANGED, "changed"),
        (RecordStatus.NEW, "new"),
        (RecordStatus.REMOVED, "gone"),
        (RecordStatus.UNCHANGED, "same"),
    ]
    assert count_by_status(diffs) == {
        RecordStatus.CHANGED: 1,
        RecordStatus.NEW: 1,
        RecordStatus.REMOVED: 1,
        RecordStatus.UNCHANGED: 1,
    }
    # The same input in another order gives the same answer.
    assert diff_releases(list(reversed(base)), list(reversed(target)), PROPERTIES) == diffs


def test_a_changed_raw_hash_alone_does_not_make_a_record_changed() -> None:
    old = record("mat-1")
    new = RecordSnapshot(**{**old.__dict__, "raw_record_sha256": "b" * 64})
    (diff,) = diff_releases([old], [new], PROPERTIES)
    assert diff.status is RecordStatus.UNCHANGED
    assert diff.raw_record_changed is True


def test_a_duplicate_identity_inside_one_release_is_refused() -> None:
    with pytest.raises(ValueError, match="repetida"):
        diff_releases([record("x"), record("x")], [], PROPERTIES)


def test_class_counts_and_filter_see_both_sides_of_a_move() -> None:
    old = record("moved")
    new = RecordSnapshot(**{**old.__dict__, "class_slug": "ceramicas", "class_name": "Cerâmicas"})
    diffs = diff_releases([old, record("stay")], [new, record("stay")], PROPERTIES)
    counts = {c.slug: c.count for c in count_by_class(diffs)}
    assert counts == {"ceramicas": 1, "metais": 2}
    assert [d.external_record_id for d in filter_diffs(diffs, class_slug="ceramicas")] == ["moved"]
    assert {d.external_record_id for d in filter_diffs(diffs, class_slug="metais")} == {
        "moved",
        "stay",
    }
    (move,) = filter_diffs(diffs, status=RecordStatus.CHANGED)
    assert (move.changes[0].field, move.changes[0].before_text, move.changes[0].after_text) == (
        "classe",
        "Metais",
        "Cerâmicas",
    )


# -- the reading view ------------------------------------------------------------


def test_value_view_keeps_the_three_units_and_writes_absence() -> None:
    reading = Reading(unit="degC", canonical_unit="K")
    view = value_view(scalar(-40.0, "degC", 233.15, "K"), reading)
    assert view.state is ValueState.SCALAR
    assert view.original.value == -40.0 and view.original.unit == "degC"
    assert view.canonical.value == pytest.approx(233.15) and view.canonical.unit == "K"
    assert view.reading.value == pytest.approx(-40.0) and view.reading.unit == "degC"

    for absent, state in ((None, ValueState.NOT_REGISTERED), (MISSING, ValueState.MISSING)):
        view = value_view(absent, reading)
        assert view.state is state
        assert view.original is None and view.canonical is None and view.reading is None
        assert "0" not in view.state_label


# -- refusals --------------------------------------------------------------------


def test_only_two_releases_of_one_catalogue_are_comparable() -> None:
    a = ReleaseIdentity("r1", "catalogo", False)
    ensure_comparable(a, ReleaseIdentity("r2", "catalogo", False))
    with pytest.raises(ValidationError, match="duas releases diferentes"):
        ensure_comparable(a, a)
    with pytest.raises(ValidationError, match="catálogos diferentes"):
        ensure_comparable(a, ReleaseIdentity("x1", "outro", False))
    with pytest.raises(ValidationError, match="não declara"):
        ensure_comparable(a, ReleaseIdentity("x1", None, False))
    with pytest.raises(ValidationError, match="fictícia"):
        ensure_comparable(a, ReleaseIdentity("r2", "catalogo", True))


def test_status_parsing_and_pagination_refuse_in_portuguese() -> None:
    assert parse_status(None) is None and parse_status("novo") is RecordStatus.NEW
    with pytest.raises(ValidationError, match="Admitidos: alterado, novo"):
        parse_status("removido")

    diffs = diff_releases([], [record(str(i)) for i in range(5)], PROPERTIES)
    page = paginate(diffs, 3, 2)
    assert (page.page_count, page.total, len(page.items)) == (3, 5, 1)
    assert paginate([], 1, 50).page_count == 1
    for page_number, size, message in ((4, 2, "não existe"), (0, 2, "inválida"), (1, 0, "1 a 200")):
        with pytest.raises(ValidationError, match=message):
            paginate(diffs, page_number, size)
    with pytest.raises(ValidationError, match="1 a 200"):
        paginate(diffs, 1, 201)
