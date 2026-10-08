"""Business logic for the material catalogue.

Transforms ORM entities into API schemas, grouping property values by category
and preserving the missing-data and unit-provenance information end to end.
"""

from __future__ import annotations

from collections.abc import Mapping

from sqlalchemy.orm import Session

from app.calculations.units import UnitError
from app.domain.composition import (
    RULE_TEXT,
    CompositionError,
    NormalizedComposition,
    UndeterminedReason,
    build_composition_entry,
    validate_composition,
)
from app.domain.data_quality import (
    build_interval_value,
    build_scalar_value,
    missing_value,
)
from app.domain.designation import DesignationError, designation_key, system_label
from app.domain.display_units import Reading, reading_for
from app.domain.elements import element_for
from app.domain.errors import (
    CatalogReadOnlyError,
    ConflictError,
    NotFoundError,
    ValidationError,
)
from app.domain.search_query import SearchQueryError
from app.models.enums import AuditAction, AuditEntityType, DataQuality, PropertyCategory
from app.models.material import Material
from app.models.material_composition import MaterialCompositionEntry
from app.models.material_designation import MaterialDesignation
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition
from app.models.user import User
from app.repositories.audit_repository import AuditRepository
from app.repositories.material_repository import MaterialRepository, SearchFacts
from app.schemas.material import (
    ChartData,
    ChartPoint,
    CompositionConditionOut,
    CompositionEntryIn,
    CompositionEntryOut,
    CompositionReplaceIn,
    CompositionSearchOut,
    DataQualitySummary,
    DesignationBrief,
    DesignationIn,
    DesignationOut,
    DesignationsReplaceIn,
    MaterialCreate,
    MaterialDetail,
    MaterialListItem,
    MaterialSearchOut,
    MaterialUpdate,
    PropertyValueIn,
    UndeterminedBreakdown,
)
from app.schemas.property import PropertyGroup, PropertyValueOut
from app.services.audit_service import diff_fields, record_change
from app.services.process_service import ProcessService

# Order in which categories are presented on the sheet.
_CATEGORY_ORDER = [
    PropertyCategory.FISICA,
    PropertyCategory.MECANICA,
    PropertyCategory.TERMICA,
    PropertyCategory.ELETRICA,
    PropertyCategory.AMBIENTAL,
    PropertyCategory.ECONOMICA,
]


def _summarise_quality(material: Material) -> DataQualitySummary:
    """Count a material's values by provenance, keeping absence separate.

    A value flagged missing carries a ``data_quality`` like any other row, but
    counting it under that quality would state that something was measured or
    imported when nothing was. Absence is counted on its own.
    """
    summary = DataQualitySummary()
    for value in material.property_values:
        if value.is_missing:
            summary.missing += 1
        elif value.data_quality is DataQuality.MEDIDO:
            summary.medido += 1
        elif value.data_quality is DataQuality.IMPORTADO:
            summary.importado += 1
        else:
            summary.estimado += 1
    return summary


def _designation_out(designation: MaterialDesignation) -> DesignationOut:
    return DesignationOut(
        system=designation.system,
        system_label=system_label(designation.system),
        code=designation.code,
        region=designation.region,
        source_label=designation.source.label,
        citation=designation.citation,
        # A demo source makes the row fictitious too (the D-104 rule): a real
        # material with a designation from a demo source still carries an
        # invented claim.
        is_demo=designation.is_demo or designation.source.is_demo,
    )


def _composition_entry_out(entry: MaterialCompositionEntry) -> CompositionEntryOut:
    element = element_for(entry.element)
    assert element is not None  # guaranteed by the model validator and the CHECK
    if entry.is_balance:
        state = "resto"
    elif entry.is_missing:
        state = "ausente"
    else:
        state = "faixa"
    return CompositionEntryOut(
        element=element.symbol,
        element_name=element.name,
        atomic_number=element.number,
        state=state,
        value_min=entry.value_min,
        value_max=entry.value_max,
        value_nominal=entry.value_nominal,
        original_unit=entry.original_unit,
        normalized_min=entry.normalized_min,
        normalized_max=entry.normalized_max,
        normalized_nominal=entry.normalized_nominal,
        canonical_unit=entry.canonical_unit,
        conversion_method=entry.conversion_method,
        notes=entry.notes,
        data_quality=entry.data_quality,
        source_label=entry.source.label,
        citation=entry.citation,
        is_demo=entry.is_demo or entry.source.is_demo,
    )


def _composition_report(facts: SearchFacts) -> CompositionSearchOut | None:
    """The composition half of a search answer, or None when it asked nothing of it."""
    if not facts.tallies:
        return None
    conditions = []
    for tally in facts.tallies:
        element = element_for(tally.condition.element)
        assert element is not None
        conditions.append(
            CompositionConditionOut(
                label=tally.condition.label(),
                element=element.symbol,
                element_name=element.name,
                satisfied=len(tally.satisfied),
                not_satisfied=len(tally.not_satisfied),
                undetermined=sum(tally.undetermined.values()),
                undetermined_by_reason=UndeterminedBreakdown(
                    **{reason.value: tally.undetermined[reason] for reason in UndeterminedReason}
                ),
            )
        )
    return CompositionSearchOut(
        rule=RULE_TEXT,
        conditions=conditions,
        undetermined=facts.undetermined,
        without_composition=facts.without_composition,
    )


class MaterialService:
    """Coordinates catalogue reads and shapes them into API responses."""

    def __init__(
        self,
        db: Session,
        user: User | None = None,
        unit_choices: Mapping[str, str] | None = None,
        can_edit_shared: bool = True,
    ) -> None:
        self.viewer_id = user.id if user is not None else None
        # D-83: False only for a user admitted by open access mode without a
        # subscription. True is the default because every caller outside the
        # materials router (importer, seed, tests) acts as a curator already.
        self.can_edit_shared = can_edit_shared
        # D-70: em que unidade este leitor pediu para ler cada propriedade.
        # Argumento de construtor pela mesma razão que `viewer_id` é: a escolha
        # vale para a requisição inteira, e um parâmetro por método deixaria
        # alguma superfície de fora — que é exatamente como a figura passaria a
        # discordar da tabela ao lado.
        self.unit_choices: Mapping[str, str] = unit_choices or {}
        self.repo = MaterialRepository(db, self.viewer_id)
        self.audit_repo = AuditRepository(db)
        # P0-2: read through the process service rather than reimplementing the
        # join here — the compatible-processes list on the sheet and the process
        # catalogue must not be able to disagree.
        self.processes = ProcessService(db)
        self.user = user

    def list_materials(self, search: str | None = None) -> list[MaterialListItem]:
        return self.search(search).items

    def search(self, query: str | None = None) -> MaterialSearchOut:
        """The catalogue search (D-55), with the composition report when asked (D-105).

        A query the reader mistyped is their problem to fix, not a server
        fault: `SearchQueryError` already carries a message in Portuguese
        saying which bracket, quote, element or system is wrong, so it becomes a
        400 with that text rather than the 500 an unhandled ValueError would
        give.
        """
        try:
            materials, facts = self.repo.search_materials(query)
        except SearchQueryError as exc:
            raise ValidationError(str(exc)) from exc
        items = [self.list_item(m) for m in materials]
        return MaterialSearchOut(
            items=items, total=len(items), composition=_composition_report(facts)
        )

    @staticmethod
    def list_item(material: Material) -> MaterialListItem:
        """One catalogue row's compact shape.

        Public and shared rather than inlined in the listing, because the user's
        own space (P1-4) renders starred materials as the same card — and two
        builders would let the catalogue and the favourites list disagree about
        what a material looks like.
        """
        return MaterialListItem(
            id=material.id,
            name=material.name,
            class_name=material.material_class.name,
            class_slug=material.material_class.slug,
            subclass=material.subclass,
            is_demo=material.is_demo,
            is_own_record=material.owner_id is not None,
            keywords=list(material.keywords or []),
            quality=_summarise_quality(material),
            designations=[
                DesignationBrief(system=d.system, system_label=system_label(d.system), code=d.code)
                for d in material.designations
            ],
        )

    def get_material_detail(self, material_id: int) -> MaterialDetail:
        material = self.repo.get_material(material_id)
        if material is None:
            raise NotFoundError(f"Material não encontrado: {material_id}")
        return MaterialDetail(
            id=material.id,
            name=material.name,
            class_id=material.class_id,
            class_name=material.material_class.name,
            class_slug=material.material_class.slug,
            subclass=material.subclass,
            description=material.description,
            is_demo=material.is_demo,
            is_active=material.is_active,
            is_own_record=material.owner_id is not None,
            is_official=self.repo.is_official(material.id),
            keywords=list(material.keywords or []),
            property_groups=self._group_properties(material),
            processes=self.processes.processes_for_material(material.id),
            designations=[_designation_out(d) for d in material.designations],
            composition=[_composition_entry_out(e) for e in material.composition],
        )

    # --- write operations -------------------------------------------------

    def create_material(self, payload: MaterialCreate) -> MaterialDetail:
        """Create a material and its property values.

        Validates the referenced class and every property/unit; the whole
        operation is atomic (a single invalid value aborts the creation).
        """
        if payload.is_own_record and self.viewer_id is None:
            # Not reachable through the API, where every route resolves a user
            # first — but an own record with no owner would be a row nobody
            # could ever read back, so it is refused where it is representable
            # rather than written and lost.
            raise ValidationError(
                "Um registro próprio precisa de um usuário; nenhum foi identificado."
            )
        if not payload.is_own_record and not self.can_edit_shared:
            raise CatalogReadOnlyError()
        if self.repo.get_class(payload.class_id) is None:
            raise NotFoundError(f"Classe não encontrada: {payload.class_id}")
        if self.repo.name_exists(payload.name):
            raise ConflictError(f"Já existe um material com o nome: {payload.name}")
        self._ensure_unique_slugs(payload.values)

        material = Material(
            name=payload.name.strip(),
            class_id=payload.class_id,
            subclass=payload.subclass,
            description=payload.description,
            keywords=payload.keywords,
            is_demo=payload.is_demo,
            is_active=True,
            # NULL keeps it in the shared catalogue, which is what every caller
            # before P1-4 meant and still means.
            owner_id=self.viewer_id if payload.is_own_record else None,
        )
        self.repo.add(material)
        self.repo.flush()

        for value_in in payload.values:
            row = self._build_value_from_input(value_in, is_demo=payload.is_demo)
            row.material_id = material.id
            self.repo.add(row)

        self.repo.sync_keywords(material.id, payload.keywords or [])

        record_change(
            self.audit_repo,
            self.user,
            entity_type=AuditEntityType.MATERIAL,
            entity_id=material.id,
            entity_label=material.name,
            action=AuditAction.CRIADO,
        )
        self.repo.commit()
        return self.get_material_detail(material.id)

    def update_material(self, material_id: int, payload: MaterialUpdate) -> MaterialDetail:
        """Apply a partial update to a material's identity fields."""
        material = self.repo.get_material(material_id)
        if material is None:
            raise NotFoundError(f"Material não encontrado: {material_id}")
        self._ensure_writable(material)
        before = self._identity_snapshot(material)

        data = payload.model_dump(exclude_unset=True)
        if "name" in data and data["name"] is not None:
            new_name = data["name"].strip()
            if self.repo.name_exists(new_name, exclude_id=material_id):
                raise ConflictError(f"Já existe um material com o nome: {new_name}")
            material.name = new_name
        if "class_id" in data and data["class_id"] is not None:
            if self.repo.get_class(data["class_id"]) is None:
                raise NotFoundError(f"Classe não encontrada: {data['class_id']}")
            material.class_id = data["class_id"]
        if "subclass" in data:
            material.subclass = data["subclass"]
        if "description" in data:
            material.description = data["description"]
        if "keywords" in data and data["keywords"] is not None:
            material.keywords = data["keywords"]
            self.repo.sync_keywords(material_id, data["keywords"])
        if "is_active" in data and data["is_active"] is not None:
            material.is_active = data["is_active"]

        changes = diff_fields(before, self._identity_snapshot(material))
        if changes:
            record_change(
                self.audit_repo,
                self.user,
                entity_type=AuditEntityType.MATERIAL,
                entity_id=material.id,
                entity_label=material.name,
                action=AuditAction.ATUALIZADO,
                changes=changes,
            )
        self.repo.commit()
        return self.get_material_detail(material_id)

    def deactivate_material(self, material_id: int) -> None:
        """Soft-delete a material by setting ``is_active`` to False."""
        material = self.repo.get_material(material_id)
        if material is None:
            raise NotFoundError(f"Material não encontrado: {material_id}")
        self._ensure_writable(material)
        was_active = material.is_active
        material.is_active = False
        if was_active:
            record_change(
                self.audit_repo,
                self.user,
                entity_type=AuditEntityType.MATERIAL,
                entity_id=material.id,
                entity_label=material.name,
                action=AuditAction.EXCLUIDO,
            )
        self.repo.commit()

    # --- composition and designations (TM2-a, D-105) -----------------------

    def replace_composition(
        self, material_id: int, payload: CompositionReplaceIn
    ) -> MaterialDetail:
        """Replace a material's whole composition, with audit.

        Every row is built by ``build_composition_entry`` — the same constructor
        the seed and the official importer use — so a hand-typed row obeys the
        rules the database ``CHECK``s pin: balance and absent rows carry no
        number, nothing is computed (no ``100 − Σ``), the unit goes through
        ``units.py``. The whole set is validated before anything is deleted, so a
        refusal leaves the stored composition untouched. An empty list is allowed
        and means "no composition registered" (never 0 %).
        """
        material = self._writable_identity(material_id)
        before = self._composition_snapshot(material)

        built: list[tuple[CompositionEntryIn, NormalizedComposition]] = []
        for entry_in in payload.entries:
            try:
                built.append(
                    (
                        entry_in,
                        build_composition_entry(
                            entry_in.element,
                            value_min=entry_in.value_min,
                            value_max=entry_in.value_max,
                            value_nominal=entry_in.value_nominal,
                            unit=entry_in.unit,
                            is_balance=entry_in.state == "resto",
                            is_missing=entry_in.state == "ausente",
                        ),
                    )
                )
            except CompositionError as exc:
                raise ValidationError(str(exc)) from exc
        try:
            validate_composition(row for _, row in built)
        except CompositionError as exc:
            raise ValidationError(str(exc)) from exc

        rows: list[MaterialCompositionEntry] = []
        for position, (entry_in, row) in enumerate(built):
            source = self.repo.get_or_create_source(
                entry_in.source_label.strip(), is_demo=material.is_demo
            )
            rows.append(
                MaterialCompositionEntry(
                    material_id=material.id,
                    element=row.element,
                    position=position,
                    is_balance=row.is_balance,
                    is_missing=row.is_missing,
                    value_min=row.value_min,
                    value_max=row.value_max,
                    value_nominal=row.value_nominal,
                    original_unit=row.original_unit,
                    normalized_min=row.normalized_min,
                    normalized_max=row.normalized_max,
                    normalized_nominal=row.normalized_nominal,
                    canonical_unit=row.canonical_unit,
                    conversion_method=row.conversion_method,
                    notes=entry_in.notes,
                    source_id=source.id,
                    citation=entry_in.citation,
                    data_quality=entry_in.data_quality,
                    is_demo=material.is_demo,
                )
            )
        self.repo.replace_composition(material, rows)

        changes = diff_fields(before, self._composition_snapshot_rows(rows))
        self._audit_update(material, changes)
        self.repo.commit()
        return self.get_material_detail(material_id)

    def replace_designations(
        self, material_id: int, payload: DesignationsReplaceIn
    ) -> MaterialDetail:
        """Replace a material's designations, with audit.

        The system is the closed vocabulary (the schema's enum); the code is kept
        as written. Two rows with the same system and code (compared by
        ``designation_key``) are one fact written twice and are refused. No
        equivalence is ever inferred between materials (D-105).
        """
        material = self._writable_identity(material_id)
        before = self._designation_snapshot(material)

        seen: set[tuple[str, str]] = set()
        for item in payload.designations:
            try:
                key = designation_key(item.code)
            except DesignationError as exc:
                raise ValidationError(str(exc)) from exc
            if (item.system.value, key) in seen:
                raise ValidationError(
                    f"Designação repetida: {system_label(item.system)} {item.code.strip()}."
                )
            seen.add((item.system.value, key))

        rows = [self._designation_row(material, item) for item in payload.designations]
        self.repo.replace_designations(material, rows)

        after = {
            f"designação {system_label(r.system)} {r.code}": self._designation_repr(r) for r in rows
        }
        self._audit_update(material, diff_fields(before, after))
        self.repo.commit()
        return self.get_material_detail(material_id)

    def _designation_row(self, material: Material, item: DesignationIn) -> MaterialDesignation:
        source = self.repo.get_or_create_source(item.source_label.strip(), is_demo=material.is_demo)
        return MaterialDesignation(
            material_id=material.id,
            system=item.system,
            code=item.code,
            region=item.region,
            source_id=source.id,
            citation=item.citation,
            is_demo=material.is_demo,
        )

    def _writable_identity(self, material_id: int) -> Material:
        """The material, if this viewer may write its composition/designations.

        A record another user owns is a 404 (visibility). The shared catalogue
        needs the curator rule (D-83) — an own record only its owner. A record
        that came from the licensed official catalogue (D-102) is not edited by
        hand: its values are the dataset's, and a manual edit would put a claim
        next to them that the dataset never made.
        """
        material = self.repo.get_material(material_id)
        if material is None:
            raise NotFoundError(f"Material não encontrado: {material_id}")
        self._ensure_writable(material)
        if self.repo.is_official(material.id):
            raise ConflictError(
                "Este material vem do catálogo oficial licenciado e não é editado pela "
                "ficha. Para corrigir o dado, use uma nova versão do catálogo."
            )
        return material

    def _audit_update(self, material: Material, changes: dict) -> None:
        if changes:
            record_change(
                self.audit_repo,
                self.user,
                entity_type=AuditEntityType.MATERIAL,
                entity_id=material.id,
                entity_label=material.name,
                action=AuditAction.ATUALIZADO,
                changes=changes,
            )

    @staticmethod
    def _composition_repr(row: MaterialCompositionEntry) -> str:
        if row.is_balance:
            return "resto"
        if row.is_missing:
            return "ausente"
        if row.value_min is not None and row.value_max is not None:
            return f"{row.value_min:g}–{row.value_max:g} {row.original_unit}"
        if row.value_max is not None:
            return f"≤ {row.value_max:g} {row.original_unit}"
        if row.value_min is not None:
            return f"≥ {row.value_min:g} {row.original_unit}"
        return f"{row.value_nominal:g} {row.original_unit}"

    @classmethod
    def _composition_snapshot_rows(cls, rows) -> dict[str, str]:
        return {f"composição {r.element}": cls._composition_repr(r) for r in rows}

    @classmethod
    def _composition_snapshot(cls, material: Material) -> dict[str, str]:
        return cls._composition_snapshot_rows(material.composition)

    @staticmethod
    def _designation_repr(row: MaterialDesignation) -> str:
        return f"{row.region or '—'}; fonte {row.source.label if row.source else '—'}"

    @classmethod
    def _designation_snapshot(cls, material: Material) -> dict[str, str]:
        return {
            f"designação {system_label(r.system)} {r.code}": cls._designation_repr(r)
            for r in material.designations
        }

    def _ensure_writable(self, material: Material) -> None:
        # A row another user owns never reaches here: the visibility filter
        # already answered 404. What is left to decide is the shared catalogue.
        if material.owner_id is None and not self.can_edit_shared:
            raise CatalogReadOnlyError()

    @staticmethod
    def _identity_snapshot(material: Material) -> dict:
        """The mutable identity fields ``update_material`` can touch, for diffing."""
        return {
            "name": material.name,
            "class_id": material.class_id,
            "subclass": material.subclass,
            "description": material.description,
            "keywords": list(material.keywords or []),
            "is_active": material.is_active,
        }

    def replace_property_values(
        self, material_id: int, values: list[PropertyValueIn]
    ) -> MaterialDetail:
        """Replace all property values of a material with the provided set."""
        material = self.repo.get_material(material_id)
        if material is None:
            raise NotFoundError(f"Material não encontrado: {material_id}")
        self._ensure_writable(material)
        self._ensure_unique_slugs(values)
        before = self._values_snapshot(material)

        # Build (and validate) the new rows before deleting the old ones, so a
        # validation error leaves the existing data untouched.
        new_rows = [self._build_value_from_input(v, is_demo=material.is_demo) for v in values]
        self.repo.delete_values_for_material(material_id)
        for row in new_rows:
            row.material_id = material_id
            self.repo.add(row)

        # zip with the input payload, not `row.property_definition` — the new
        # rows are transient (not yet flushed), so that relationship would
        # trigger a lazy load on an object with no identity yet.
        after = {
            v.property_slug: self._value_repr(row) for v, row in zip(values, new_rows, strict=True)
        }
        changes = diff_fields(before, after)
        if changes:
            record_change(
                self.audit_repo,
                self.user,
                entity_type=AuditEntityType.MATERIAL,
                entity_id=material.id,
                entity_label=material.name,
                action=AuditAction.ATUALIZADO,
                changes=changes,
            )
        self.repo.commit()
        return self.get_material_detail(material_id)

    @staticmethod
    def _values_snapshot(material: Material) -> dict[str, str]:
        return {
            v.property_definition.slug: MaterialService._value_repr(v)
            for v in material.property_values
        }

    @staticmethod
    def _value_repr(value: MaterialPropertyValue) -> str:
        """A compact, human-readable summary of a value for the audit diff.

        Not meant to be parsed back — just legible in a changelog: unit-aware,
        and explicit about absence rather than printing a blank or a zero.
        """
        if value.is_missing:
            return "ausente"
        if value.value_min is not None and value.value_max is not None:
            return f"{value.value_min:g}–{value.value_max:g} {value.original_unit}"
        if value.value_scalar is not None:
            return f"{value.value_scalar:g} {value.original_unit}"
        return "ausente"

    @staticmethod
    def _ensure_unique_slugs(values: list[PropertyValueIn]) -> None:
        """Reject payloads with the same property listed more than once.

        Duplicate rows for one (material, property) pair would make chart points
        depend on arbitrary SELECT ordering — a determinism violation.
        """
        slugs = [v.property_slug for v in values]
        duplicates = sorted({s for s in slugs if slugs.count(s) > 1})
        if duplicates:
            raise ValidationError(f"Propriedades repetidas no payload: {', '.join(duplicates)}")

    def _build_value_from_input(
        self,
        payload: PropertyValueIn,
        is_demo: bool,
        *,
        source_license_label: str | None = None,
        source_license_url: str | None = None,
        source_contains_third_party_data: bool = False,
        source_reviewed_by_user_id: int | None = None,
    ) -> MaterialPropertyValue:
        """Convert a PropertyValueIn into a validated MaterialPropertyValue.

        Unit conversion and dimensional/interval validation happen here; any
        failure is surfaced as a ``ValidationError`` (HTTP 400). The
        ``source_*`` kwargs are licensing metadata (M1) for a brand-new
        ``Source`` — manual entry through the API never sets them (there is
        no licensing gate on that path yet, see docs/DECISIONS.md D-44);
        ``ImportService`` is the only caller that passes them, after its own
        gate has already required them for an unregistered source.
        """
        prop = self.repo.get_property_by_slug(payload.property_slug)
        if prop is None:
            raise NotFoundError(f"Propriedade não encontrada: {payload.property_slug}")

        try:
            if payload.kind == "missing":
                nv = missing_value()
            elif payload.kind == "scalar":
                if payload.value is None or not payload.unit:
                    raise ValidationError(
                        f"Valor escalar requer 'value' e 'unit' ({payload.property_slug})."
                    )
                nv = build_scalar_value(payload.value, payload.unit, prop.canonical_unit)
            elif payload.kind == "interval":
                if payload.value_min is None or payload.value_max is None or not payload.unit:
                    raise ValidationError(
                        f"Intervalo requer 'value_min', 'value_max' e 'unit' ({payload.property_slug})."
                    )
                nv = build_interval_value(
                    payload.value_min,
                    payload.value_max,
                    payload.unit,
                    prop.canonical_unit,
                    value_typical=payload.value_typical,
                )
            else:  # pragma: no cover - guarded by the schema's Literal
                raise ValidationError(f"Tipo de valor inválido: {payload.kind}")
        except UnitError as exc:
            raise ValidationError(str(exc)) from exc
        except ValueError as exc:
            # Raised by build_interval_value on an inverted interval.
            raise ValidationError(str(exc)) from exc

        source_id = None
        if payload.source_label:
            source = self.repo.get_or_create_source(
                payload.source_label,
                is_demo=is_demo,
                license_label=source_license_label,
                license_url=source_license_url,
                contains_third_party_data=source_contains_third_party_data,
                reviewed_by_user_id=source_reviewed_by_user_id,
            )
            source_id = source.id

        return MaterialPropertyValue(
            property_id=prop.id,
            value_scalar=nv.value_scalar,
            value_min=nv.value_min,
            value_max=nv.value_max,
            value_typical=nv.value_typical,
            original_unit=nv.original_unit,
            normalized_value=nv.normalized_value,
            canonical_unit=nv.canonical_unit,
            conversion_method=nv.conversion_method,
            uncertainty=payload.uncertainty,
            measurement_condition=payload.measurement_condition,
            notes=payload.notes,
            source_id=source_id,
            data_quality=payload.data_quality,
            is_missing=nv.is_missing,
        )

    def _group_properties(self, material: Material) -> list[PropertyGroup]:
        """Group a material's property values by category, preserving order."""
        buckets: dict[PropertyCategory, list[PropertyValueOut]] = {
            cat: [] for cat in _CATEGORY_ORDER
        }
        for value in material.property_values:
            out = self._to_property_out(value)
            buckets[out.category].append(out)

        groups: list[PropertyGroup] = []
        for category in _CATEGORY_ORDER:
            props = buckets[category]
            if props:
                props.sort(key=lambda p: p.property_name)
                groups.append(PropertyGroup(category=category, properties=props))
        return groups

    def reading_for_definition(self, definition: PropertyDefinition) -> Reading:
        """Em que unidade esta propriedade sai nesta requisição (D-70).

        Não custa consulta nenhuma: a definição já veio carregada com o valor.
        """
        return reading_for(
            canonical_unit=definition.canonical_unit,
            display_unit=definition.display_unit,
            accepted_units=definition.accepted_units or [],
            requested=self.unit_choices.get(definition.slug),
        )

    def _to_property_out(self, value: MaterialPropertyValue) -> PropertyValueOut:
        """Uma linha da ficha, com a leitura ao lado do registro (D-70).

        **A leitura é acrescentada, nunca substitui.** `value_scalar`, a faixa,
        o típico e `original_unit` guardam *o que a fonte disse*, e é essa a
        única coisa que eles servem para dizer: reescrevê-los noutra unidade
        apagaria o registro. `normalized_value` e `conversion_method` são o
        trilho que explica como aquilo virou canônico, e também não se mexem.

        Os campos `display_*` são a mesma medida lida noutra unidade, e saem
        **ao lado**. Quem imprime escolhe qual mostrar; quem audita continua
        vendo os dois.
        """
        definition = value.property_definition
        reading = self.reading_for_definition(definition)
        return PropertyValueOut(
            property_slug=definition.slug,
            property_name=definition.name,
            symbol=definition.symbol,
            category=definition.category,
            is_missing=value.is_missing,
            is_interval=definition.is_interval,
            value_scalar=value.value_scalar,
            value_min=value.value_min,
            value_max=value.value_max,
            value_typical=value.value_typical,
            original_unit=value.original_unit,
            normalized_value=value.normalized_value,
            canonical_unit=value.canonical_unit,
            conversion_method=value.conversion_method,
            uncertainty=value.uncertainty,
            **reading.read(value),
            measurement_condition=value.measurement_condition,
            notes=value.notes,
            data_quality=value.data_quality,
            source_label=value.source.label if value.source else None,
        )

    def build_chart(self, x_slug: str, y_slug: str) -> ChartData:
        """Build scatter data for two properties using normalised values.

        A material is plotted only if it has a non-missing normalised value for
        *both* axes. Materials missing either axis are reported in
        ``excluded_material_ids`` so the UI can disclose incomplete coverage.
        """
        x_def = self.repo.get_property_by_slug(x_slug)
        y_def = self.repo.get_property_by_slug(y_slug)
        if x_def is None or y_def is None:
            missing = x_slug if x_def is None else y_slug
            raise NotFoundError(f"Propriedade não encontrada: {missing}")

        x_values = {
            v.material_id: v
            for v in self.repo.values_for_property(x_slug)
            if v.normalized_value is not None
        }
        y_values = {
            v.material_id: v
            for v in self.repo.values_for_property(y_slug)
            if v.normalized_value is not None
        }

        points: list[ChartPoint] = []
        both_ids = x_values.keys() & y_values.keys()
        for material_id in both_ids:
            xv = x_values[material_id]
            points.append(
                ChartPoint(
                    material_id=material_id,
                    material_name=xv.material.name,
                    class_name=xv.material.material_class.name,
                    x=x_values[material_id].normalized_value,  # type: ignore[arg-type]
                    y=y_values[material_id].normalized_value,  # type: ignore[arg-type]
                )
            )
        points.sort(key=lambda p: p.material_name)

        excluded = sorted((x_values.keys() | y_values.keys()) - both_ids)

        return ChartData(
            x_property_slug=x_def.slug,
            x_property_name=x_def.name,
            x_unit=x_def.canonical_unit,
            y_property_slug=y_def.slug,
            y_property_name=y_def.name,
            y_unit=y_def.canonical_unit,
            points=points,
            excluded_material_ids=excluded,
        )
