"""The 75 demo materials all carry designations, composition and curves (D-107).

The baseline every test starts from is ``app.db.seed`` (5 materials, fixed
counts elsewhere in the suite). These tests run the extended seed inside the
test's own transaction — what ``semear_demo`` does in production — and prove the
whole demo catalogue is covered, idempotent, internally consistent and removed by
``clear_demo``.
"""

from __future__ import annotations

import contextlib
import math

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import demo_coverage
from app.db.clear_demo import clear_demo_data
from app.db.demo_coverage import collect_coverage, format_report, summarize
from app.db.demo_identity_data import (
    COMPOSITIONS,
    DESIGNATIONS,
    DemoIdentityDataError,
    composition_table,
    designation_table,
    parse_composition,
    parse_designation,
)
from app.db.seed import (
    DEMO_COMPOSITIONS,
    DEMO_CURVE_CITATION,
    DEMO_DESIGNATIONS,
    DEMO_SOURCE_LABEL,
)
from app.db.seed_extended import EXTENDED_DEMO_MATERIALS, seed_extended_materials
from app.db.seed_extended_identity import DEMO_KNOWN_GAPS, seed_extended_identity
from app.domain.elements import element_for
from app.models.enums import CurveKind, DesignationSystem
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_composition import MaterialCompositionEntry
from app.models.material_curve import MaterialCurve, MaterialCurvePoint, MaterialCurveSeries
from app.models.material_designation import MaterialDesignation
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition
from app.models.source import Source

BASELINE_NAMES = {
    "Liga Alumínio Demo A",
    "Aço Demo B",
    "Polímero Demo C",
    "Cerâmica Demo D",
    "Compósito Demo E",
}
ALL_NAMES = BASELINE_NAMES | {m["name"] for m in EXTENDED_DEMO_MATERIALS}


@pytest.fixture()
def full_demo(db_session: Session) -> dict[str, int]:
    """The catalogue ``semear_demo`` leaves: baseline + extended + identity + curves."""
    source = db_session.execute(
        select(Source).where(Source.label == DEMO_SOURCE_LABEL)
    ).scalar_one()
    seed_extended_materials(db_session, source)
    created = seed_extended_identity(db_session, source)
    db_session.flush()
    db_session.expire_all()
    return created


def _demo_materials(db: Session) -> list[Material]:
    return list(
        db.execute(
            select(Material).where(Material.is_demo.is_(True)).order_by(Material.id)
        ).scalars()
    )


def _canonical(db: Session, material_id: int, slug: str) -> float | None:
    return db.execute(
        select(MaterialPropertyValue.normalized_value)
        .join(PropertyDefinition, PropertyDefinition.id == MaterialPropertyValue.property_id)
        .where(
            MaterialPropertyValue.material_id == material_id,
            PropertyDefinition.slug == slug,
            MaterialPropertyValue.is_missing.is_(False),
        )
    ).scalar_one_or_none()


# --- the data module --------------------------------------------------------------


class TestDataModule:
    def test_there_are_75_demo_materials(self) -> None:
        assert len(ALL_NAMES) == 75

    def test_every_name_in_the_tables_is_a_real_demo_material(self) -> None:
        """A typo in a name would seed nothing and fail silently."""
        assert set(DESIGNATIONS) <= ALL_NAMES
        assert set(COMPOSITIONS) <= ALL_NAMES

    def test_every_material_is_named_by_the_baseline_or_the_extended_tables(self) -> None:
        designated = set(DESIGNATIONS) | set(DEMO_DESIGNATIONS)
        composed = set(COMPOSITIONS) | set(DEMO_COMPOSITIONS)
        assert designated == ALL_NAMES
        assert composed == ALL_NAMES

    def test_every_code_says_it_is_fictitious(self) -> None:
        for name, specs in designation_table().items():
            assert specs, name
            for spec in specs:
                code = spec["code"]
                if spec["system"] is DesignationSystem.COMERCIAL:
                    assert code.startswith("Demo"), (name, code)
                else:
                    assert code.startswith("DEMO-"), (name, code)

    def test_no_designation_repeats_inside_a_material(self) -> None:
        for name, specs in designation_table().items():
            keys = [(s["system"], s["code"].upper()) for s in specs]
            assert len(keys) == len(set(keys)), name

    def test_the_composition_grammar(self) -> None:
        parsed = parse_composition(
            "Fe=balance Mo=missing C<=0.07 Cu>=99.9 Cr=17.5-19.5 Mg=0.8-1.2~1.0 Au=75 Ti<=1500ppm"
        )
        by_element = {p["element"]: p for p in parsed}
        assert by_element["Fe"] == {"element": "Fe", "balance": True}
        assert by_element["Mo"] == {"element": "Mo", "missing": True}
        assert by_element["C"] == {"element": "C", "max": 0.07, "unit": "%"}
        assert by_element["Cu"] == {"element": "Cu", "min": 99.9, "unit": "%"}
        assert by_element["Cr"] == {"element": "Cr", "min": 17.5, "max": 19.5, "unit": "%"}
        assert by_element["Mg"]["nominal"] == 1.0
        assert by_element["Au"] == {"element": "Au", "nominal": 75.0, "unit": "%"}
        assert by_element["Ti"] == {"element": "Ti", "max": 1500.0, "unit": "ppm"}

    @pytest.mark.parametrize("bad", ["Fe=", "fe=balance", "Fe balance", "C<0.1", "Xx=1-2-3"])
    def test_an_unreadable_token_is_refused(self, bad: str) -> None:
        with pytest.raises(DemoIdentityDataError):
            parse_composition(bad)

    def test_an_unknown_designation_system_is_refused(self) -> None:
        with pytest.raises(DemoIdentityDataError):
            parse_designation("NORMA:DEMO-X")
        with pytest.raises(DemoIdentityDataError):
            parse_designation("UNS:")
        assert parse_designation("EN:DEMO-1@Europa")["region"] == "Europa"


# --- the seed -----------------------------------------------------------------------


class TestSeedCoverage:
    def test_every_demo_material_has_a_designation_and_a_composition(
        self, db_session: Session, full_demo
    ) -> None:
        materials = _demo_materials(db_session)
        assert {m.name for m in materials} == ALL_NAMES
        for material in materials:
            assert material.designations, f"{material.name}: sem designação"
            informative = [e for e in material.composition if not e.is_missing]
            assert informative, f"{material.name}: sem composição"

    def test_every_class_has_a_stress_strain_curve_and_only_the_known_gap_lacks_one(
        self, db_session: Session, full_demo
    ) -> None:
        without_curve = {m.name for m in _demo_materials(db_session) if not m.curves}
        assert without_curve == set(DEMO_KNOWN_GAPS)
        for material in _demo_materials(db_session):
            if material.name in without_curve:
                continue
            kinds = {curve.kind for curve in material.curves}
            assert CurveKind.TENSAO_DEFORMACAO in kinds, material.name
            if material.material_class.slug == "metais":
                assert {CurveKind.FADIGA, CurveKind.TENSAO_DEFORMACAO} <= kinds, material.name

    def test_the_known_gap_is_a_material_with_no_strength_to_anchor_on(
        self, db_session: Session, full_demo
    ) -> None:
        for name in DEMO_KNOWN_GAPS:
            material = db_session.execute(
                select(Material).where(Material.name == name)
            ).scalar_one()
            assert _canonical(db_session, material.id, "resistencia_tracao") is None
            assert _canonical(db_session, material.id, "limite_escoamento") is None

    def test_the_counts_are_the_tables_and_the_second_run_creates_nothing(
        self, db_session: Session, full_demo
    ) -> None:
        assert full_demo["designations_created"] == sum(len(v) for v in DESIGNATIONS.values())
        # every composition row of the extended tables, including the three
        # baseline materials the baseline seed left without one
        assert full_demo["composition_entries_created"] == sum(
            len(v) for v in composition_table().values()
        )
        assert full_demo["curves_created"] > 100
        source = db_session.execute(
            select(Source).where(Source.label == DEMO_SOURCE_LABEL)
        ).scalar_one()
        again = seed_extended_identity(db_session, source)
        assert again == {
            "designations_created": 0,
            "composition_entries_created": 0,
            "curves_created": 0,
        }

    def test_clear_demo_removes_all_of_it(self, db_session: Session, full_demo) -> None:
        removed = clear_demo_data(db_session)
        db_session.flush()
        assert removed["designations"] == 8 + sum(len(v) for v in DESIGNATIONS.values())
        assert removed["curves"] >= full_demo["curves_created"]
        for model in (
            MaterialDesignation,
            MaterialCompositionEntry,
            MaterialCurve,
            MaterialCurveSeries,
            MaterialCurvePoint,
        ):
            assert db_session.scalar(select(func.count()).select_from(model)) == 0, model
        assert (
            db_session.scalar(select(func.count(Material.id)).where(Material.is_demo.is_(True)))
            == 0
        )

    def test_every_row_is_fictitious_and_marked(self, db_session: Session, full_demo) -> None:
        source = db_session.execute(
            select(Source).where(Source.label == DEMO_SOURCE_LABEL)
        ).scalar_one()
        for model in (MaterialDesignation, MaterialCompositionEntry, MaterialCurve):
            rows = db_session.execute(select(model)).scalars().all()
            assert rows
            assert all(row.is_demo for row in rows), model
            assert all(row.source_id == source.id for row in rows), model
        curves = db_session.execute(select(MaterialCurve)).scalars().all()
        assert all(curve.citation == DEMO_CURVE_CITATION for curve in curves)
        assert all("fictícia" in curve.description.lower() for curve in curves if curve.description)


class TestCompositionConsistency:
    def test_elements_are_valid_and_the_sums_fit_in_100_percent(
        self, db_session: Session, full_demo
    ) -> None:
        for material in _demo_materials(db_session):
            rows = list(material.composition)
            balances = [r for r in rows if r.is_balance]
            assert len(balances) <= 1, material.name
            assert len({r.element for r in rows}) == len(rows), material.name
            floor = 0.0  # what the specification forces to be present
            typical = 0.0  # the middle of every stated range
            for row in rows:
                assert element_for(row.element) is not None, (material.name, row.element)
                if row.is_balance or row.is_missing:
                    assert row.normalized_min is None
                    assert row.normalized_max is None
                    assert row.normalized_nominal is None
                    continue
                low, high, nominal = row.normalized_min, row.normalized_max, row.normalized_nominal
                assert all(v is None or 0 <= v <= 100 for v in (low, high, nominal))
                floor += low if low is not None else (nominal or 0.0)
                if nominal is not None:
                    typical += nominal
                elif low is not None and high is not None:
                    typical += (low + high) / 2
                elif high is not None:
                    typical += high / 2  # "<= max": any content up to it conforms
                else:
                    typical += low  # type: ignore[operator]
            assert floor <= 100.0, (material.name, floor)
            if balances:
                assert typical < 100.0, (material.name, typical)

    def test_a_declared_absence_carries_no_number_and_keeps_the_balance_apart(
        self, db_session: Session, full_demo
    ) -> None:
        absent = (
            db_session.execute(
                select(MaterialCompositionEntry).where(
                    MaterialCompositionEntry.is_missing.is_(True)
                )
            )
            .scalars()
            .all()
        )
        assert len(absent) >= 5
        assert all(
            r.value_min is None and r.value_max is None and r.value_nominal is None for r in absent
        )

    def test_every_metal_has_a_balance_or_a_minimum_that_says_what_it_is(
        self, db_session: Session, full_demo
    ) -> None:
        for material in _demo_materials(db_session):
            if material.material_class.slug != "metais":
                continue
            assert any(
                r.is_balance or r.normalized_min for r in material.composition
            ), material.name


class TestCurveConsistency:
    def test_every_series_is_ordered_finite_and_has_a_trail(
        self, db_session: Session, full_demo
    ) -> None:
        for curve in db_session.execute(select(MaterialCurve)).scalars():
            assert curve.series, curve.title
            for series in curve.series:
                xs = [p.x_normalized for p in series.points]
                assert len(xs) >= 2
                assert all(b > a for a, b in zip(xs, xs[1:], strict=False)), (curve.title, xs)
                for point in series.points:
                    assert math.isfinite(point.y_normalized)
                    if point.y_min_normalized is not None:
                        assert (
                            point.y_min_normalized <= point.y_normalized <= point.y_max_normalized
                        )
            assert curve.x_original_unit and curve.x_canonical_unit and curve.x_conversion_method
            assert curve.y_original_unit and curve.y_canonical_unit and curve.y_conversion_method

    def test_the_tensile_curve_is_anchored_on_the_materials_own_properties(
        self, db_session: Session, full_demo
    ) -> None:
        """Initial slope ~ Young's modulus; the metal's peak ~ its tensile strength."""
        checked = 0
        for material in _demo_materials(db_session):
            if material.name in {"Liga Alumínio Demo A", "Aço Demo B"}:
                continue  # baseline curves, typed by hand in app.db.seed
            slug = material.material_class.slug
            curve = next(
                (c for c in material.curves if c.kind is CurveKind.TENSAO_DEFORMACAO), None
            )
            if curve is None or slug == "polimeros":
                continue  # polymers start with a viscoelastic knee, not a straight line
            youngs = _canonical(db_session, material.id, "modulo_young")
            first = curve.series[0].points[1]
            slope = first.y_normalized / first.x_normalized
            assert slope == pytest.approx(youngs, rel=0.06), material.name
            tensile = _canonical(db_session, material.id, "resistencia_tracao")
            if tensile is not None and slug in {"metais", "ceramicas", "elastomeros"}:
                peak = max(p.y_normalized for p in curve.series[0].points)
                assert peak == pytest.approx(tensile, rel=0.02), material.name
            checked += 1
        assert checked > 50

    def test_a_metal_family_gets_weaker_as_it_gets_hotter(
        self, db_session: Session, full_demo
    ) -> None:
        families = 0
        for curve in db_session.execute(
            select(MaterialCurve).where(MaterialCurve.kind == CurveKind.TENSAO_DEFORMACAO)
        ).scalars():
            if len(curve.series) < 2 or not curve.material.is_demo:
                continue
            families += 1
            parameters = [s.parameter_normalized for s in curve.series]
            assert parameters == sorted(parameters)
            peaks = [max(p.y_normalized for p in s.points) for s in curve.series]
            assert peaks == sorted(peaks, reverse=True), curve.material.name
        assert families >= 15

    def test_the_fatigue_band_contains_the_line_and_the_curve_falls(
        self, db_session: Session, full_demo
    ) -> None:
        for curve in db_session.execute(
            select(MaterialCurve).where(MaterialCurve.kind == CurveKind.FADIGA)
        ).scalars():
            ys = [p.y_normalized for p in curve.series[0].points]
            assert ys == sorted(ys, reverse=True), curve.material.name
            assert all(p.y_min_normalized is not None for p in curve.series[0].points)

    def test_the_modulus_curve_starts_at_the_materials_modulus(
        self, db_session: Session, full_demo
    ) -> None:
        curves = (
            db_session.execute(
                select(MaterialCurve).where(MaterialCurve.kind == CurveKind.TEMPERATURA)
            )
            .scalars()
            .all()
        )
        assert len(curves) >= 20
        for curve in curves:
            youngs = _canonical(db_session, curve.material_id, "modulo_young")
            points = curve.series[0].points
            assert points[0].y_normalized == pytest.approx(youngs, rel=0.001)
            assert points[-1].y_normalized < points[0].y_normalized

    def test_a_premise_the_material_does_not_state_is_said_in_the_description(
        self, db_session: Session, full_demo
    ) -> None:
        """Aluminium 6061 has no tensile strength registered: the curve says what it assumed."""
        material = db_session.execute(
            select(Material).where(Material.name == "Liga de Alumínio 6061-T6")
        ).scalar_one()
        assert _canonical(db_session, material.id, "resistencia_tracao") is None
        curve = next(c for c in material.curves if c.kind is CurveKind.TENSAO_DEFORMACAO)
        assert "ausente no cadastro" in curve.description
        assert "premissa da própria curva fictícia" in curve.description


# --- the coverage report ---------------------------------------------------------------


class TestCoverageReport:
    def test_the_report_counts_the_whole_demo_catalogue(
        self, db_session: Session, full_demo
    ) -> None:
        rows = collect_coverage(db_session, demo_only=True)
        summary = summarize(rows)
        assert summary["materials"] == 75
        assert summary["designation"] == 75
        assert summary["composition"] == 75
        assert summary["curve"] == 75 - len(DEMO_KNOWN_GAPS)
        assert summary["complete"] == 75 - len(DEMO_KNOWN_GAPS)
        gaps = {row.name: row.gaps for row in rows if row.gaps}
        assert set(gaps) == set(DEMO_KNOWN_GAPS)
        assert list(gaps["Cerâmica Demo D"]) == ["curve"]
        assert "sem curva cadastrada" in gaps["Cerâmica Demo D"]["curve"]
        assert DEMO_KNOWN_GAPS["Cerâmica Demo D"]["curve"] in gaps["Cerâmica Demo D"]["curve"]

    def test_the_text_names_the_gap_and_the_gaps_filter_hides_the_rest(
        self, db_session: Session, full_demo
    ) -> None:
        rows = collect_coverage(db_session, demo_only=True)
        text = format_report(rows, gaps_only=True)
        assert "Cobertura de 75 materiais" in text
        assert "Cerâmica Demo D" in text
        assert "AUSENTE curva" in text
        assert "Aço Demo B" not in text
        assert "Aço Demo B" in format_report(rows)

    def test_it_does_not_depend_on_is_demo(self, db_session: Session) -> None:
        """A real material with nothing registered is reported as such, in plain words."""
        klass = db_session.execute(select(MaterialClass)).scalars().first()
        db_session.add(
            Material(name="Material real sem nada", class_id=klass.id, keywords=[], is_demo=False)
        )
        db_session.flush()
        rows = collect_coverage(db_session)
        row = next(r for r in rows if r.name == "Material real sem nada")
        assert row.gaps == {
            "designation": "sem designação cadastrada",
            "composition": "sem composição cadastrada",
            "curve": "sem curva cadastrada",
        }
        assert "Material real sem nada" not in {
            r.name for r in collect_coverage(db_session, demo_only=True)
        }
        text = format_report([row])
        assert "[demo]" not in text
        assert "AUSENTE composição: sem composição cadastrada" in text

    def test_a_row_declared_absent_is_not_counted_as_composition(self, db_session: Session) -> None:
        klass = db_session.execute(select(MaterialClass)).scalars().first()
        source = db_session.execute(select(Source)).scalars().first()
        material = Material(
            name="Só ausência declarada", class_id=klass.id, keywords=[], is_demo=False
        )
        db_session.add(material)
        db_session.flush()
        db_session.add(
            MaterialCompositionEntry(
                material_id=material.id,
                element="Mo",
                position=0,
                is_missing=True,
                source_id=source.id,
                is_demo=False,
            )
        )
        db_session.flush()
        row = next(r for r in collect_coverage(db_session) if r.name == "Só ausência declarada")
        assert row.composition_entries == 0
        assert row.composition_declared_absent == 1
        assert "composition" in row.gaps

    def test_the_command_prints_the_report(
        self, db_session: Session, full_demo, monkeypatch: pytest.MonkeyPatch, capsys
    ) -> None:
        @contextlib.contextmanager
        def session_scope():
            yield db_session

        monkeypatch.setattr(demo_coverage, "SessionLocal", session_scope)
        assert demo_coverage.main(["--demo", "--gaps"]) == 0
        out = capsys.readouterr().out
        assert "Cobertura de 75 materiais" in out
        assert "Cerâmica Demo D" in out
