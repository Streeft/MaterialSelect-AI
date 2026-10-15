"""Ordinal material properties and the minimum-level criterion (D-126).

Exercise 8, step 2 of the manual: "durability against an agent, at least
Aceitável". The scale is ordered, the comparison is a position, and a material
with no level — no row, or a row recorded as missing — **never passes**, and is
never read as the worst level either. That last rule is the canary of this file.

Its own definition, namespaced ``teste-``, so no assertion here quietly becomes
an assertion about seed data.
"""

from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.catalog.bundle import verify_bundle
from app.catalog.importer import (
    OfficialCatalogImporter,
    OfficialCatalogImportError,
    validate_semantics,
)
from app.db.clear_demo import clear_demo_data
from app.db.seed_demo_ordinal import DEMO_SCALE, demo_level, seed_demo_ordinals
from app.domain.filters import (
    Constraint,
    MaterialSnapshot,
    Operator,
    evaluate_constraint,
    has_value,
)
from app.domain.ordinal import (
    OrdinalScaleError,
    describe_scale,
    level_rank,
    meets_minimum,
    validate_scale,
)
from app.models.enums import DataQuality
from app.models.material import Material
from app.models.ordinal_property import (
    MaterialOrdinalValue,
    OrdinalPropertyDefinition,
    OrdinalScaleLevel,
)
from app.models.source import Source
from app.models.user import User

SLUG = "teste-durabilidade-agua"
SCALE = ("Muito pobre", "Pobre", "Aceitável", "Bom", "Excelente")

# --- pure domain ------------------------------------------------------------


def test_a_scale_is_trimmed_and_kept_worst_first() -> None:
    assert validate_scale([" Ruim ", "Bom"]) == ("Ruim", "Bom")


@pytest.mark.parametrize(
    "labels",
    [["Só um"], ["Bom", ""], ["Bom", "bom"], [f"N{i}" for i in range(13)], ["x" * 81, "y"]],
)
def test_a_scale_that_cannot_order_anything_is_refused(labels) -> None:
    with pytest.raises(OrdinalScaleError):
        validate_scale(labels)


def test_a_level_is_its_position_and_an_unknown_one_names_the_scale() -> None:
    assert level_rank(SCALE, "Aceitável") == 2
    with pytest.raises(OrdinalScaleError, match="Muito pobre < Pobre"):
        level_rank(SCALE, "Aceitavel")
    assert describe_scale(SCALE) == "Muito pobre < Pobre < Aceitável < Bom < Excelente"


def test_meets_minimum_compares_positions_and_absence_never_meets() -> None:
    assert meets_minimum(4, 2) is True
    assert meets_minimum(2, 2) is True
    assert meets_minimum(1, 2) is False
    # Canary: no level is not the worst level — it fails even a minimum of 0.
    assert meets_minimum(None, 0) is False


def _snap(id_: int, ordinals: dict[str, int]) -> MaterialSnapshot:
    return MaterialSnapshot(
        id=id_, name=f"m{id_}", class_name="c", class_slug="c", ordinals=ordinals
    )


def test_the_engine_admits_at_least_the_minimum_and_never_the_absent() -> None:
    at_least = Constraint(
        operator=Operator.LEVEL_AT_LEAST, property_slug=SLUG, labels=["Pobre"], min_rank=1
    )
    lowest = Constraint(
        operator=Operator.LEVEL_AT_LEAST, property_slug=SLUG, labels=["Muito pobre"], min_rank=0
    )
    assert evaluate_constraint(at_least, _snap(1, {SLUG: 3}))
    assert evaluate_constraint(at_least, _snap(2, {SLUG: 1}))
    assert not evaluate_constraint(at_least, _snap(3, {SLUG: 0}))
    absent = _snap(4, {})
    assert not evaluate_constraint(at_least, absent)
    # The canary at engine level: the lowest minimum still rejects absence.
    assert not evaluate_constraint(lowest, absent)
    assert evaluate_constraint(lowest, _snap(5, {SLUG: 0}))


def test_presence_reads_the_ordinal_map_too() -> None:
    assert has_value(_snap(1, {SLUG: 0}), SLUG)
    assert not has_value(_snap(2, {}), SLUG)
    not_exists = Constraint(operator=Operator.NOT_EXISTS, property_slug=SLUG)
    assert evaluate_constraint(not_exists, _snap(2, {}))


# --- database ---------------------------------------------------------------


def _definition(db, slug: str = SLUG, name: str = "Durabilidade de teste em água"):
    definition = OrdinalPropertyDefinition(slug=slug, name=name)
    definition.levels = [OrdinalScaleLevel(rank=i, label=label) for i, label in enumerate(SCALE)]
    db.add(definition)
    db.flush()
    return definition


@pytest.fixture()
def ordinal(db_session):
    """Five seed materials, one of each state.

    | material (seed order) | level      |
    |-----------------------|------------|
    | 0                     | Excelente  |
    | 1                     | Aceitável  |
    | 2                     | Pobre      |
    | 3                     | *ausente* (row with ``is_missing``) |
    | 4                     | *sem dado* (no row at all)          |
    """
    definition = _definition(db_session)
    materials = list(
        db_session.execute(
            select(Material).where(Material.is_active.is_(True)).order_by(Material.id).limit(5)
        ).scalars()
    )
    assert len(materials) == 5
    by_label = {level.label: level for level in definition.levels}
    for material, label in zip(materials[:3], ["Excelente", "Aceitável", "Pobre"], strict=True):
        db_session.add(
            MaterialOrdinalValue(
                material_id=material.id,
                definition_id=definition.id,
                level_id=by_label[label].id,
                data_quality=DataQuality.IMPORTADO,
            )
        )
    db_session.add(
        MaterialOrdinalValue(
            material_id=materials[3].id, definition_id=definition.id, is_missing=True
        )
    )
    db_session.flush()
    return definition, materials


def test_a_level_and_missing_are_exclusive_in_the_database(db_session) -> None:
    definition = _definition(db_session)
    material = db_session.execute(select(Material).limit(1)).scalar_one()
    db_session.add(
        MaterialOrdinalValue(
            material_id=material.id,
            definition_id=definition.id,
            level_id=definition.levels[0].id,
            is_missing=True,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_a_value_with_neither_level_nor_missing_is_refused(db_session) -> None:
    definition = _definition(db_session)
    material = db_session.execute(select(Material).limit(1)).scalar_one()
    db_session.add(MaterialOrdinalValue(material_id=material.id, definition_id=definition.id))
    with pytest.raises(IntegrityError):
        db_session.flush()


# --- HTTP: catalogue and datasheet ---------------------------------------------


def test_the_catalogue_serves_the_scale_worst_first(client, ordinal) -> None:
    resp = client.get("/api/properties/ordinais")
    assert resp.status_code == 200
    entry = next(d for d in resp.json() if d["slug"] == SLUG)
    assert entry["kind"] == "ORDINAL"
    assert entry["levels"] == list(SCALE)
    assert entry["scale_text"] == describe_scale(SCALE)


def test_the_material_reading_writes_both_kinds_of_absence(client, ordinal) -> None:
    _, materials = ordinal
    states = {}
    for material in materials:
        resp = client.get(f"/api/materials/{material.id}/ordinais")
        assert resp.status_code == 200
        row = next(v for v in resp.json()["values"] if v["slug"] == SLUG)
        states[material.id] = (row["status"], row["level"], row["rank"])
    assert states[materials[0].id] == ("nivel", "Excelente", 4)
    # Neither absence is a level, and neither is rank 0.
    assert states[materials[3].id] == ("ausente", None, None)
    assert states[materials[4].id] == ("sem_dado", None, None)


def test_an_invisible_material_is_a_404(client) -> None:
    assert client.get("/api/materials/999999/ordinais").status_code == 404


# --- HTTP: the limit stage ----------------------------------------------------


def _level(label: str) -> dict:
    return {"operator": "level_at_least", "property_slug": SLUG, "labels": [label]}


def _filter(client, constraints: list[dict], universe: str = "material"):
    return client.post(
        "/api/selection/filter",
        json={"universe": universe, "stages": [{"kind": "limit", "constraints": constraints}]},
    )


def test_minimum_level_admits_that_level_and_better(client, ordinal) -> None:
    _, materials = ordinal
    resp = _filter(client, [_level("Aceitável")])
    assert resp.status_code == 200, resp.text
    ids = {c["record_id"] for c in resp.json()["candidates"]}
    assert ids == {materials[0].id, materials[1].id}


def test_canary_absence_never_passes_even_the_lowest_level(client, ordinal) -> None:
    """The rule this whole feature exists to keep: "Muito pobre" admits every
    material that *has* a level, and neither the missing nor the empty one."""
    _, materials = ordinal
    resp = _filter(client, [_level("Muito pobre")])
    assert resp.status_code == 200, resp.text
    ids = {c["record_id"] for c in resp.json()["candidates"]}
    assert materials[3].id not in ids
    assert materials[4].id not in ids
    assert {m.id for m in materials[:3]} <= ids


def test_the_funnel_writes_why_a_material_without_level_left(client, ordinal) -> None:
    resp = _filter(client, [_level("Aceitável")])
    step = resp.json()["steps"][0]
    assert step["operator"] == "level_at_least"
    # Every active material but the three with a level has none.
    assert step["without_level"] == resp.json()["initial_count"] - 3
    assert "Aceitável" in step["label"]
    assert "sem nível não passa" in step["label"]
    assert "Muito pobre < Pobre" in step["label"]
    assert step["undetermined"] is None


def test_other_criteria_carry_no_level_count(client, ordinal) -> None:
    resp = _filter(client, [{"operator": "exists", "property_slug": "densidade"}])
    assert resp.json()["steps"][0]["without_level"] is None


def test_presence_of_a_level_is_selectable(client, ordinal) -> None:
    _, materials = ordinal
    resp = _filter(client, [{"operator": "exists", "property_slug": SLUG}])
    assert resp.status_code == 200, resp.text
    assert {c["record_id"] for c in resp.json()["candidates"]} == {m.id for m in materials[:3]}


def test_a_level_off_the_scale_is_a_404_naming_it(client, ordinal) -> None:
    resp = _filter(client, [_level("Ótimo")])
    assert resp.status_code == 404
    assert "Ótimo" in resp.json()["detail"]


def test_exactly_one_minimum_level(client, ordinal) -> None:
    resp = _filter(client, [{**_level("Bom"), "labels": ["Bom", "Excelente"]}])
    assert resp.status_code == 400


def test_a_numeric_property_has_no_levels(client, ordinal) -> None:
    resp = _filter(
        client, [{"operator": "level_at_least", "property_slug": "densidade", "labels": ["Bom"]}]
    )
    assert resp.status_code == 400
    assert "não é uma propriedade ordinal" in resp.json()["detail"]


def test_a_process_study_has_no_ordinal_scale(client, ordinal) -> None:
    resp = _filter(client, [_level("Bom")], universe="process")
    assert resp.status_code == 400


def test_an_ordinal_is_not_compared_by_number(client, ordinal) -> None:
    resp = _filter(client, [{"operator": "gte", "property_slug": SLUG, "value": 2}])
    assert resp.status_code == 400
    assert "ordinal" in resp.json()["detail"]


def test_an_ordinal_does_not_rank(client, ordinal) -> None:
    resp = client.post(
        "/api/selection/run",
        json={
            "stages": [{"kind": "limit", "constraints": [_level("Pobre")]}],
            "ranking": {"criteria": [{"key": SLUG, "weight": 1.0}]},
        },
    )
    assert resp.status_code == 400
    assert "ranqueamento" in resp.json()["detail"]


def test_an_ordinal_does_not_enter_an_index_expression(client, ordinal) -> None:
    resp = client.post(
        "/api/selection/run",
        json={
            "stages": [{"kind": "limit", "constraints": [_level("Pobre")]}],
            "index": {"expression": "teste_durabilidade_agua / densidade", "goal": "maximize"},
            "ranking": {"criteria": [{"key": "__index__", "weight": 1.0}]},
        },
    )
    assert resp.status_code == 400
    assert "ordinal" in resp.json()["detail"]


def test_a_saved_study_keeps_the_minimum_and_reruns_to_the_same_answer(client, ordinal) -> None:
    _, materials = ordinal
    created = client.post(
        "/api/selection/studies",
        json={
            "name": "Durabilidade mínima",
            "stages": [{"kind": "limit", "constraints": [_level("Bom")]}],
        },
    )
    assert created.status_code == 201, created.text
    study = created.json()
    constraint = study["stages"][0]["root_group"]["constraints"][0]
    assert constraint["operator"] == "level_at_least"
    assert constraint["labels"] == ["Bom"]
    run = client.post(f"/api/selection/studies/{study['id']}/run")
    assert run.status_code == 200, run.text
    assert [c["record_id"] for c in run.json()["candidates"]] == [materials[0].id]


# --- demo seed and its removal -------------------------------------------------


def test_demo_levels_are_deterministic_and_sometimes_missing() -> None:
    assert demo_level("Aço Demo B", "x") == demo_level("Aço Demo B", "x")
    outcomes = {demo_level(f"material {i}", "x") for i in range(60)}
    assert None in outcomes
    assert outcomes - {None} <= set(range(len(DEMO_SCALE)))


def test_the_demo_seed_writes_only_on_demo_materials_and_is_idempotent(db_session) -> None:
    source = db_session.execute(select(Source).where(Source.is_demo.is_(True))).scalars().first()
    first = seed_demo_ordinals(db_session, source)
    demo_count = len(
        db_session.execute(select(Material.id).where(Material.is_demo.is_(True))).all()
    )
    assert first == {"ordinal_definitions_created": 2, "ordinal_values_created": 2 * demo_count}
    again = seed_demo_ordinals(db_session, source)
    assert again == {"ordinal_definitions_created": 0, "ordinal_values_created": 0}
    rows = db_session.execute(select(MaterialOrdinalValue)).scalars().all()
    assert all(row.is_demo and row.source_id == source.id for row in rows)
    assert any(row.is_missing for row in rows)

    report = clear_demo_data(db_session)
    assert report["ordinal_values"] == 2 * demo_count
    assert report["ordinal_definitions"] == 2
    assert db_session.execute(select(OrdinalPropertyDefinition)).first() is None


# --- the official bundle (D-102): structure only ------------------------------


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _bundle(tmp_path: Path, extra: dict[str, list[dict]]) -> Path:
    files = {
        "material_classes.ndjson": [
            {
                "external_id": "mc",
                "name": "Classe",
                "slug": "classe-ord",
                "parent_external_id": None,
            }
        ],
        "materials.ndjson": [
            {"external_id": f"m{i}", "raw_sha256": _hash(f"m{i}"), "name": f"Ord {i}"}
            | {"class_external_id": "mc"}
            for i in range(2)
        ],
        **extra,
    }
    encoded = {
        name: "".join(json.dumps(r, sort_keys=True) + "\n" for r in rows).encode()
        for name, rows in files.items()
    }
    manifest = {
        "schema_version": 1,
        "dataset": {
            "slug": "official-ordinal-r1",
            "name": "Ordinal Test",
            "release": "R1",
            "source_sha256": _hash("ordinal-source"),
            "license_label": "Uso autorizado em teste",
        },
        "files": {
            name: {"sha256": hashlib.sha256(raw).hexdigest(), "count": len(files[name])}
            for name, raw in encoded.items()
        },
    }
    path = tmp_path / "ordinal.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("manifest.json", json.dumps(manifest, sort_keys=True))
        for name, raw in encoded.items():
            archive.writestr(name, raw)
    return path


ORDINAL_FILES = {
    "ordinal_property_definitions.ndjson": [
        {"slug": "ord-oficial", "name": "Ordinal de teste", "levels": ["Baixo", "Médio", "Alto"]}
    ],
    "material_ordinal_values.ndjson": [
        {"material_external_id": "m0", "property_slug": "ord-oficial", "state": "level"}
        | {"level": "Médio"},
        {"material_external_id": "m1", "property_slug": "ord-oficial", "state": "missing"},
    ],
}


def test_the_bundle_carries_a_scale_and_its_levels(tmp_path: Path, db_session) -> None:
    bundle = verify_bundle(_bundle(tmp_path, ORDINAL_FILES))
    assert validate_semantics(bundle)["material_ordinal_values.ndjson"] == 2
    clear_demo_data(db_session)
    reviewer = User(google_sub="ord-reviewer", email="ord@example.com", name="Revisor")
    db_session.add(reviewer)
    db_session.flush()
    result = OfficialCatalogImporter(db_session, bundle, reviewer_email=reviewer.email).run()
    assert result["counts"]["ordinal_definitions_created"] == 1
    assert result["counts"]["ordinal_values_created"] == 2
    rows = db_session.execute(select(MaterialOrdinalValue)).scalars().all()
    assert sorted((r.is_missing, r.is_demo) for r in rows) == [(False, False), (True, False)]


@pytest.mark.parametrize(
    "bad",
    [
        {"levels": ["Só"]},
        {"levels": "Baixo, Alto"},
    ],
)
def test_the_bundle_refuses_a_scale_that_cannot_order(tmp_path: Path, bad) -> None:
    files = {
        "ordinal_property_definitions.ndjson": [
            {"slug": "ord-oficial", "name": "Ordinal de teste", **bad}
        ]
    }
    with pytest.raises(OfficialCatalogImportError):
        validate_semantics(verify_bundle(_bundle(tmp_path, files)))


def test_the_bundle_refuses_a_level_off_the_scale_or_a_missing_with_a_level(
    tmp_path: Path,
) -> None:
    for value in (
        {"state": "level", "level": "Altíssimo"},
        {"state": "missing", "level": "Alto"},
        {"state": "zero"},
    ):
        files = {
            **ORDINAL_FILES,
            "material_ordinal_values.ndjson": [
                {"material_external_id": "m0", "property_slug": "ord-oficial", **value}
            ],
        }
        with pytest.raises(OfficialCatalogImportError):
            validate_semantics(verify_bundle(_bundle(tmp_path, files)))


def test_the_official_import_refuses_while_a_demo_scale_exists(tmp_path: Path, db_session) -> None:
    clear_demo_data(db_session)
    _definition(db_session, slug="demo-x").is_demo = True
    db_session.flush()
    reviewer = User(google_sub="ord-reviewer-2", email="ord2@example.com", name="Revisor")
    db_session.add(reviewer)
    db_session.flush()
    bundle = verify_bundle(_bundle(tmp_path, ORDINAL_FILES))
    with pytest.raises(OfficialCatalogImportError, match="ordinal_definitions"):
        OfficialCatalogImporter(db_session, bundle, reviewer_email=reviewer.email).run()
