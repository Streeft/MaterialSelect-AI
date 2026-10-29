"""Composition per condition and the derived atomic percent (TM2-c, D-117).

A material may state its composition for a condition ("fundido", "laminado").
Each condition is a composition of its own: its own uniqueness, its own balance,
its own atomic percent. Search reads every condition unless ``@condição`` names
one; the verdicts join by Kleene OR, so ``NOT`` still is the guarantee.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from alembic import command
from app.config import settings
from app.domain.composition import (
    Comparison,
    CompositionError,
    EntryFacts,
    UndeterminedReason,
    build_composition_entry,
    condition_key,
    condition_order,
    evaluate_material,
    normalize_condition_label,
    parse_condition,
    validate_composition,
)
from app.domain.search_query import CompositionAtom, SearchQueryError, parse_query
from app.exporters.identity import NO_CONDITION, CompositionLine, composition_sheet
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.source import Source

POLYMER = "Polímero Demo C"


def facts(low=None, high=None, nominal=None, *, balance=False, missing=False) -> EntryFacts:
    return EntryFacts(
        is_balance=balance,
        is_missing=missing,
        normalized_min=low,
        normalized_max=high,
        normalized_nominal=nominal,
    )


# --- domain: the label and the rules per condition ---------------------------


class TestLabel:
    def test_blank_is_no_condition(self) -> None:
        assert normalize_condition_label(None) is None
        assert normalize_condition_label("   ") is None

    def test_whitespace_is_collapsed_and_case_kept(self) -> None:
        assert normalize_condition_label("  Laminado   a quente ") == "Laminado a quente"

    def test_comparison_ignores_case_and_accents(self) -> None:
        assert condition_key("Solubilizado") == condition_key("solubilizádo")

    @pytest.mark.parametrize("bad", ["x" * 61, "laminado@quente", 'fundido "A"'])
    def test_a_label_too_long_or_with_search_syntax_is_refused(self, bad: str) -> None:
        with pytest.raises(CompositionError):
            normalize_condition_label(bad)

    def test_the_builder_carries_the_label(self) -> None:
        row = build_composition_entry("Fe", is_balance=True, condition_label=" fundido ")
        assert row.condition_label == "fundido"

    def test_reading_order_puts_no_condition_first(self) -> None:
        assert condition_order(["laminado", None, "fundido", "laminado"]) == [
            None,
            "laminado",
            "fundido",
        ]


def _row(element: str, condition: str | None = None, **kw):
    return build_composition_entry(element, condition_label=condition, **kw)


class TestValidatePerCondition:
    def test_the_same_element_in_two_conditions_is_two_compositions(self) -> None:
        validate_composition(
            [
                _row("Cr", value_nominal=18, unit="%"),
                _row("Cr", "fundido", value_nominal=19, unit="%"),
                _row("Cr", "laminado", value_nominal=17, unit="%"),
            ]
        )

    def test_a_duplicate_element_within_a_condition_is_refused(self) -> None:
        with pytest.raises(CompositionError, match="laminado"):
            validate_composition(
                [
                    _row("Cr", "laminado", value_nominal=18, unit="%"),
                    _row("Cr", "laminado", value_nominal=17, unit="%"),
                ]
            )

    def test_a_condition_written_two_ways_is_refused(self) -> None:
        with pytest.raises(CompositionError, match="grafia"):
            validate_composition(
                [
                    _row("Cr", "Laminado", value_nominal=18, unit="%"),
                    _row("Ni", "laminado", value_nominal=8, unit="%"),
                ]
            )

    def test_one_balance_per_condition(self) -> None:
        validate_composition([_row("Fe", "fundido", is_balance=True), _row("Fe", is_balance=True)])
        with pytest.raises(CompositionError, match="resto"):
            validate_composition(
                [_row("Fe", "fundido", is_balance=True), _row("Ni", "fundido", is_balance=True)]
            )

    def test_minima_above_one_hundred_are_counted_per_condition(self) -> None:
        validate_composition(
            [_row("Cu", "a", value_min=60, unit="%"), _row("Cu", "b", value_min=60, unit="%")]
        )
        with pytest.raises(CompositionError, match="100"):
            validate_composition(
                [_row("Cu", "a", value_min=60, unit="%"), _row("Zn", "a", value_min=50, unit="%")]
            )


# --- domain: search over conditions -------------------------------------------


class TestParse:
    def test_a_condition_after_at(self) -> None:
        condition = parse_condition("Cr>=12@laminado")
        assert (condition.element, condition.comparison, condition.low) == ("Cr", Comparison.GE, 12)
        assert condition.condition_label == "laminado"
        assert condition.label() == "Cr ≥ 12 % (condição: laminado)"

    def test_without_at_the_syntax_is_unchanged(self) -> None:
        assert parse_condition("Ni:8-10").condition_label is None
        assert parse_condition("Fe@fundido").comparison is Comparison.CONTAINS

    def test_an_empty_condition_is_an_error(self) -> None:
        with pytest.raises(CompositionError, match="condição"):
            parse_condition("Cr>=12@")

    def test_quotes_carry_a_condition_with_spaces(self) -> None:
        node = parse_query('comp:"Cr>=12@laminado a quente"')
        assert isinstance(node, CompositionAtom)
        assert node.condition.condition_label == "laminado a quente"

    def test_quotes_without_a_condition_are_still_refused(self) -> None:
        with pytest.raises(SearchQueryError, match="aspas"):
            parse_query('comp:"Cr>=12"')


STEEL_TWO_CONDITIONS = {
    "fundido": {"Cr": facts(19.0, 21.0), "Fe": facts(balance=True)},
    "laminado": {"Cr": facts(10.0, 11.0), "Fe": facts(balance=True)},
}


class TestEvaluateMaterial:
    def test_without_a_condition_any_condition_can_satisfy(self) -> None:
        verdict = evaluate_material(parse_condition("Cr>=12"), STEEL_TWO_CONDITIONS)
        assert verdict.value is True

    def test_the_guarantee_needs_every_condition(self) -> None:
        # comp:Cr<12 is true in "laminado", so NOT comp:Cr<12 fails: not every
        # product of this material has 12 % or more.
        assert evaluate_material(parse_condition("Cr<12"), STEEL_TWO_CONDITIONS).value is True
        both_high = {k: {"Cr": facts(13.0, 14.0)} for k in ("fundido", "laminado")}
        assert evaluate_material(parse_condition("Cr<12"), both_high).value is False

    def test_a_named_condition_reads_only_that_composition(self) -> None:
        assert evaluate_material(
            parse_condition("Cr>=12@laminado"), STEEL_TWO_CONDITIONS
        ).value is (False)
        assert evaluate_material(parse_condition("Cr>=12@FUNDIDO"), STEEL_TWO_CONDITIONS).value is (
            True
        )

    def test_a_condition_the_material_does_not_have_is_undetermined(self) -> None:
        verdict = evaluate_material(parse_condition("Cr>=12@forjado"), STEEL_TWO_CONDITIONS)
        assert verdict.value is None
        assert verdict.reason is UndeterminedReason.SEM_COMPOSICAO_NA_CONDICAO

    def test_no_composition_at_all(self) -> None:
        for empty in (None, {}):
            verdict = evaluate_material(parse_condition("Cr>=12@fundido"), empty)
            assert verdict.reason is UndeterminedReason.SEM_COMPOSICAO

    def test_an_undetermined_condition_keeps_a_false_from_deciding(self) -> None:
        # Cr not declared in "fundido" and below 12 in "laminado": unknown.
        composition = {"fundido": {"Ni": facts(8.0, 10.0)}, "laminado": {"Cr": facts(1.0, 2.0)}}
        verdict = evaluate_material(parse_condition("Cr>=12"), composition)
        assert verdict.value is None
        assert verdict.reason is UndeterminedReason.ELEMENTO_NAO_DECLARADO

    def test_a_single_unconditioned_composition_reads_as_before(self) -> None:
        composition = {None: {"Cr": facts(16.0, 18.0)}}
        assert evaluate_material(parse_condition("Cr>=17"), composition).value is True
        assert evaluate_material(parse_condition("Cr>=19"), composition).value is False


# --- database ---------------------------------------------------------------------


@pytest.fixture()
def material_and_source(db_session: Session) -> tuple[int, int]:
    klass = db_session.execute(select(MaterialClass)).scalars().first()
    source = db_session.execute(select(Source)).scalars().first()
    material = Material(name="Liga com condições", class_id=klass.id, keywords=[], is_demo=False)
    db_session.add(material)
    db_session.flush()
    return material.id, source.id


def _insert(db: Session, material_id: int, source_id: int, **columns) -> None:
    row = {
        "material_id": material_id,
        "element": "Cr",
        "position": 0,
        "is_balance": False,
        "is_missing": False,
        "normalized_max": 1.0,
        "source_id": source_id,
        "data_quality": "IMPORTADO",
        "is_demo": False,
        "created_at": "2026-10-13",
        "condition_label": None,
        **columns,
    }
    names = ", ".join(row)
    params = ", ".join(f":{k}" for k in row)
    with db.begin_nested():
        db.execute(text(f"INSERT INTO material_composition ({names}) VALUES ({params})"), row)


class TestDatabase:
    def test_the_same_element_in_two_conditions_and_without_one(
        self, db_session: Session, material_and_source
    ) -> None:
        _insert(db_session, *material_and_source)
        _insert(db_session, *material_and_source, condition_label="fundido")
        _insert(db_session, *material_and_source, condition_label="laminado")

    @pytest.mark.parametrize("label", [None, "fundido"])
    def test_a_duplicate_element_in_one_condition_is_refused(
        self, db_session: Session, material_and_source, label
    ) -> None:
        _insert(db_session, *material_and_source, condition_label=label)
        with pytest.raises(IntegrityError):
            _insert(db_session, *material_and_source, condition_label=label)

    @pytest.mark.parametrize("label", ["", " fundido", "fundido ", "x" * 61])
    def test_the_label_check(self, db_session: Session, material_and_source, label) -> None:
        with pytest.raises(IntegrityError):
            _insert(db_session, *material_and_source, condition_label=label)

    @pytest.mark.parametrize("label", [None, "fundido"])
    def test_one_balance_per_condition(
        self, db_session: Session, material_and_source, label
    ) -> None:
        balance = {"is_balance": True, "normalized_max": None}
        _insert(db_session, *material_and_source, element="Fe", condition_label=label, **balance)
        other = "laminado" if label else "fundido"
        _insert(db_session, *material_and_source, element="Fe", condition_label=other, **balance)
        with pytest.raises(IntegrityError):
            _insert(
                db_session, *material_and_source, element="Ni", condition_label=label, **balance
            )


# --- migration ----------------------------------------------------------------------

PRE_REVISION = "81adb0b92f72"
REVISION = "703bbf25ce90"


def _config(url: str) -> Config:
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    # alembic.ini says script_location = alembic, which resolves against
    # the working directory; anchor it to this file so pytest runs anywhere.
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[2] / "alembic"))
    config.set_main_option("sqlalchemy.url", url)
    return config


def _run(url: str, statement: str):
    engine = sa.create_engine(url)
    try:
        with engine.begin() as conn:
            result = conn.execute(sa.text(statement))
            return result.all() if result.returns_rows else None
    finally:
        engine.dispose()


COLUMNS = (
    "material_id, element, position, is_balance, is_missing, source_id, data_quality,"
    " is_demo, created_at, normalized_max"
)


def test_the_migration_keeps_rows_as_unconditioned_and_comes_back_down(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    url = f"sqlite:///{tmp_path / 'condition_migration.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = _config(url)
    command.upgrade(config, PRE_REVISION)
    _run(url, "INSERT INTO material_class (id, name, slug) VALUES (1, 'Metais', 'metais')")
    _run(
        url,
        "INSERT INTO material (id, name, class_id, keywords, is_active, is_demo,"
        " is_synthesized, created_at) VALUES (1, 'Aço', 1, '[]', 1, 0, 0, '2026-01-01')",
    )
    _run(
        url,
        "INSERT INTO source (id, label, is_demo, contains_third_party_data)"
        " VALUES (1, 'Fonte', 0, 0)",
    )
    _run(
        url,
        f"INSERT INTO material_composition ({COLUMNS})"
        " VALUES (1, 'Cr', 0, 0, 0, 1, 'IMPORTADO', 0, '2026-10-13', 18.0)",
    )

    command.upgrade(config, REVISION)
    assert _run(url, "SELECT condition_label FROM material_composition") == [(None,)]
    _run(
        url,
        f"INSERT INTO material_composition ({COLUMNS}, condition_label)"
        " VALUES (1, 'Cr', 1, 0, 0, 1, 'IMPORTADO', 0, '2026-10-13', 19.0, 'fundido')",
    )
    for bad in (
        # duplicate element without a condition
        f"INSERT INTO material_composition ({COLUMNS})"
        " VALUES (1, 'Cr', 2, 0, 0, 1, 'IMPORTADO', 0, '2026-10-13', 1.0)",
        # blank label
        f"INSERT INTO material_composition ({COLUMNS}, condition_label)"
        " VALUES (1, 'Ni', 2, 0, 0, 1, 'IMPORTADO', 0, '2026-10-13', 1.0, '')",
    ):
        with pytest.raises(sa.exc.IntegrityError):
            _run(url, bad)

    command.downgrade(config, PRE_REVISION)
    assert _run(url, "SELECT element, normalized_max FROM material_composition") == [("Cr", 18.0)]
    command.upgrade(config, REVISION)


# --- API ------------------------------------------------------------------------------


def _material_id(db_session, name: str) -> int:
    return db_session.execute(select(Material.id).where(Material.name == name)).scalar_one()


def _entry(element: str, **kw) -> dict:
    return {"element": element, "source_label": "Folha de especificação X", **kw}


def _put(client, material_id: int, entries: list[dict]):
    return client.put(f"/api/materials/{material_id}/composicao", json={"entries": entries})


class TestApi:
    def test_compositions_per_condition_and_their_atomic_percent(self, client, db_session) -> None:
        mid = _material_id(db_session, POLYMER)
        response = _put(
            client,
            mid,
            [
                _entry("Cu", value_nominal=70, unit="%", condition_label="laminado"),
                _entry("Zn", value_nominal=30, unit="%", condition_label="laminado"),
                _entry("Cu", value_min=60, value_max=63, unit="%"),
                _entry("Zn", state="resto"),
            ],
        )
        assert response.status_code == 200, response.text
        body = response.json()
        labels = [e["condition_label"] for e in body["composition"]]
        assert labels == ["laminado", "laminado", None, None]

        none_block, laminado = body["atomic_composition"]
        assert none_block["condition_label"] is None
        assert none_block["label"] == "derivada"
        assert none_block["reason"] == "resto_declarado"
        assert none_block["entries"] == []
        assert "resto" in none_block["message"]

        assert laminado["condition_label"] == "laminado"
        assert laminado["reason"] is None
        cu = next(e for e in laminado["entries"] if e["element"] == "Cu")
        assert cu["atomic_min"] == pytest.approx(70.59, abs=0.01)
        assert "IUPAC" in laminado["basis"]

    def test_no_composition_has_no_atomic_block(self, client, db_session) -> None:
        mid = _material_id(db_session, POLYMER)
        body = _put(client, mid, []).json()
        assert body["composition"] == [] and body["atomic_composition"] == []

    def test_a_duplicate_element_in_one_condition_is_400(self, client, db_session) -> None:
        mid = _material_id(db_session, POLYMER)
        response = _put(
            client,
            mid,
            [
                _entry("Cr", value_nominal=18, unit="%", condition_label="fundido"),
                _entry("Cr", value_nominal=19, unit="%", condition_label="Fundido"),
            ],
        )
        assert response.status_code == 400
        assert "grafia" in response.json()["detail"]

    def test_search_by_condition(self, client, db_session) -> None:
        mid = _material_id(db_session, POLYMER)
        _put(
            client,
            mid,
            [
                _entry("Cr", value_min=19, value_max=21, unit="%", condition_label="fundido"),
                _entry("Cr", value_min=10, value_max=11, unit="%", condition_label="laminado"),
            ],
        )

        def names(q: str) -> list[str]:
            response = client.get("/api/materials/busca", params={"q": q})
            assert response.status_code == 200, response.text
            return [i["name"] for i in response.json()["items"]]

        assert POLYMER in names("comp:Cr>=12")
        assert POLYMER in names("comp:Cr>=12@fundido")
        assert POLYMER not in names("comp:Cr>=12@laminado")
        assert POLYMER not in names("NOT comp:Cr<12")  # the guarantee fails in "laminado"
        report = client.get("/api/materials/busca", params={"q": "comp:Cr>=12@forjado"}).json()
        (condition,) = report["composition"]["conditions"]
        assert condition["label"] == "Cr ≥ 12 % (condição: forjado)"
        assert condition["undetermined_by_reason"]["sem_composicao_na_condicao"] >= 1

    def test_the_selection_stage_reads_the_condition(self, client, db_session) -> None:
        mid = _material_id(db_session, POLYMER)
        _put(
            client,
            mid,
            [_entry("Cr", value_min=19, value_max=21, unit="%", condition_label="fundido")],
        )
        body = client.post(
            "/api/selection/filter",
            json={"constraints": [{"operator": "composition", "text": "Cr>=12@fundido"}]},
        ).json()
        assert POLYMER in [c["name"] for c in body["candidates"]]

    def test_the_audit_names_the_condition(self, client, db_session) -> None:
        mid = _material_id(db_session, POLYMER)
        _put(client, mid, [_entry("Cr", value_nominal=18, unit="%", condition_label="fundido")])
        events = client.get("/api/audit", params={"entity_type": "material", "entity_id": mid})
        assert events.status_code == 200, events.text
        assert "composição Cr (fundido)" in events.text


class TestExport:
    def test_the_sheet_writes_the_condition_or_its_absence(self) -> None:
        line = CompositionLine(
            element="Cr",
            state="faixa",
            minimum=16.0,
            maximum=18.0,
            nominal=None,
            data_quality="ESTIMADO",
            source_label="Fonte",
        )
        sheet = composition_sheet(
            [("Aço", [line, CompositionLine(**{**line.__dict__, "condition_label": "fundido"})])]
        )
        assert sheet.header[2] == "Condição"
        assert [row[2] for row in sheet.rows] == [NO_CONDITION, "fundido"]

    def test_a_material_without_composition_still_writes_it(self) -> None:
        sheet = composition_sheet([("Aço", [])])
        (row,) = sheet.rows
        assert "sem composição cadastrada" in row
        assert "" not in row
