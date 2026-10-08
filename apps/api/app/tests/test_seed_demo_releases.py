"""The two fictitious catalogue releases the demo seed writes (D-108, D-71).

The seed is asserted about itself: the shape the screen "Mudanças entre releases"
reads, idempotence, the count the log prints, and that ``clear_demo`` takes the
whole set away. No test here touches an official bundle.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.clear_demo import clear_demo_data
from app.db.seed_demo_releases import DEMO_LINEAGE, DEMO_RELEASES, seed_demo_releases
from app.exporters.report import DEMO_DATA_NOTICE
from app.models.catalog import CatalogDataset, CatalogRecordRef
from app.models.material import Material
from app.models.source import Source

R1, R2 = "catalogo-demo-r1", "catalogo-demo-r2"


def _datasets(db: Session) -> list[CatalogDataset]:
    return list(
        db.execute(select(CatalogDataset).where(CatalogDataset.lineage == DEMO_LINEAGE)).scalars()
    )


def _change(item: dict, field: str) -> dict:
    return next(change for change in item["changes"] if change["field"] == field)


def test_the_seed_writes_two_demo_releases_of_one_lineage(db_session: Session) -> None:
    summary = seed_demo_releases(db_session)
    assert summary == {
        "catalog_releases_created": 2,
        "catalog_records_created": 10,
        "catalog_release_values_created": 18,
    }
    datasets = sorted(_datasets(db_session), key=lambda d: d.id)
    assert [d.slug for d in datasets] == [R1, R2]  # R1 is written first
    assert all(d.is_demo and d.lineage == DEMO_LINEAGE for d in datasets)
    assert [d.release for d in datasets] == ["Demo R1", "Demo R2"]
    for dataset in datasets:
        assert len(dataset.source_sha256) == 64
        refs = db_session.execute(
            select(CatalogRecordRef).where(CatalogRecordRef.dataset_id == dataset.id)
        ).scalars()
        materials = [db_session.get(Material, ref.material_id) for ref in refs]
        assert len(materials) == 5
        assert all(m is not None and m.is_demo and m.owner_id is None for m in materials)
    # One Material per record per release, never shared between the two.
    ids = list(db_session.execute(select(CatalogRecordRef.material_id)).scalars())
    sources = list(
        db_session.execute(select(Source).where(Source.label.like("Catálogo Demo%"))).scalars()
    )
    assert len(sources) == 2 and all(s.is_demo for s in sources)
    assert len(ids) == len(set(ids))


def test_the_seed_is_idempotent(db_session: Session) -> None:
    seed_demo_releases(db_session)
    count = lambda model: db_session.scalar(select(func.count(model.id)))  # noqa: E731
    before = (count(CatalogDataset), count(CatalogRecordRef), count(Material), count(Source))
    assert seed_demo_releases(db_session) == {
        "catalog_releases_created": 0,
        "catalog_records_created": 0,
        "catalog_release_values_created": 0,
    }
    assert (
        count(CatalogDataset),
        count(CatalogRecordRef),
        count(Material),
        count(Source),
    ) == before


def test_the_script_covers_every_case_the_screen_shows(client, db_session: Session) -> None:
    seed_demo_releases(db_session)
    body = client.get(f"/api/catalogo/releases/{R1}/diff/{R2}").json()
    assert body["is_demo"] is True and body["lineage"] == DEMO_LINEAGE
    assert {c["status"]: c["count"] for c in body["counts"]} == {
        "alterado": 3,
        "novo": 1,
        "desativado": 1,
        "inalterado": 1,
    }
    items = {item["external_record_id"]: item for item in body["items"]}
    assert items["demo-001"]["status"] == "inalterado"
    assert items["demo-004"]["status"] == "desativado" and items["demo-004"]["target"] is None
    novo = items["demo-006"]
    assert novo["status"] == "novo" and novo["target"]["class_slug"] == "compositos"
    assert items["demo-005"]["changes"][0]["field"] == "nome"

    density = _change(items["demo-002"], "propriedade:densidade")
    assert density["kind"] == "valor"
    assert density["before"]["original"]["unit"] == "kg/m**3"
    assert density["after"]["original"]["unit"] == "g/cm**3"
    assert _change(items["demo-002"], "propriedade:modulo_young")["kind"] == "escrita_da_fonte"

    conductivity = _change(items["demo-003"], "propriedade:condutividade_termica")
    assert conductivity["kind"] == "ausencia"
    assert (
        conductivity["before"]["state"] == "ausente" and conductivity["before"]["reading"] is None
    )
    unregistered = _change(items["demo-003"], "propriedade:temp_max_servico")
    assert unregistered["before"]["state"] == "nao_cadastrado"
    assert unregistered["after"]["canonical"]["value"] == 383.15


def test_the_demo_export_carries_the_fictitious_notice(client, db_session: Session) -> None:
    seed_demo_releases(db_session)
    response = client.get(f"/api/exports/catalogo/releases/{R1}/diff/{R2}.csv")
    assert response.status_code == 200 and DEMO_DATA_NOTICE in response.text


def test_clear_demo_removes_the_releases_their_materials_and_sources(
    client, db_session: Session
) -> None:
    seed_demo_releases(db_session)
    removed = clear_demo_data(db_session)
    db_session.flush()
    assert removed["catalog_releases"] >= 2
    assert not _datasets(db_session)
    assert (
        db_session.scalar(
            select(func.count(CatalogRecordRef.id)).where(
                CatalogRecordRef.external_record_id.like("demo-00%")
            )
        )
        == 0
    )
    assert not db_session.execute(select(Material).where(Material.name.like("%Demo%"))).first()
    assert not db_session.execute(select(Source).where(Source.label.like("Catálogo Demo%"))).first()
    assert client.get(f"/api/catalogo/releases/{R1}/diff/{R2}").status_code == 404


def test_every_release_in_the_script_is_listed_by_the_api(client, db_session: Session) -> None:
    seed_demo_releases(db_session)
    rows = {r["slug"]: r for r in client.get("/api/catalogo/releases").json()}
    assert rows[R2]["previous_slug"] == R1 and rows[R1]["previous_slug"] is None
    assert [rows[spec.slug]["material_count"] for spec in DEMO_RELEASES] == [5, 5]
    assert rows[R1]["imported_at"] is None and rows[R1]["is_demo"] is True
