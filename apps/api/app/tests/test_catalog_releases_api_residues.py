"""TM7-e/f/g seen from the API: what the diff says about the three residues.

Same fictitious two-release setup as ``test_catalog_releases_api`` (real importer,
real endpoint). Three cases the first suite does not reach:

* a record switched off (what a promotion does to the whole base release, D-114)
  is still ``inalterado`` — comparing the flag would mark everything as changed;
* the same density written as ``kg/m**3`` and as ``kg/m³`` is a change of the
  *writing* (principle 4), never of the value, and the rule text says so;
* a range that lost its representative point on one side is a change of *form*,
  and the absent number is written as such, never shown as zero.

The domain suite (``test_release_diff_universes``) covers the same rules
without the database; this one proves the endpoint speaks them.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.catalog import CatalogDataset, CatalogRecordRef
from app.models.material import Material
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition
from app.models.user import User
from app.tests.test_catalog_releases_api import (
    _change,
    _items,
    _material,
    _scalar,
    import_bundle,
    reviewer,  # noqa: F401  (fixture)
    write_bundle,
)

URL = "/api/catalogo/releases/ficticio-r1/diff/ficticio-r2"


def _interval(material: str, low: float, high: float, typical: float) -> dict:
    return {
        "material_external_id": material,
        "property_slug": "densidade",
        "value_kind": "interval",
        "min": low,
        "max": high,
        "typical": typical,
        "original_unit": "kg/m**3",
    }


RELEASE_1 = {
    "materials.ndjson": [
        _material("mat-a", "Liga Fictícia A"),
        _material("mat-s", "Liga Fictícia S"),
        _material("mat-i", "Liga Fictícia I"),
    ],
    "material_values.ndjson": [
        _scalar("mat-a", "densidade", 7850.0, "kg/m**3"),
        _scalar("mat-s", "densidade", 7850.0, "kg/m^3"),
        _interval("mat-i", 7800.0, 7900.0, 7850.0),
    ],
}

RELEASE_2 = {
    "materials.ndjson": RELEASE_1["materials.ndjson"],
    "material_values.ndjson": [
        _scalar("mat-a", "densidade", 7850.0, "kg/m**3"),
        # Same physical number, another spelling of the unit.
        _scalar("mat-s", "densidade", 7850.0, "kg/m³"),
        _interval("mat-i", 7800.0, 7900.0, 7850.0),
    ],
}


@pytest.fixture()
def releases(tmp_path: Path, db_session: Session, reviewer: User) -> Session:  # noqa: F811
    import_bundle(db_session, write_bundle(tmp_path, "ficticio-r1", "R1", RELEASE_1), reviewer)
    import_bundle(db_session, write_bundle(tmp_path, "ficticio-r2", "R2", RELEASE_2), reviewer)
    return db_session


def _material_ids(db: Session, release_slug: str) -> dict[str, int]:
    rows = db.execute(
        select(CatalogRecordRef.external_record_id, CatalogRecordRef.material_id)
        .join(CatalogDataset, CatalogDataset.id == CatalogRecordRef.dataset_id)
        .where(CatalogDataset.slug == release_slug)
    ).all()
    return {external_id: material_id for external_id, material_id in rows}


# -- TM7-e -----------------------------------------------------------------------


def test_a_switched_off_base_release_is_not_a_change(client, releases: Session) -> None:
    base = _material_ids(releases, "ficticio-r1")
    releases.execute(update(Material).where(Material.id.in_(base.values())).values(is_active=False))
    releases.flush()
    body = client.get(URL).json()
    assert body["total"] == 3
    item = _items(body)["mat-a"]
    assert item["status"] == "inalterado" and item["changes"] == []
    # The state of each release is still in the contract, just not as a change.
    assert item["base"]["is_active"] is False and item["target"]["is_active"] is True


# -- TM7-g -----------------------------------------------------------------------


def test_the_spelling_of_a_unit_is_writing_never_value(client, releases: Session) -> None:
    body = client.get(URL).json()
    item = _items(body)["mat-s"]
    assert item["status"] == "alterado"
    density = _change(item, "propriedade:densidade")
    assert density["kind"] == "escrita_da_fonte"
    assert density["before"]["canonical"]["value"] == pytest.approx(7850.0)
    assert density["after"]["canonical"]["value"] == pytest.approx(7850.0)
    assert density["before"]["original"]["unit"] != density["after"]["original"]["unit"]
    # The screen's rule text names the spelling, so the label is not a surprise.
    assert "kg/m^3 ou kg/m³" in body["rule"]


# -- TM7-f -----------------------------------------------------------------------


def test_a_range_that_lost_its_representative_is_form_with_the_gap_written(
    client, releases: Session
) -> None:
    target = _material_ids(releases, "ficticio-r2")["mat-i"]
    density_id = releases.execute(
        select(PropertyDefinition.id).where(PropertyDefinition.slug == "densidade")
    ).scalar_one()
    releases.execute(
        update(MaterialPropertyValue)
        .where(
            MaterialPropertyValue.material_id == target,
            MaterialPropertyValue.property_id == density_id,
        )
        .values(normalized_value=None, value_typical=None)
    )
    releases.flush()
    item = _items(client.get(URL).json())["mat-i"]
    density = _change(item, "propriedade:densidade")
    assert density["kind"] == "forma"
    # The bounds survive on both sides; the missing point is None, never 0.
    assert density["after"]["canonical"]["value"] is None
    assert density["after"]["canonical"]["min"] == pytest.approx(7800.0)
    assert density["before"]["canonical"]["value"] == pytest.approx(7850.0)
