"""Duas releases fictícias do catálogo, comparáveis, para a tela "Mudanças entre releases".

⚠️  Dados exclusivamente demonstrativos. Os números foram inventados para exercitar
cada caso do diff (D-108); não vêm de Granta, MatWeb, ASM nem de nenhuma base.

O importador oficial **recusa** dado de demonstração, então estas releases são
escritas direto, no mesmo desenho que ele usa para uma release real: uma linha
``CatalogDataset`` por release, **um ``Material`` por release para cada registro**
(nunca o mesmo material nas duas — as duas refs leriam os mesmos valores e o
registro sairia sempre "inalterado"), uma ``CatalogRecordRef`` por material e os
valores pelos construtores de ``app.domain.data_quality``.

O roteiro, de R1 para R2 (``demo-001`` a ``demo-006``):

* ``demo-001`` — inalterado;
* ``demo-002`` — densidade 7850 kg/m³ → 7,9 g/cm³ (valor **e** unidade mudam) e
  módulo de Young 200 GPa → 200000 MPa (só a escrita da fonte: mesmo valor físico);
* ``demo-003`` — condutividade térmica declarada ausente → valor, e temperatura
  máxima de serviço não cadastrada → valor;
* ``demo-004`` — só na R1 (desativado);
* ``demo-005`` — renomeado (campo "Nome");
* ``demo-006`` — só na R2, noutra classe (novo).

Idempotente: a release é achada pelo slug e o registro por (release, tabela, id
externo); rodar de novo não cria nada. Chamado por ``app.db.seed_extended`` —
o módulo que ``semear_demo`` (``admin-banco.yml``) e ``scripts/seed.ps1`` executam
(D-71) — e apagado por ``app.db.clear_demo`` (``is_demo=True`` na release, no
material e na fonte).
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.data_quality import (
    NormalizedValue,
    build_scalar_value,
    missing_value,
)
from app.models.catalog import CatalogDataset, CatalogRecordRef
from app.models.enums import DataQuality
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition
from app.models.source import Source

#: The catalogue both releases belong to: the line that makes them comparable.
DEMO_LINEAGE = "catalogo-demo"
DEMO_CATALOGUE_NAME = "Catálogo Demo MaterialSelect"
DEMO_EXTERNAL_TABLE = "MaterialUniverse"
DEMO_LICENSE = "Dado fictício de demonstração — não é conteúdo de terceiro"
DEMO_NOTICE = "Dados exclusivamente demonstrativos. Não utilizar em projetos reais."


@dataclass(frozen=True)
class _Value:
    """One property of a record: a scalar, a declared absence, or (by omission) nothing."""

    slug: str
    #: ``None`` with ``missing`` = declared absent by the source.
    number: float | None = None
    unit: str | None = None
    missing: bool = False


@dataclass(frozen=True)
class _Record:
    external_id: str
    name: str
    class_slug: str
    subclass: str | None = None
    values: tuple[_Value, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class _Release:
    slug: str
    release: str
    records: tuple[_Record, ...]


DEMO_RELEASES: tuple[_Release, ...] = (
    _Release(
        slug="catalogo-demo-r1",
        release="Demo R1",
        records=(
            _Record(
                "demo-001",
                "Aço Demo Estrutural",
                "metais",
                "Aços",
                (_Value("densidade", 7850.0, "kg/m**3"), _Value("modulo_young", 200.0, "GPa")),
            ),
            _Record(
                "demo-002",
                "Aço Demo Inoxidável",
                "metais",
                "Aços",
                (_Value("densidade", 7850.0, "kg/m**3"), _Value("modulo_young", 200.0, "GPa")),
            ),
            _Record(
                "demo-003",
                "Polímero Demo Técnico",
                "polimeros",
                None,
                (
                    _Value("densidade", 1140.0, "kg/m**3"),
                    # Declared absent by the source in R1; R2 gives a number.
                    _Value("condutividade_termica", missing=True),
                    # temp_max_servico is not registered at all in R1.
                ),
            ),
            _Record(
                "demo-004",
                "Cerâmica Demo Refratária",
                "ceramicas",
                None,
                (_Value("densidade", 3900.0, "kg/m**3"),),
            ),
            _Record(
                "demo-005",
                "Liga Demo de Cobre",
                "metais",
                "Ligas de Cobre",
                (_Value("densidade", 8960.0, "kg/m**3"),),
            ),
        ),
    ),
    _Release(
        slug="catalogo-demo-r2",
        release="Demo R2",
        records=(
            _Record(
                "demo-001",
                "Aço Demo Estrutural",
                "metais",
                "Aços",
                (_Value("densidade", 7850.0, "kg/m**3"), _Value("modulo_young", 200.0, "GPa")),
            ),
            _Record(
                "demo-002",
                "Aço Demo Inoxidável",
                "metais",
                "Aços",
                (_Value("densidade", 7.9, "g/cm**3"), _Value("modulo_young", 200000.0, "MPa")),
            ),
            _Record(
                "demo-003",
                "Polímero Demo Técnico",
                "polimeros",
                None,
                (
                    _Value("densidade", 1140.0, "kg/m**3"),
                    _Value("condutividade_termica", 0.25, "W/(m*K)"),
                    _Value("temp_max_servico", 110.0, "degC"),
                ),
            ),
            _Record(
                "demo-005",
                "Liga Demo de Cobre (revisada)",
                "metais",
                "Ligas de Cobre",
                (_Value("densidade", 8960.0, "kg/m**3"),),
            ),
            _Record(
                "demo-006",
                "Compósito Demo Laminado",
                "compositos",
                None,
                (_Value("densidade", 1600.0, "kg/m**3"), _Value("modulo_young", 70.0, "GPa")),
            ),
        ),
    ),
)


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _normalized(value: _Value, prop: PropertyDefinition) -> NormalizedValue:
    if value.missing:
        return missing_value()
    assert value.number is not None and value.unit is not None  # guarded by authoring
    return build_scalar_value(value.number, value.unit, prop.canonical_unit)


def _get_or_create_source(db: Session, release: _Release) -> Source:
    label = f"{DEMO_CATALOGUE_NAME} — {release.release}"
    source = db.execute(select(Source).where(Source.label == label)).scalar_one_or_none()
    if source is None:
        source = Source(
            label=label, reference=DEMO_NOTICE, is_demo=True, license_label=DEMO_LICENSE
        )
        db.add(source)
        db.flush()
    return source


def seed_demo_releases(db: Session) -> dict[str, int]:
    """Write the two fictitious releases; return what this run created.

    Requires the baseline seed (classes and properties). Nothing is written to a
    release that already exists, so a rerun counts zero and changes nothing.
    """
    classes = {c.slug: c for c in db.execute(select(MaterialClass)).scalars()}
    properties = {p.slug: p for p in db.execute(select(PropertyDefinition)).scalars()}

    releases_created = records_created = values_created = 0
    for spec in DEMO_RELEASES:
        source = _get_or_create_source(db, spec)
        dataset = db.execute(
            select(CatalogDataset).where(CatalogDataset.slug == spec.slug)
        ).scalar_one_or_none()
        if dataset is None:
            dataset = CatalogDataset(
                slug=spec.slug,
                name=DEMO_CATALOGUE_NAME,
                release=spec.release,
                lineage=DEMO_LINEAGE,
                source_sha256=_sha256(spec.slug),
                license_label=DEMO_LICENSE,
                provenance=DEMO_NOTICE,
                is_demo=True,
            )
            db.add(dataset)
            db.flush()
            releases_created += 1

        for record in spec.records:
            exists = db.execute(
                select(CatalogRecordRef.id).where(
                    CatalogRecordRef.dataset_id == dataset.id,
                    CatalogRecordRef.external_table == DEMO_EXTERNAL_TABLE,
                    CatalogRecordRef.external_record_id == record.external_id,
                )
            ).first()
            if exists is not None:
                continue
            material = Material(
                name=record.name,
                class_id=classes[record.class_slug].id,
                subclass=record.subclass,
                keywords=[],
                is_demo=True,
            )
            db.add(material)
            db.flush()
            db.add(
                CatalogRecordRef(
                    dataset_id=dataset.id,
                    external_table=DEMO_EXTERNAL_TABLE,
                    external_record_id=record.external_id,
                    raw_record_sha256=_sha256(f"{spec.slug}:{record.external_id}"),
                    material_id=material.id,
                )
            )
            for value in record.values:
                prop = properties[value.slug]
                nv = _normalized(value, prop)
                db.add(
                    MaterialPropertyValue(
                        material_id=material.id,
                        property_id=prop.id,
                        value_scalar=nv.value_scalar,
                        original_unit=nv.original_unit,
                        normalized_value=nv.normalized_value,
                        canonical_unit=nv.canonical_unit,
                        conversion_method=nv.conversion_method,
                        is_missing=nv.is_missing,
                        source_id=source.id,
                        data_quality=DataQuality.ESTIMADO,
                    )
                )
                values_created += 1
            records_created += 1

    db.flush()
    return {
        "catalog_releases_created": releases_created,
        "catalog_records_created": records_created,
        "catalog_release_values_created": values_created,
    }
