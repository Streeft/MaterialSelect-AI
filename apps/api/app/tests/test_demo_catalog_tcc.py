"""The enlarged demo catalogue of the TCC: 593 fictitious materials in nine lots (D-185).

Two halves. The pure half reads the JSON lots and runs ``validate_lots`` — the
QA rules of the lots, no database — including proof that each rule bites on a
mutated copy. The database half seeds the lots inside the test's transaction,
as ``semear_demo`` does: everything ``is_demo``, every value with its unit
trail, idempotent, processes only on these materials, removed by
``clear_demo``. Seeding all 593 is slow, so only two tests do it; the rest use
a slice.
"""

from __future__ import annotations

import copy
import json
from collections import Counter
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.calculations.units import to_canonical
from app.db.clear_demo import clear_demo_data
from app.db.demo_catalog import (
    DemoCatalogError,
    load_lots,
    normalize_name,
    read_lot_files,
    validate_lot,
    validate_lots,
)
from app.db.demo_identity_data import designation_table
from app.db.seed import DEMO_DESIGNATIONS, DEMO_MATERIALS, DEMO_SOURCE_LABEL, PROPERTIES
from app.db.seed_demo_releases import DEMO_RELEASES
from app.db.seed_extended import (
    EXTENDED_DEMO_MATERIALS,
    TCC_DEMO_MATERIALS,
    seed_demo_catalog_expansion,
    seed_extended_materials,
    tcc_demo_material_ids,
)
from app.models.enums import CurveKind, DataQuality
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_composition import MaterialCompositionEntry
from app.models.material_curve import MaterialCurve, MaterialCurvePoint, MaterialCurveSeries
from app.models.material_designation import MaterialDesignation
from app.models.material_property_value import MaterialPropertyValue
from app.models.process import MaterialProcess
from app.models.property_definition import PropertyDefinition
from app.models.source import Source

CANONICAL = {spec["slug"]: spec["canonical_unit"] for spec in PROPERTIES}
EXISTING_NAMES = [
    *(m["name"] for m in DEMO_MATERIALS),
    *(m["name"] for m in EXTENDED_DEMO_MATERIALS),
    *(record.name for release in DEMO_RELEASES for record in release.records),
]
EXISTING_CODES = [
    spec["code"]
    for specs in [*designation_table().values(), *DEMO_DESIGNATIONS.values()]
    for spec in specs
]


def _source(db: Session) -> Source:
    return db.execute(select(Source).where(Source.label == DEMO_SOURCE_LABEL)).scalar_one()


def _spec(name: str) -> dict:
    return next(m for m in TCC_DEMO_MATERIALS if m["name"] == name)


def _lot_with(material: dict) -> dict:
    return {"lote": "LXX-teste", "versao": 1, "materiais": [material]}


def _value(material: dict, slug: str) -> dict:
    return next(v for v in material["values"] if v["slug"] == slug)


# --- the lots as data (pure) ------------------------------------------------------


class TestLots:
    def test_nine_lots_593_materials_in_the_five_existing_classes(self) -> None:
        lots = read_lot_files()
        assert len(lots) == 9
        assert len(TCC_DEMO_MATERIALS) == 593
        assert Counter(m["class_slug"] for m in TCC_DEMO_MATERIALS) == {
            "metais": 207,
            "polimeros": 134,
            "ceramicas": 84,
            "compositos": 112,
            "elastomeros": 56,
        }

    def test_every_lot_passes_the_qa_rules(self) -> None:
        assert (
            validate_lots(
                read_lot_files(), reserved_names=EXISTING_NAMES, reserved_codes=EXISTING_CODES
            )
            == []
        )

    def test_names_are_unique_across_lots_and_against_the_current_demo(self) -> None:
        keys = [normalize_name(m["name"]) for m in TCC_DEMO_MATERIALS]
        assert len(keys) == len(set(keys))
        assert not set(keys) & {normalize_name(n) for n in EXISTING_NAMES}

    def test_designation_codes_are_unique_across_the_whole_demo(self) -> None:
        codes = [
            normalize_name(raw.partition(":")[2].partition("@")[0])
            for m in TCC_DEMO_MATERIALS
            for raw in m["designations"]
        ]
        assert len(codes) == len(set(codes))
        assert not set(codes) & {normalize_name(code) for code in EXISTING_CODES}

    def test_every_value_is_estimated_and_absence_is_never_a_number(self) -> None:
        for material in TCC_DEMO_MATERIALS:
            assert len(material["values"]) == len(CANONICAL), material["name"]
            for value in material["values"]:
                assert value["quality"] is DataQuality.ESTIMADO
                if value["kind"] == "missing":
                    assert value["notes"], (material["name"], value["slug"])
                    assert not {"value", "min", "max", "typical"} & set(value)
                else:
                    numbers = [value[k] for k in ("value", "min", "max", "typical") if k in value]
                    assert numbers and all(n > 0 for n in numbers), material["name"]

    def test_load_fails_loud_on_a_broken_lot(self, tmp_path: Path) -> None:
        lot = read_lot_files()[0]
        broken = copy.deepcopy(lot)
        _value(broken["materiais"][0], "densidade")["value"] = 0
        (tmp_path / "L01_quebrado.json").write_text(json.dumps(broken), encoding="utf-8")
        with pytest.raises(DemoCatalogError, match="não positivo"):
            load_lots(tmp_path)

    def test_load_refuses_an_empty_directory(self, tmp_path: Path) -> None:
        with pytest.raises(DemoCatalogError, match="Nenhum lote"):
            load_lots(tmp_path)


def _first(subclass: str) -> dict:
    for lot in read_lot_files():
        for material in lot["materiais"]:
            if material["subclass"] == subclass:
                return copy.deepcopy(material)
    raise AssertionError(subclass)


def _set_zero(m: dict) -> None:
    _value(m, "densidade")["value"] = 0


def _drop_essential(m: dict) -> None:
    value = _value(m, "modulo_young")
    value.clear()
    value.update({"slug": "modulo_young", "kind": "missing", "notes": "teste"})


def _yield_above_tensile(m: dict) -> None:
    tensile = _value(m, "resistencia_tracao")
    tensile.update({"value": 100, "unit": "MPa"})


def _bad_unit(m: dict) -> None:
    _value(m, "densidade")["unit"] = "lb/ft**3"


def _real_code(m: dict) -> None:
    m["designations"] = ["AISI_SAE:1020"]


def _measured(m: dict) -> None:
    _value(m, "densidade")["quality"] = "MEDIDO"


def _soft_steel(m: dict) -> None:
    _value(m, "modulo_young").update({"value": 120, "unit": "GPa"})


def _five_digits(m: dict) -> None:
    _value(m, "densidade")["value"] = 7861.3


def _new_class(m: dict) -> None:
    m["class_slug"] = "espumas"


def _missing_without_note(m: dict) -> None:
    value = _value(m, "dureza")
    value.clear()
    value.update({"slug": "dureza", "kind": "missing"})


class TestValidatorBites:
    """Each rule of the QA refuses a mutated copy of a valid steel."""

    @pytest.mark.parametrize(
        ("mutate", "message"),
        [
            (_set_zero, "não positivo"),
            (_drop_essential, "essencial"),
            (_yield_above_tensile, "escoamento acima"),
            (_bad_unit, "unidade"),
            (_real_code, "DEMO-"),
            (_measured, "qualidade"),
            (_soft_steel, "E/ρ"),
            (_five_digits, "algarismos"),
            (_new_class, "não existe"),
            (_missing_without_note, "sem nota"),
        ],
    )
    def test_rule(self, mutate, message: str) -> None:
        steel = _first("Aços Carbono")
        assert validate_lot(_lot_with(steel)) == []
        mutate(steel)
        errors = validate_lot(_lot_with(steel))
        assert any(message in error for error in errors), errors

    def test_elastomer_poisson_of_one_half_is_refused(self) -> None:
        rubber = _first("Borrachas Sintéticas")
        _value(rubber, "coef_poisson")["value"] = 0.5
        assert any("Poisson" in e for e in validate_lot(_lot_with(rubber)))

    def test_grey_iron_may_omit_yield_but_ductile_iron_may_not(self) -> None:
        grey = next(
            copy.deepcopy(m)
            for lot in read_lot_files()
            for m in lot["materiais"]
            if "Cinzento" in m["name"]
        )
        assert validate_lot(_lot_with(grey)) == []
        grey["curve_hint"] = {"shape": "ductile"}
        assert any("essencial" in e for e in validate_lot(_lot_with(grey)))

    def test_brittle_family_needs_yield_near_fracture(self) -> None:
        glass = _first("Vidros")
        sy = _value(glass, "limite_escoamento")
        su = _value(glass, "resistencia_tracao")
        tensile_mpa = to_canonical(su["value"], su["unit"], "MPa")[0]
        sy.clear()
        sy.update(
            {
                "slug": "limite_escoamento",
                "kind": "scalar",
                "value": float(f"{0.5 * tensile_mpa:.3g}"),
                "unit": "MPa",
            }
        )
        assert any("σy/σu" in e for e in validate_lot(_lot_with(glass)))

    def test_names_and_codes_collide_case_and_accent_blind(self) -> None:
        steel = _first("Aços Carbono")
        twin = copy.deepcopy(steel)
        twin["name"] = steel["name"].upper()
        lot = {"lote": "LXX", "versao": 1, "materiais": [steel, twin]}
        errors = validate_lot(lot)
        assert any("nome repetido" in e for e in errors)
        assert any("designação" in e and "repetida" in e for e in errors)
        reserved = validate_lot(_lot_with(steel), reserved_names=[steel["name"].lower()])
        assert any("já usado" in e for e in reserved)


# --- seeding (database) -------------------------------------------------------------


def _tcc_materials(db: Session) -> list[Material]:
    ids = tcc_demo_material_ids(db)
    return list(db.execute(select(Material).where(Material.id.in_(ids))).scalars())


def test_the_whole_catalogue_seeds_marked_traced_and_idempotent(db_session: Session) -> None:
    source = _source(db_session)
    first = seed_demo_catalog_expansion(db_session, source)
    assert first == {
        "tcc_materials_created": 593,
        "tcc_designations_created": sum(len(m["designations"]) for m in TCC_DEMO_MATERIALS),
        "tcc_composition_entries_created": sum(
            len(m["composition"].split()) for m in TCC_DEMO_MATERIALS
        ),
        "tcc_curves_created": 3 * 593,
        "tcc_process_links_created": first["tcc_process_links_created"],
    }
    assert first["tcc_process_links_created"] > 593

    materials = _tcc_materials(db_session)
    assert len(materials) == 593
    assert all(m.is_demo and m.owner_id is None for m in materials)
    ids = [m.id for m in materials]

    rows = db_session.execute(
        select(MaterialPropertyValue, PropertyDefinition.slug)
        .join(PropertyDefinition, PropertyDefinition.id == MaterialPropertyValue.property_id)
        .where(MaterialPropertyValue.material_id.in_(ids))
    ).all()
    assert len(rows) == 593 * len(CANONICAL)
    canon: dict[tuple[int, str], float] = {}
    for row, slug in rows:
        assert row.source_id == source.id
        assert row.data_quality is DataQuality.ESTIMADO
        if row.is_missing:
            assert row.normalized_value is None
            assert row.value_scalar is None and row.value_min is None and row.value_max is None
            continue
        assert row.canonical_unit == CANONICAL[slug]
        assert row.normalized_value and row.normalized_value > 0  # never zero
        original = row.value_typical if row.value_scalar is None else row.value_scalar
        expected, method = to_canonical(original, row.original_unit, CANONICAL[slug])
        assert row.normalized_value == pytest.approx(expected)
        assert row.conversion_method == method
        canon[(row.material_id, slug)] = row.normalized_value
    for material_id in ids:
        sy = canon.get((material_id, "limite_escoamento"))
        if sy is not None:
            assert sy <= canon[(material_id, "resistencia_tracao")]

    curves = Counter(
        db_session.execute(
            select(MaterialCurve.kind).where(
                MaterialCurve.material_id.in_(ids), MaterialCurve.is_demo.is_(True)
            )
        ).scalars()
    )
    assert curves == {
        CurveKind.TENSAO_DEFORMACAO: 593,
        CurveKind.TEMPERATURA: 593,
        CurveKind.FADIGA: 593,
    }
    linked = set(db_session.execute(select(MaterialProcess.material_id)).scalars())
    assert set(ids) <= linked

    second = seed_demo_catalog_expansion(db_session, source)
    assert set(second.values()) == {0}
    assert len(_tcc_materials(db_session)) == 593


def test_clear_demo_removes_the_whole_enlarged_catalogue(db_session: Session) -> None:
    source = _source(db_session)
    seed_demo_catalog_expansion(db_session, source)
    ids = tcc_demo_material_ids(db_session)
    assert len(ids) == 593

    removed = clear_demo_data(db_session)
    assert removed["materials"] >= 593
    assert db_session.scalar(select(func.count(Material.id)).where(Material.is_demo)) == 0
    for model in (
        MaterialPropertyValue,
        MaterialDesignation,
        MaterialCompositionEntry,
        MaterialCurve,
        MaterialProcess,
    ):
        left = db_session.scalar(
            select(func.count()).select_from(model).where(model.material_id.in_(ids))
        )
        assert left == 0, model.__name__
    assert db_session.scalar(select(func.count(MaterialCurveSeries.id))) == db_session.scalar(
        select(func.count(MaterialCurveSeries.id)).join(MaterialCurve)
    )
    assert db_session.scalar(select(func.count(MaterialCurvePoint.id))) == db_session.scalar(
        select(func.count(MaterialCurvePoint.id)).join(MaterialCurveSeries)
    )


SLICE = [
    "Ferro Fundido Cinzento FC150",
    "Borracha Natural Goma Pura 40 Shore A",
    "MMC Alumínio 6061 + 20 % Al2O3 Particulado (T6)",
    "CMC SiC/SiC por Infiltração de Fundido (MI)",
    "Epóxi DGEBA Curada com Anidrido",
]


def _curve_points(db: Session, name: str, kind: CurveKind) -> tuple[MaterialCurve, list]:
    curve = db.execute(
        select(MaterialCurve)
        .join(Material, Material.id == MaterialCurve.material_id)
        .where(Material.name == name, Material.is_demo.is_(True), MaterialCurve.kind == kind)
    ).scalar_one()
    series = sorted(curve.series, key=lambda s: s.position)
    return curve, [sorted(s.points, key=lambda p: p.position) for s in series]


def test_curve_hint_gives_the_lot_shape(db_session: Session) -> None:
    seed_demo_catalog_expansion(db_session, _source(db_session), specs=[_spec(n) for n in SLICE])

    grey, series = _curve_points(db_session, SLICE[0], CurveKind.TENSAO_DEFORMACAO)
    assert "Ruptura frágil" in (grey.description or "")  # a metal, and still brittle
    assert len(series) == 1

    rubber, series = _curve_points(db_session, SLICE[1], CurveKind.TENSAO_DEFORMACAO)
    break_strain = _spec(SLICE[1])["curve_hint"]["break_strain"]
    assert series[0][-1].x_value == pytest.approx(
        to_canonical(break_strain, "dimensionless", "percent")[0]
    )

    mmc, series = _curve_points(db_session, SLICE[2], CurveKind.TENSAO_DEFORMACAO)
    assert mmc.parameter_quantity == "temperatura"  # ductile composite: metal family
    assert len(series) == 3

    cmc, _ = _curve_points(db_session, SLICE[3], CurveKind.TENSAO_DEFORMACAO)
    assert "fissuração da matriz" in (cmc.description or "")

    epoxy, _ = _curve_points(db_session, SLICE[4], CurveKind.TENSAO_DEFORMACAO)
    assert "Ruptura frágil" in (epoxy.description or "")


def test_processes_are_linked_only_to_the_new_demo_materials(db_session: Session) -> None:
    metals = db_session.execute(
        select(MaterialClass).where(MaterialClass.slug == "metais")
    ).scalar_one()
    real = Material(name="Liga Real Sem Processo", class_id=metals.id, is_demo=False)
    db_session.add(real)
    db_session.flush()

    seed_demo_catalog_expansion(db_session, _source(db_session), specs=[_spec(n) for n in SLICE])

    assert (
        db_session.scalar(
            select(func.count())
            .select_from(MaterialProcess)
            .where(MaterialProcess.material_id == real.id)
        )
        == 0
    )
    ids = tcc_demo_material_ids(db_session, [_spec(n) for n in SLICE])
    assert len(ids) == len(SLICE)
    for material_id in ids:
        assert db_session.scalar(
            select(func.count())
            .select_from(MaterialProcess)
            .where(MaterialProcess.material_id == material_id)
        )


def _real_twin(db: Session, name: str) -> Material:
    metals = db.execute(select(MaterialClass).where(MaterialClass.slug == "metais")).scalar_one()
    twin = Material(name=name, class_id=metals.id, is_demo=False)
    db.add(twin)
    db.flush()
    return twin


def test_a_real_material_with_a_demo_name_does_not_hide_the_demo_one(db_session: Session) -> None:
    """Before D-185 the name lookup ignored ``is_demo``: the demo was skipped in silence."""
    name = EXTENDED_DEMO_MATERIALS[1]["name"]
    _real_twin(db_session, name)

    seed_extended_materials(db_session, _source(db_session))

    demo = db_session.execute(
        select(Material).where(Material.name == name, Material.is_demo.is_(True))
    ).scalar_one_or_none()
    assert demo is not None


def test_two_real_materials_with_a_demo_name_do_not_break_the_seed(db_session: Session) -> None:
    """Before D-185 two rows with the name raised ``MultipleResultsFound``."""
    name = EXTENDED_DEMO_MATERIALS[2]["name"]
    _real_twin(db_session, name)
    _real_twin(db_session, name)

    created = seed_extended_materials(db_session, _source(db_session))

    assert created == len(EXTENDED_DEMO_MATERIALS)
