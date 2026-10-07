"""Transactional importer for a verified canonical official catalogue bundle."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.catalog.bundle import BundleValidationError, VerifiedBundle, verify_bundle
from app.domain.data_quality import build_interval_value, build_scalar_value, missing_value
from app.models.catalog import (
    CatalogDataset,
    CatalogImportRun,
    CatalogRecordRef,
    CatalogSupplementalValue,
)
from app.models.enums import (
    BetterDirection,
    DataQuality,
    ProcessAttributeKind,
    PropertyCategory,
)
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.process import MaterialProcess, Process, ProcessClass
from app.models.process_attribute import ProcessAttributeDefinition, ProcessAttributeValue
from app.models.property_definition import PropertyDefinition
from app.models.source import Source
from app.models.transport_mode import TransportMode
from app.models.user import User
from app.repositories.material_repository import MaterialRepository


KNOWN_FILES = {
    "material_classes.ndjson",
    "property_definitions.ndjson",
    "materials.ndjson",
    "material_values.ndjson",
    "process_classes.ndjson",
    "process_attribute_definitions.ndjson",
    "processes.ndjson",
    "process_attribute_values.ndjson",
    "material_process_links.ndjson",
    "transport_modes.ndjson",
    "supplemental_values.ndjson",
}


class OfficialCatalogImportError(ValueError):
    """The bundle is valid bytes but not valid for the MaterialSelect model."""


def _need(record: dict, *fields: str) -> None:
    missing = [field for field in fields if record.get(field) in (None, "")]
    if missing:
        raise OfficialCatalogImportError(f"Campos obrigatórios ausentes: {missing}")


def _external_key(record: dict, default_table: str) -> tuple[str, str]:
    _need(record, "external_id")
    return str(record.get("external_table") or default_table), str(record["external_id"])


def _raw_hash(record: dict) -> str:
    value = record.get("raw_sha256")
    if not isinstance(value, str) or len(value) != 64:
        raise OfficialCatalogImportError("raw_sha256 obrigatório e deve ter 64 caracteres.")
    return value


def _collect_ids(bundle: VerifiedBundle, file_name: str) -> set[str]:
    result: set[str] = set()
    for record in bundle.iter_records(file_name):
        _need(record, "external_id")
        value = str(record["external_id"])
        if value in result:
            raise OfficialCatalogImportError(f"external_id duplicado em {file_name}: {value}")
        result.add(value)
    return result


def validate_semantics(bundle: VerifiedBundle) -> dict[str, int]:
    """Validate references between bundle files without writing to the database."""
    unknown = set(bundle.files) - KNOWN_FILES
    if unknown:
        raise OfficialCatalogImportError(
            "Arquivos canônicos desconhecidos: " + ", ".join(sorted(unknown))
        )

    class_ids = _collect_ids(bundle, "material_classes.ndjson")
    material_ids = _collect_ids(bundle, "materials.ndjson")
    process_class_ids = _collect_ids(bundle, "process_classes.ndjson")
    process_ids = _collect_ids(bundle, "processes.ndjson")
    transport_ids = _collect_ids(bundle, "transport_modes.ndjson")

    property_slugs: set[str] = set()
    for record in bundle.iter_records("property_definitions.ndjson"):
        _need(
            record,
            "slug",
            "name",
            "category",
            "canonical_unit",
            "physical_dimension",
        )
        slug = str(record["slug"])
        if slug in property_slugs:
            raise OfficialCatalogImportError(f"slug de propriedade duplicado: {slug}")
        PropertyCategory(str(record["category"]))
        BetterDirection(str(record.get("better_direction", "NEUTRAL")))
        property_slugs.add(slug)

    process_attr_slugs: set[str] = set()
    for record in bundle.iter_records("process_attribute_definitions.ndjson"):
        _need(record, "slug", "name", "kind", "physical_dimension")
        slug = str(record["slug"])
        if slug in process_attr_slugs:
            raise OfficialCatalogImportError(f"slug de atributo de processo duplicado: {slug}")
        ProcessAttributeKind(str(record["kind"]))
        BetterDirection(str(record.get("better_direction", "NEUTRAL")))
        process_attr_slugs.add(slug)

    for record in bundle.iter_records("material_classes.ndjson"):
        parent = record.get("parent_external_id")
        if parent is not None and str(parent) not in class_ids:
            raise OfficialCatalogImportError(
                f"Classe {record.get('external_id')} referencia pai inexistente: {parent}"
            )

    for record in bundle.iter_records("materials.ndjson"):
        _need(record, "name", "class_external_id")
        _raw_hash(record)
        if str(record["class_external_id"]) not in class_ids:
            raise OfficialCatalogImportError(
                f"Material {record.get('external_id')} referencia classe inexistente."
            )

    for record in bundle.iter_records("material_values.ndjson"):
        _need(record, "material_external_id", "property_slug", "value_kind")
        if str(record["material_external_id"]) not in material_ids:
            raise OfficialCatalogImportError("Valor referencia material inexistente.")
        if str(record["property_slug"]) not in property_slugs:
            raise OfficialCatalogImportError("Valor referencia propriedade inexistente.")
        if record["value_kind"] not in {"missing", "scalar", "interval"}:
            raise OfficialCatalogImportError(
                f"value_kind de material inválido: {record['value_kind']!r}"
            )

    for record in bundle.iter_records("process_classes.ndjson"):
        parent = record.get("parent_external_id")
        if parent is not None and str(parent) not in process_class_ids:
            raise OfficialCatalogImportError(
                f"Classe de processo referencia pai inexistente: {parent}"
            )

    for record in bundle.iter_records("processes.ndjson"):
        _need(record, "name", "slug", "class_external_id")
        _raw_hash(record)
        if str(record["class_external_id"]) not in process_class_ids:
            raise OfficialCatalogImportError("Processo referencia classe inexistente.")

    for record in bundle.iter_records("process_attribute_values.ndjson"):
        _need(record, "process_external_id", "attribute_slug", "value_kind")
        if str(record["process_external_id"]) not in process_ids:
            raise OfficialCatalogImportError("Atributo referencia processo inexistente.")
        if str(record["attribute_slug"]) not in process_attr_slugs:
            raise OfficialCatalogImportError("Valor referencia atributo de processo inexistente.")
        if record["value_kind"] not in {"missing", "scalar", "envelope", "discrete"}:
            raise OfficialCatalogImportError(
                f"value_kind de processo inválido: {record['value_kind']!r}"
            )

    for record in bundle.iter_records("material_process_links.ndjson"):
        _need(record, "material_external_id", "process_external_id")
        if str(record["material_external_id"]) not in material_ids:
            raise OfficialCatalogImportError("Link referencia material inexistente.")
        if str(record["process_external_id"]) not in process_ids:
            raise OfficialCatalogImportError("Link referencia processo inexistente.")

    for record in bundle.iter_records("transport_modes.ndjson"):
        _need(record, "slug", "name")
        _raw_hash(record)

    for record in bundle.iter_records("supplemental_values.ndjson"):
        _need(
            record,
            "target_type",
            "target_external_id",
            "external_attribute_id",
            "attribute_name",
            "value_kind",
            "raw_sha256",
        )
        target_id = str(record["target_external_id"])
        if record["target_type"] == "material" and target_id not in material_ids:
            raise OfficialCatalogImportError("Suplemento referencia material inexistente.")
        if record["target_type"] == "process" and target_id not in process_ids:
            raise OfficialCatalogImportError("Suplemento referencia processo inexistente.")
        if record["target_type"] == "transport" and target_id not in transport_ids:
            raise OfficialCatalogImportError("Suplemento referencia modal inexistente.")
        if record["target_type"] not in {"material", "process", "transport"}:
            raise OfficialCatalogImportError("target_type suplementar inválido.")

    return {name: spec.count for name, spec in bundle.files.items()}


class OfficialCatalogImporter:
    """Map a verified canonical bundle into the shared reference catalogue."""

    def __init__(self, db: Session, bundle: VerifiedBundle, reviewer_email: str) -> None:
        self.db = db
        self.bundle = bundle
        self.reviewer_email = reviewer_email
        self.dataset: CatalogDataset | None = None
        self.source: Source | None = None
        self.material_classes: dict[str, MaterialClass] = {}
        self.properties: dict[str, PropertyDefinition] = {}
        self.materials: dict[str, Material] = {}
        self.process_classes: dict[str, ProcessClass] = {}
        self.process_attributes: dict[str, ProcessAttributeDefinition] = {}
        self.processes: dict[str, Process] = {}
        self.transports: dict[str, TransportMode] = {}
        self.counts: dict[str, int] = {}

    def _bump(self, key: str, amount: int = 1) -> None:
        self.counts[key] = self.counts.get(key, 0) + amount

    def _assert_demo_cleared(self) -> None:
        remaining = {
            "materials": self.db.scalar(
                select(func.count(Material.id)).where(Material.is_demo.is_(True))
            )
            or 0,
            "processes": self.db.scalar(
                select(func.count(Process.id)).where(Process.is_demo.is_(True))
            )
            or 0,
            "transport_modes": self.db.scalar(
                select(func.count(TransportMode.id)).where(TransportMode.is_demo.is_(True))
            )
            or 0,
        }
        if any(remaining.values()):
            raise OfficialCatalogImportError(
                "Catálogo demo ainda existe. Execute excluir_demo antes do import oficial: "
                f"{remaining}"
            )

    def _reviewer(self) -> User:
        reviewer = (
            self.db.execute(select(User).where(User.email == self.reviewer_email))
            .scalars()
            .one_or_none()
        )
        if reviewer is None:
            raise OfficialCatalogImportError(
                f"Usuário revisor não encontrado: {self.reviewer_email}"
            )
        return reviewer

    def _ensure_dataset_and_source(self) -> None:
        meta = self.bundle.manifest["dataset"]
        reviewer = self._reviewer()
        dataset = (
            self.db.execute(select(CatalogDataset).where(CatalogDataset.slug == meta["slug"]))
            .scalars()
            .one_or_none()
        )
        if dataset is not None:
            if dataset.source_sha256 != meta["source_sha256"]:
                raise OfficialCatalogImportError(
                    "O slug do dataset já existe com outro source_sha256; "
                    "use um slug de release distinto."
                )
            if dataset.license_label != meta["license_label"]:
                raise OfficialCatalogImportError(
                    "A licença declarada diverge da registrada para este dataset."
                )
        else:
            dataset = CatalogDataset(
                slug=meta["slug"],
                name=meta["name"],
                release=meta.get("release"),
                source_sha256=meta["source_sha256"],
                license_label=meta["license_label"],
                provenance=meta.get("provenance"),
                is_active=True,
            )
            self.db.add(dataset)
            self.db.flush()
        self.dataset = dataset

        source_label = meta.get("source_label") or (
            f"{meta['name']} — {meta.get('release')}" if meta.get("release") else meta["name"]
        )
        source = (
            self.db.execute(select(Source).where(Source.label == source_label))
            .scalars()
            .one_or_none()
        )
        if source is None:
            source = Source(
                label=source_label,
                reference=meta.get("provenance"),
                is_demo=False,
                license_label=meta["license_label"],
                license_url=meta.get("license_url"),
                contains_third_party_data=True,
                reviewed_by_user_id=reviewer.id,
                reviewed_at=datetime.now(UTC),
            )
            self.db.add(source)
            self.db.flush()
        elif source.license_label != meta["license_label"]:
            raise OfficialCatalogImportError(
                f"Source {source_label!r} já existe com licença diferente."
            )
        self.source = source

    def _existing_ref(
        self, external_table: str, external_id: str
    ) -> CatalogRecordRef | None:
        assert self.dataset is not None
        return (
            self.db.execute(
                select(CatalogRecordRef).where(
                    CatalogRecordRef.dataset_id == self.dataset.id,
                    CatalogRecordRef.external_table == external_table,
                    CatalogRecordRef.external_record_id == external_id,
                )
            )
            .scalars()
            .one_or_none()
        )

    def _add_ref(
        self,
        record: dict,
        default_table: str,
        *,
        material_id: int | None = None,
        process_id: int | None = None,
        transport_mode_id: int | None = None,
    ) -> None:
        assert self.dataset is not None
        table, external_id = _external_key(record, default_table)
        self.db.add(
            CatalogRecordRef(
                dataset_id=self.dataset.id,
                external_table=table,
                external_record_id=external_id,
                external_gruid=record.get("gruid"),
                raw_record_sha256=_raw_hash(record),
                material_id=material_id,
                process_id=process_id,
                transport_mode_id=transport_mode_id,
            )
        )

    def _import_hierarchy(
        self,
        file_name: str,
        model: type[MaterialClass] | type[ProcessClass],
        destination: dict[str, MaterialClass] | dict[str, ProcessClass],
    ) -> None:
        records = list(self.bundle.iter_records(file_name))
        pending = {str(row["external_id"]): row for row in records}
        while pending:
            progressed = False
            for external_id, row in list(pending.items()):
                parent_external = row.get("parent_external_id")
                if parent_external is not None and str(parent_external) not in destination:
                    continue
                existing = (
                    self.db.execute(select(model).where(model.slug == row["slug"]))
                    .scalars()
                    .one_or_none()
                )
                parent = destination.get(str(parent_external)) if parent_external is not None else None
                if existing is None:
                    existing = model(
                        name=row["name"],
                        slug=row["slug"],
                        description=row.get("description"),
                        applications=row.get("applications"),
                        characteristics=row.get("characteristics"),
                        parent_id=parent.id if parent else None,
                    )
                    self.db.add(existing)
                    self.db.flush()
                    self._bump(f"{file_name}:created")
                else:
                    if row.get("description") is not None:
                        existing.description = row["description"]
                    if row.get("applications") is not None:
                        existing.applications = row["applications"]
                    if row.get("characteristics") is not None:
                        existing.characteristics = row["characteristics"]
                destination[external_id] = existing
                del pending[external_id]
                progressed = True
            if not progressed:
                raise OfficialCatalogImportError(
                    f"Hierarquia cíclica ou pai ausente em {file_name}: {sorted(pending)}"
                )

    def _import_properties(self) -> None:
        for row in self.bundle.iter_records("property_definitions.ndjson"):
            slug = str(row["slug"])
            existing = (
                self.db.execute(
                    select(PropertyDefinition).where(PropertyDefinition.slug == slug)
                )
                .scalars()
                .one_or_none()
            )
            category = PropertyCategory(str(row["category"]))
            direction = BetterDirection(str(row.get("better_direction", "NEUTRAL")))
            if existing is None:
                existing = PropertyDefinition(
                    name=row["name"],
                    slug=slug,
                    symbol=row.get("symbol"),
                    description=row.get("description"),
                    category=category,
                    physical_dimension=row["physical_dimension"],
                    canonical_unit=row["canonical_unit"],
                    accepted_units=list(row.get("accepted_units", [row["canonical_unit"]])),
                    display_unit=row.get("display_unit"),
                    is_interval=bool(row.get("is_interval", False)),
                    better_direction=direction,
                    allows_log_scale=bool(row.get("allows_log_scale", True)),
                )
                self.db.add(existing)
                self.db.flush()
                self._bump("properties_created")
            else:
                if existing.canonical_unit != row["canonical_unit"]:
                    raise OfficialCatalogImportError(
                        f"Unidade canônica divergente para {slug}: "
                        f"{existing.canonical_unit!r} != {row['canonical_unit']!r}"
                    )
                if existing.physical_dimension != row["physical_dimension"]:
                    raise OfficialCatalogImportError(
                        f"Dimensão física divergente para {slug}."
                    )
            self.properties[slug] = existing

    def _import_materials(self) -> None:
        repo = MaterialRepository(self.db)
        for row in self.bundle.iter_records("materials.ndjson"):
            external_table, external_id = _external_key(row, "MaterialUniverse")
            existing_ref = self._existing_ref(external_table, external_id)
            if existing_ref is not None:
                if existing_ref.material_id is None:
                    raise OfficialCatalogImportError("Referência externa não aponta para material.")
                material = self.db.get(Material, existing_ref.material_id)
                if material is None:
                    raise OfficialCatalogImportError("Referência externa órfã de material.")
                if existing_ref.raw_record_sha256 != _raw_hash(row):
                    raise OfficialCatalogImportError(
                        f"Mesmo registro externo mudou bytes dentro do mesmo dataset: {external_id}"
                    )
                self.materials[external_id] = material
                self._bump("materials_unchanged")
                continue

            cls = self.material_classes[str(row["class_external_id"])]
            material = Material(
                name=row["name"],
                class_id=cls.id,
                subclass=row.get("subclass"),
                description=row.get("description"),
                keywords=list(row.get("keywords", [])),
                is_active=True,
                is_demo=False,
                owner_id=None,
            )
            self.db.add(material)
            self.db.flush()
            repo.sync_keywords(material.id, material.keywords)
            self._add_ref(row, "MaterialUniverse", material_id=material.id)
            self.materials[external_id] = material
            self._bump("materials_created")

    def _import_material_values(self) -> None:
        assert self.source is not None
        for row in self.bundle.iter_records("material_values.ndjson"):
            material = self.materials[str(row["material_external_id"])]
            prop = self.properties[str(row["property_slug"])]
            exists = self.db.execute(
                select(MaterialPropertyValue.id).where(
                    MaterialPropertyValue.material_id == material.id,
                    MaterialPropertyValue.property_id == prop.id,
                )
            ).scalar_one_or_none()
            if exists is not None:
                self._bump("material_values_unchanged")
                continue

            kind = row["value_kind"]
            if kind == "missing":
                value = missing_value()
            elif kind == "scalar":
                _need(row, "value", "original_unit")
                value = build_scalar_value(
                    float(row["value"]), str(row["original_unit"]), prop.canonical_unit
                )
            else:
                _need(row, "min", "max", "original_unit")
                typical = row.get("typical")
                value = build_interval_value(
                    float(row["min"]),
                    float(row["max"]),
                    str(row["original_unit"]),
                    prop.canonical_unit,
                    float(typical) if typical is not None else None,
                )

            self.db.add(
                MaterialPropertyValue(
                    material_id=material.id,
                    property_id=prop.id,
                    value_scalar=value.value_scalar,
                    value_min=value.value_min,
                    value_max=value.value_max,
                    value_typical=value.value_typical,
                    original_unit=value.original_unit,
                    normalized_value=value.normalized_value,
                    canonical_unit=value.canonical_unit,
                    conversion_method=value.conversion_method,
                    uncertainty=row.get("uncertainty"),
                    measurement_condition=row.get("measurement_condition"),
                    notes=row.get("notes"),
                    source_id=self.source.id,
                    data_quality=DataQuality.IMPORTADO,
                    is_missing=value.is_missing,
                )
            )
            self._bump("material_values_created")

    def _import_process_attributes(self) -> None:
        for row in self.bundle.iter_records("process_attribute_definitions.ndjson"):
            slug = str(row["slug"])
            existing = (
                self.db.execute(
                    select(ProcessAttributeDefinition).where(
                        ProcessAttributeDefinition.slug == slug
                    )
                )
                .scalars()
                .one_or_none()
            )
            kind = ProcessAttributeKind(str(row["kind"]))
            direction = BetterDirection(str(row.get("better_direction", "NEUTRAL")))
            if existing is None:
                existing = ProcessAttributeDefinition(
                    name=row["name"],
                    slug=slug,
                    symbol=row.get("symbol"),
                    description=row.get("description"),
                    kind=kind,
                    physical_dimension=row["physical_dimension"],
                    canonical_unit=row.get("canonical_unit"),
                    accepted_units=list(row.get("accepted_units", [])),
                    display_unit=row.get("display_unit"),
                    allowed_labels=list(row.get("allowed_labels", [])),
                    better_direction=direction,
                )
                self.db.add(existing)
                self.db.flush()
                self._bump("process_attributes_created")
            elif existing.kind != kind:
                raise OfficialCatalogImportError(
                    f"Tipo divergente para atributo de processo {slug}."
                )
            self.process_attributes[slug] = existing

    def _import_processes(self) -> None:
        for row in self.bundle.iter_records("processes.ndjson"):
            external_table, external_id = _external_key(row, "ProcessUniverse")
            existing_ref = self._existing_ref(external_table, external_id)
            if existing_ref is not None:
                if existing_ref.process_id is None:
                    raise OfficialCatalogImportError("Referência externa não aponta para processo.")
                process = self.db.get(Process, existing_ref.process_id)
                if process is None:
                    raise OfficialCatalogImportError("Referência externa órfã de processo.")
                if existing_ref.raw_record_sha256 != _raw_hash(row):
                    raise OfficialCatalogImportError(
                        f"Registro de processo mudou no mesmo dataset: {external_id}"
                    )
                self.processes[external_id] = process
                self._bump("processes_unchanged")
                continue

            cls = self.process_classes[str(row["class_external_id"])]
            process = Process(
                name=row["name"],
                slug=row["slug"],
                class_id=cls.id,
                description=row.get("description"),
                is_active=True,
                is_demo=False,
            )
            self.db.add(process)
            self.db.flush()
            self._add_ref(row, "ProcessUniverse", process_id=process.id)
            self.processes[external_id] = process
            self._bump("processes_created")

    def _import_process_values(self) -> None:
        assert self.source is not None
        for row in self.bundle.iter_records("process_attribute_values.ndjson"):
            process = self.processes[str(row["process_external_id"])]
            attr = self.process_attributes[str(row["attribute_slug"])]
            exists = self.db.execute(
                select(ProcessAttributeValue.id).where(
                    ProcessAttributeValue.process_id == process.id,
                    ProcessAttributeValue.attribute_id == attr.id,
                )
            ).scalar_one_or_none()
            if exists is not None:
                self._bump("process_values_unchanged")
                continue

            kind = row["value_kind"]
            labels: list[str] = []
            if kind == "missing":
                value = missing_value()
            elif kind == "discrete":
                value = missing_value()
                labels = list(row.get("labels", []))
                unknown = set(labels) - set(attr.allowed_labels)
                if unknown:
                    raise OfficialCatalogImportError(
                        f"Labels fora do vocabulário de {attr.slug}: {sorted(unknown)}"
                    )
            elif kind == "scalar":
                _need(row, "value", "original_unit")
                if attr.canonical_unit is None:
                    raise OfficialCatalogImportError(
                        f"Atributo numérico {attr.slug} sem unidade canônica."
                    )
                value = build_scalar_value(
                    float(row["value"]), str(row["original_unit"]), attr.canonical_unit
                )
            else:
                _need(row, "min", "max", "original_unit")
                if attr.canonical_unit is None:
                    raise OfficialCatalogImportError(
                        f"Atributo envelope {attr.slug} sem unidade canônica."
                    )
                typical = row.get("typical")
                value = build_interval_value(
                    float(row["min"]),
                    float(row["max"]),
                    str(row["original_unit"]),
                    attr.canonical_unit,
                    float(typical) if typical is not None else None,
                )

            self.db.add(
                ProcessAttributeValue(
                    process_id=process.id,
                    attribute_id=attr.id,
                    value_scalar=value.value_scalar,
                    value_min=value.value_min,
                    value_max=value.value_max,
                    value_typical=value.value_typical,
                    labels=labels,
                    original_unit=value.original_unit,
                    normalized_value=value.normalized_value,
                    normalized_min=value.normalized_min,
                    normalized_max=value.normalized_max,
                    canonical_unit=value.canonical_unit,
                    conversion_method=value.conversion_method,
                    uncertainty=row.get("uncertainty"),
                    measurement_condition=row.get("measurement_condition"),
                    notes=row.get("notes"),
                    source_id=self.source.id,
                    data_quality=DataQuality.IMPORTADO,
                    is_missing=value.is_missing,
                )
            )
            self._bump("process_values_created")

    def _import_links(self) -> None:
        for row in self.bundle.iter_records("material_process_links.ndjson"):
            material = self.materials[str(row["material_external_id"])]
            process = self.processes[str(row["process_external_id"])]
            exists = self.db.execute(
                select(MaterialProcess).where(
                    MaterialProcess.material_id == material.id,
                    MaterialProcess.process_id == process.id,
                )
            ).scalar_one_or_none()
            if exists is None:
                self.db.add(MaterialProcess(material_id=material.id, process_id=process.id))
                self._bump("material_process_links_created")
            else:
                self._bump("material_process_links_unchanged")

    def _import_transports(self) -> None:
        assert self.source is not None
        for row in self.bundle.iter_records("transport_modes.ndjson"):
            external_table, external_id = _external_key(
                row, "ProductConfig/Transportation"
            )
            existing_ref = self._existing_ref(external_table, external_id)
            if existing_ref is not None:
                if existing_ref.transport_mode_id is None:
                    raise OfficialCatalogImportError("Referência externa não aponta para modal.")
                mode = self.db.get(TransportMode, existing_ref.transport_mode_id)
                if mode is None:
                    raise OfficialCatalogImportError("Referência externa órfã de modal.")
                if existing_ref.raw_record_sha256 != _raw_hash(row):
                    raise OfficialCatalogImportError(
                        f"Modal mudou no mesmo dataset: {external_id}"
                    )
                self.transports[external_id] = mode
                self._bump("transport_modes_unchanged")
                continue

            existing = (
                self.db.execute(select(TransportMode).where(TransportMode.slug == row["slug"]))
                .scalars()
                .one_or_none()
            )
            if existing is None:
                existing = TransportMode(
                    slug=row["slug"],
                    name=row["name"],
                    description=row.get("description"),
                    energy_intensity=row.get("energy_intensity"),
                    carbon_intensity=row.get("carbon_intensity"),
                    display_order=int(row.get("display_order", 0)),
                    is_active=True,
                    is_demo=False,
                    source_id=self.source.id,
                )
                self.db.add(existing)
                self.db.flush()
                self._bump("transport_modes_created")
            elif existing.is_demo:
                raise OfficialCatalogImportError(
                    f"Modal demo ainda existe para slug {row['slug']}; execute excluir_demo."
                )
            self._add_ref(
                row,
                "ProductConfig/Transportation",
                transport_mode_id=existing.id,
            )
            self.transports[external_id] = existing

    def _import_supplemental(self) -> None:
        assert self.dataset is not None
        for row in self.bundle.iter_records("supplemental_values.ndjson"):
            target_type = row["target_type"]
            target_external = str(row["target_external_id"])
            material_id = process_id = transport_id = None
            if target_type == "material":
                material_id = self.materials[target_external].id
            elif target_type == "process":
                process_id = self.processes[target_external].id
            else:
                transport_id = self.transports[target_external].id

            table = str(row.get("external_table") or "Supplemental")
            record_id = str(row.get("external_record_id") or target_external)
            attr_id = str(row["external_attribute_id"])
            existing = self.db.execute(
                select(CatalogSupplementalValue.id).where(
                    CatalogSupplementalValue.dataset_id == self.dataset.id,
                    CatalogSupplementalValue.external_table == table,
                    CatalogSupplementalValue.external_record_id == record_id,
                    CatalogSupplementalValue.external_attribute_id == attr_id,
                )
            ).scalar_one_or_none()
            if existing is not None:
                self._bump("supplemental_values_unchanged")
                continue
            self.db.add(
                CatalogSupplementalValue(
                    dataset_id=self.dataset.id,
                    material_id=material_id,
                    process_id=process_id,
                    transport_mode_id=transport_id,
                    external_table=table,
                    external_record_id=record_id,
                    external_attribute_id=attr_id,
                    attribute_name=row["attribute_name"],
                    value_kind=row["value_kind"],
                    original_unit=row.get("original_unit"),
                    payload=row.get("payload"),
                    raw_value_sha256=row["raw_sha256"],
                )
            )
            self._bump("supplemental_values_created")

    def run(self) -> dict[str, Any]:
        """Commit all official records in one transaction."""
        self._assert_demo_cleared()
        self._ensure_dataset_and_source()
        assert self.dataset is not None

        run = CatalogImportRun(
            dataset_id=self.dataset.id,
            bundle_sha256=self.bundle.bundle_sha256,
            manifest_sha256=self.bundle.manifest_sha256,
            status="RUNNING",
            dry_run=False,
            counts={},
            report={},
        )
        self.db.add(run)
        self.db.flush()

        self._import_hierarchy(
            "material_classes.ndjson", MaterialClass, self.material_classes
        )
        self._import_properties()
        self._import_materials()
        self._import_material_values()
        self._import_hierarchy(
            "process_classes.ndjson", ProcessClass, self.process_classes
        )
        self._import_process_attributes()
        self._import_processes()
        self._import_process_values()
        self._import_links()
        self._import_transports()
        self._import_supplemental()

        run.status = "COMMITTED"
        run.counts = dict(self.counts)
        run.report = {
            "bundle_files": {
                name: {"count": spec.count, "sha256": spec.sha256}
                for name, spec in self.bundle.files.items()
            }
        }
        run.completed_at = datetime.now(UTC)
        self.db.commit()
        return {
            "dataset_id": self.dataset.id,
            "import_run_id": run.id,
            "counts": self.counts,
        }


def validate_bundle(path: str) -> dict[str, Any]:
    """Convenience entry point for CLI/tests: bytes + semantic dry-run."""
    bundle = verify_bundle(path)
    counts = validate_semantics(bundle)
    return {
        "bundle_sha256": bundle.bundle_sha256,
        "manifest_sha256": bundle.manifest_sha256,
        "dataset": bundle.manifest["dataset"],
        "counts": counts,
    }
