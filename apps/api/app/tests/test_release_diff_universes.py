"""TM7-c/e/f/g: the other universes, the active flag, one-sided ranges, defensive errors.

Pure domain cases first (each builds the two sides of one situation), then one
end-to-end test over rows written straight into the database, because the
importer cannot yet write a second release with processes (TM7-a).
"""

from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from app.domain.display_units import Reading
from app.domain.errors import ValidationError
from app.domain.release_diff import (
    ChangeKind,
    CompositionSnapshot,
    CurvePointSnapshot,
    CurveSeriesSnapshot,
    CurveSnapshot,
    PropertyInfo,
    RecordSnapshot,
    RecordStatus,
    Universe,
    ValueSnapshot,
    ValueState,
    compare_values,
    count_by_universe,
    diff_releases,
    filter_diffs,
    parse_universe,
    value_view,
)
from app.models import (
    CatalogDataset,
    CatalogRecordRef,
    Material,
    MaterialClass,
    Process,
    ProcessAttributeDefinition,
    ProcessAttributeKind,
    ProcessAttributeValue,
    ProcessClass,
    Source,
    TransportMode,
)
from app.models.enums import CurveKind, DataQuality
from app.models.material_composition import MaterialCompositionEntry
from app.models.material_curve import MaterialCurve, MaterialCurvePoint, MaterialCurveSeries
from app.services.catalog_release_service import CatalogReleaseService

DENSITY = PropertyInfo("densidade", "Densidade", "kg/m**3")


def interval(normalized: float | None, **kw) -> ValueSnapshot:
    return ValueSnapshot(
        is_missing=False,
        value_min=kw.get("low"),
        value_max=kw.get("high"),
        value_typical=kw.get("typical"),
        original_unit="kg/m**3",
        normalized_value=normalized,
        canonical_unit="kg/m**3",
    )


def scalar(value: float, unit: str = "kg/m**3") -> ValueSnapshot:
    return ValueSnapshot(
        is_missing=False,
        value_scalar=value,
        original_unit=unit,
        normalized_value=value,
        canonical_unit=unit,
    )


def rec(external_id: str = "m1", **kw) -> RecordSnapshot:
    base = dict(
        external_table="MaterialUniverse",
        external_record_id=external_id,
        raw_record_sha256="a" * 64,
        record_id=1,
        name="Liga",
        class_slug="metais",
        class_name="Metais",
    )
    base.update(kw)
    return RecordSnapshot(**base)  # type: ignore[arg-type]


def changes_of(base: RecordSnapshot, target: RecordSnapshot, props=None):
    (diff,) = diff_releases(
        [base], [target], props if props is not None else {"densidade": DENSITY}
    )
    return diff


# -- TM7-e: is_active ------------------------------------------------------------


def test_switching_a_record_off_is_a_metadata_change_not_unchanged() -> None:
    diff = changes_of(rec(is_active=True), rec(is_active=False))
    assert diff.status is RecordStatus.CHANGED
    (change,) = diff.changes
    assert (change.field, change.kind) == ("ativo", ChangeKind.METADATA)
    assert (change.before_text, change.after_text) == ("ativo", "inativo")


def test_the_same_active_flag_is_unchanged() -> None:
    assert changes_of(rec(is_active=False), rec(is_active=False)).status is RecordStatus.UNCHANGED


# -- TM7-f: one-sided ranges -----------------------------------------------------


def test_a_representative_on_one_side_only_is_a_form_change_never_a_value() -> None:
    before = interval(7850.0, low=7800.0, high=7900.0)
    after = interval(None, low=7800.0, high=7900.0)
    assert compare_values(before, after, "kg/m**3") is ChangeKind.FORM
    assert compare_values(after, before, "kg/m**3") is ChangeKind.FORM


def test_a_bound_on_one_side_only_is_a_form_change() -> None:
    both = interval(7850.0, low=7800.0, high=7900.0)
    lower_only = interval(7800.0, low=7800.0)
    assert compare_values(both, lower_only, "kg/m**3") is ChangeKind.FORM


def test_two_ranges_with_the_same_numbers_are_not_a_change() -> None:
    a = interval(7850.0, low=7800.0, high=7900.0)
    assert compare_values(a, interval(7850.0, low=7800.0, high=7900.0), "kg/m**3") is None


def test_a_one_sided_range_view_writes_the_gap_never_zero() -> None:
    view = value_view(interval(None, low=1.0, high=2.0), Reading("kg/m**3", "kg/m**3"))
    assert view.canonical is not None and view.canonical.value is None
    assert view.canonical.min == 1.0


# -- TM7-g -----------------------------------------------------------------------


def test_the_spelling_of_a_unit_is_writing_not_value() -> None:
    assert compare_values(scalar(7850.0, "kg/m^3"), scalar(7850.0, "kg/m³"), "kg/m**3") is (
        ChangeKind.WRITING
    )


def test_a_value_without_definition_is_a_validation_error_not_a_500() -> None:
    with pytest.raises(ValidationError):
        diff_releases([rec(values={"x": scalar(1.0)})], [rec()], {})


# -- discrete labels (process attributes) ----------------------------------------


def labels(*items: str) -> ValueSnapshot:
    return ValueSnapshot(is_missing=True, labels=tuple(items))


def test_discrete_labels_compare_as_sets() -> None:
    assert labels("a", "b").state is ValueState.DISCRETE
    assert compare_values(labels("a", "b"), labels("b", "a"), "") is None
    assert compare_values(labels("a"), labels("a", "b"), "") is ChangeKind.VALUE
    assert compare_values(labels("a"), ValueSnapshot(is_missing=True), "") is ChangeKind.PRESENCE
    assert compare_values(labels("a"), scalar(1.0), "") is ChangeKind.FORM


# -- composition -----------------------------------------------------------------


def comp(low=None, high=None, nominal=None, *, balance=False, missing=False) -> CompositionSnapshot:
    return CompositionSnapshot(
        is_balance=balance,
        value=ValueSnapshot(
            is_missing=missing or balance,
            value_scalar=nominal if low is None and high is None else None,
            value_min=low,
            value_max=high,
            value_typical=nominal if (low is not None or high is not None) else None,
            original_unit="percent",
            normalized_value=nominal,
            canonical_unit="percent",
        ),
    )


def test_composition_is_compared_per_element_in_mass_percent() -> None:
    diff = changes_of(
        rec(composition={"C": comp(0.1, 0.2, 0.15), "Fe": comp(balance=True)}),
        rec(composition={"C": comp(0.1, 0.25, 0.15), "Fe": comp(balance=True)}),
    )
    (change,) = diff.changes
    assert (change.field, change.kind) == ("composicao:C", ChangeKind.VALUE)
    assert change.property_slug == "composicao:C"


def test_a_new_element_is_presence_and_the_balance_is_never_a_number() -> None:
    diff = changes_of(
        rec(composition={"Fe": comp(balance=True)}),
        rec(composition={"Fe": comp(balance=True), "Mn": comp(nominal=1.0)}),
    )
    (change,) = diff.changes
    assert change.kind is ChangeKind.PRESENCE and change.field == "composicao:Mn"
    assert change.before_value is None and change.after_value is not None


def test_balance_versus_range_is_written_as_text_without_zero() -> None:
    diff = changes_of(
        rec(composition={"Fe": comp(balance=True)}),
        rec(composition={"Fe": comp(97.0, 98.0, 97.5)}),
    )
    (change,) = diff.changes
    assert change.kind is ChangeKind.FORM and change.property_slug is None
    assert "resto" in (change.before_text or "")
    assert change.after_text == "mín. 97 %, máx. 98 %, nominal 97,5 %"


def test_declared_missing_element_is_not_zero() -> None:
    diff = changes_of(
        rec(composition={"S": comp(nominal=0.03)}),
        rec(composition={"S": comp(missing=True)}),
    )
    (change,) = diff.changes
    assert change.kind is ChangeKind.PRESENCE
    assert change.after_value is not None and change.after_value.state is ValueState.MISSING


# -- curves ----------------------------------------------------------------------


def point(x: float, y: float, ymin: float | None = None) -> CurvePointSnapshot:
    return CurvePointSnapshot(x, y, ymin, None, x, y, ymin, None)


def curve(points, *, title="Tração", label="20 °C", unit="MPa") -> CurveSnapshot:
    return CurveSnapshot(
        external_id="c1",
        title=title,
        kind="TENSAO_DEFORMACAO",
        description=None,
        x_label=None,
        y_label=None,
        x_quantity="deformacao",
        y_quantity="tensao",
        x_original_unit="%",
        y_original_unit=unit,
        x_canonical_unit="%",
        y_canonical_unit="Pa",
        series=(CurveSeriesSnapshot(0, label, None, None, None, None, tuple(points)),),
    )


def test_an_identical_curve_is_unchanged() -> None:
    c = curve([point(0, 0), point(1, 100)])
    assert changes_of(rec(curves={"c1": c}), rec(curves={"c1": c})).status is RecordStatus.UNCHANGED


def test_a_changed_point_is_a_value_change_and_counted() -> None:
    diff = changes_of(
        rec(curves={"c1": curve([point(0, 0), point(1, 100)])}),
        rec(curves={"c1": curve([point(0, 0), point(1, 110)])}),
    )
    (change,) = diff.changes
    assert (change.field, change.kind) == ("curva:c1:pontos", ChangeKind.VALUE)
    assert "1 ponto com valor diferente" in (change.after_text or "")


def test_a_bound_on_one_side_of_a_point_is_a_difference() -> None:
    diff = changes_of(
        rec(curves={"c1": curve([point(0, 0, 0.0)])}),
        rec(curves={"c1": curve([point(0, 0)])}),
    )
    assert diff.changes[0].kind is ChangeKind.VALUE


def test_a_new_curve_is_presence_written_in_words() -> None:
    diff = changes_of(rec(), rec(curves={"c1": curve([point(0, 0)])}))
    (change,) = diff.changes
    assert change.kind is ChangeKind.PRESENCE
    assert change.before_text == "não cadastrado nesta release"
    assert change.after_text == "1 série, 1 ponto"


def test_a_renamed_curve_is_a_text_change() -> None:
    diff = changes_of(
        rec(curves={"c1": curve([point(0, 0)])}),
        rec(curves={"c1": curve([point(0, 0)], title="Tração a 20 °C")}),
    )
    (change,) = diff.changes
    assert change.field == "curva:c1:titulo" and change.kind is ChangeKind.TEXT


def test_other_unit_same_physical_points_is_writing() -> None:
    c1 = curve([point(0, 0), point(1, 100)])
    p2 = CurvePointSnapshot(0, 0, None, None, 0, 0, None, None)
    p3 = CurvePointSnapshot(1, 0.1, None, None, 1, 100, None, None)  # GPa vs MPa, same normalized
    c2 = curve([p2, p3], unit="GPa")
    diff = changes_of(rec(curves={"c1": c1}), rec(curves={"c1": c2}))
    assert [c.kind for c in diff.changes] == [ChangeKind.WRITING]


# -- universes -------------------------------------------------------------------


def test_universes_are_counted_and_filtered() -> None:
    process = rec("p1", universe=Universe.PROCESS, external_table="ProcessUniverse")
    diffs = diff_releases([rec("m1"), process], [rec("m1"), process], {})
    assert {u.value: n for u, n in count_by_universe(diffs).items()} == {
        "material": 1,
        "processo": 1,
        "modal": 0,
    }
    only = filter_diffs(diffs, universe=Universe.PROCESS)
    assert [d.external_record_id for d in only] == ["p1"]
    assert parse_universe(None) is None
    with pytest.raises(ValidationError):
        parse_universe("xyz")


def test_a_record_cannot_change_universe() -> None:
    with pytest.raises(ValidationError):
        diff_releases([rec("x")], [rec("x", universe=Universe.PROCESS)], {})


# -- end to end: rows written straight into the database -------------------------


def _dataset(db: Session, slug: str, release: str) -> CatalogDataset:
    dataset = CatalogDataset(
        slug=slug,
        name="Catálogo fictício de universos",
        release=release,
        lineage="universos-ficticios",
        source_sha256="b" * 64,
        license_label="Fictícia de teste",
        is_demo=True,
    )
    db.add(dataset)
    db.flush()
    return dataset


def _ref(db, dataset, table, ext, **target) -> None:
    db.add(
        CatalogRecordRef(
            dataset_id=dataset.id,
            external_table=table,
            external_record_id=ext,
            raw_record_sha256="c" * 64,
            **target,
        )
    )


def test_the_service_diffs_processes_modes_composition_and_curves(
    client, db_session: Session
) -> None:
    db = db_session
    source = Source(label="Fonte fictícia de universos", is_demo=True)
    mclass = MaterialClass(name="Classe fictícia U", slug="classe-ficticia-u")
    pclass = ProcessClass(name="Família fictícia U", slug="familia-ficticia-u")
    db.add_all([source, mclass, pclass])
    db.flush()
    attr = ProcessAttributeDefinition(
        name="Espessura máxima",
        slug="espessura-max-u",
        kind=ProcessAttributeKind.ESCALAR,
        physical_dimension="[length]",
        canonical_unit="m",
        accepted_units=["m", "mm"],
        display_unit="mm",
    )
    tags = ProcessAttributeDefinition(
        name="Acabamento",
        slug="acabamento-u",
        kind=ProcessAttributeKind.DISCRETO,
        physical_dimension="",
        allowed_labels=["a", "b"],
    )
    mode = TransportMode(slug="modal-u", name="Rodoviário U", energy_intensity=2.0)
    db.add_all([attr, tags, mode])
    db.flush()
    r1 = _dataset(db, "universos-r1", "R1")
    r2 = _dataset(db, "universos-r2", "R2")

    def material(dataset, name, nominal_max) -> Material:
        m = Material(name=name, class_id=mclass.id, is_demo=True)
        db.add(m)
        db.flush()
        _ref(db, dataset, "MaterialUniverse", "m-u", material_id=m.id)
        db.add(
            MaterialCompositionEntry(
                material_id=m.id,
                element="C",
                position=0,
                value_min=0.1,
                value_max=nominal_max,
                value_nominal=0.15,
                original_unit="wt%",
                normalized_min=0.1,
                normalized_max=nominal_max,
                normalized_nominal=0.15,
                canonical_unit="percent",
                source_id=source.id,
                data_quality=DataQuality.IMPORTADO,
                is_demo=True,
            )
        )
        db.add(
            MaterialCompositionEntry(
                material_id=m.id,
                element="Fe",
                position=1,
                is_balance=True,
                source_id=source.id,
                data_quality=DataQuality.IMPORTADO,
                is_demo=True,
            )
        )
        curve_row = MaterialCurve(
            material_id=m.id,
            kind=CurveKind.TENSAO_DEFORMACAO,
            title="Tração",
            x_quantity="deformacao",
            y_quantity="tensao",
            x_original_unit="%",
            y_original_unit="MPa",
            x_canonical_unit="%",
            y_canonical_unit="Pa",
            x_conversion_method="identity",
            y_conversion_method="pint:MPa->Pa",
            source_id=source.id,
            data_quality=DataQuality.IMPORTADO,
            is_demo=True,
            dataset_id=dataset.id,
            external_id="curve-u",
            raw_sha256="d" * 64,
        )
        db.add(curve_row)
        db.flush()
        series = MaterialCurveSeries(curve_id=curve_row.id, position=0, label="20 °C")
        db.add(series)
        db.flush()
        for position, (x, y) in enumerate([(0.0, 0.0), (1.0, 100.0 if dataset is r1 else 120.0)]):
            db.add(
                MaterialCurvePoint(
                    series_id=series.id,
                    position=position,
                    x_value=x,
                    y_value=y,
                    x_normalized=x,
                    y_normalized=y * 1e6,
                )
            )
        return m

    material(r1, "Aço U", 0.2)
    material(r2, "Aço U", 0.25)

    def process(dataset, thickness_mm, active) -> None:
        p = Process(
            name="Fundição U",
            slug=f"fundicao-u-{dataset.slug}",
            class_id=pclass.id,
            is_active=active,
            is_demo=True,
        )
        db.add(p)
        db.flush()
        _ref(db, dataset, "ProcessUniverse", "p-u", process_id=p.id)
        db.add(
            ProcessAttributeValue(
                process_id=p.id,
                attribute_id=attr.id,
                value_scalar=thickness_mm,
                original_unit="mm",
                normalized_value=thickness_mm / 1000,
                canonical_unit="m",
                source_id=source.id,
                data_quality=DataQuality.IMPORTADO,
            )
        )
        db.add(
            ProcessAttributeValue(
                process_id=p.id,
                attribute_id=tags.id,
                labels=["a"] if dataset is r1 else ["a", "b"],
                is_missing=True,
                source_id=source.id,
                data_quality=DataQuality.IMPORTADO,
            )
        )

    process(r1, 10.0, True)
    process(r2, 12.0, False)
    _ref(db, r1, "ProductConfig/Transportation", "t-u", transport_mode_id=mode.id)
    _ref(db, r2, "ProductConfig/Transportation", "t-u", transport_mode_id=mode.id)
    db.flush()

    body = client.get("/api/catalogo/releases/universos-r1/diff/universos-r2").json()
    assert [(u["universe"], u["count"]) for u in body["universes"]] == [
        ("material", 1),
        ("processo", 1),
        ("modal", 1),
    ]
    items = {i["external_record_id"]: i for i in body["items"]}
    assert items["t-u"]["status"] == "inalterado"
    assert items["t-u"]["universe_label"] == "Modal de transporte"

    material_fields = {c["field"]: c for c in items["m-u"]["changes"]}
    assert set(material_fields) == {"composicao:C", "curva:curve-u:pontos"}
    assert material_fields["composicao:C"]["after"]["canonical"]["max"] == 0.25
    assert material_fields["composicao:C"]["reading_unit_label"]
    assert "1 ponto com valor diferente" in material_fields["curva:curve-u:pontos"]["after_text"]
    assert items["m-u"]["base"]["material_id"] is not None

    process_fields = {c["field"]: c for c in items["p-u"]["changes"]}
    assert set(process_fields) == {"ativo", "atributo:espessura-max-u", "atributo:acabamento-u"}
    thickness = process_fields["atributo:espessura-max-u"]
    assert thickness["kind"] == "valor"
    assert thickness["before"]["reading"]["value"] == 10.0  # read in mm
    assert thickness["after"]["reading"]["unit_label"] == "mm"
    assert process_fields["atributo:acabamento-u"]["after"]["labels"] == ["a", "b"]
    assert items["p-u"]["base"]["material_id"] is None

    only = client.get(
        "/api/catalogo/releases/universos-r1/diff/universos-r2", params={"universo": "processo"}
    ).json()
    assert [i["external_record_id"] for i in only["items"]] == ["p-u"]
    assert (
        client.get(
            "/api/catalogo/releases/universos-r1/diff/universos-r2", params={"universo": "x"}
        ).status_code
        == 400
    )
    assert (
        client.get(
            "/api/catalogo/releases/universos-r1/diff/universos-r2",
            params={"classe": "familia-ficticia-u"},
        ).status_code
        == 200
    )

    csv = client.get("/api/exports/catalogo/releases/universos-r1/diff/universos-r2.csv")
    assert csv.status_code == 200 and "Processo" in csv.text

    service = CatalogReleaseService(db)
    assert service.list_releases()
