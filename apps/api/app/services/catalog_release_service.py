"""Releases of the official catalogue and the diff between two of them (D-108, TM7).

The service resolves the two releases, refuses a pair that is not comparable,
asks the repository for what each release stored and hands both lists to the
pure diff in ``app/domain/release_diff.py``. It writes nothing.

**Why the diff can be derived without a snapshot table.** The importer of the
D-102 creates the shared records of each release as rows of that release: the
identity rows (``CatalogRecordRef``) are per dataset, and a second release
writes its own ``Material`` and ``MaterialPropertyValue`` rows instead of
overwriting the first one's. So what release A stored is still in the
database after release B is imported, and "what changed" is a comparison of
two stored sets, matched by external identity.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.calculations.units import pretty_unit
from app.domain.display_units import Reading, readings_for
from app.domain.errors import NotFoundError, ValidationError
from app.domain.release_diff import (
    KIND_LABELS,
    RULE_TEXT,
    STATUS_LABELS,
    STATUS_ORDER,
    FieldChange,
    NumbersView,
    PropertyInfo,
    RecordDiff,
    RecordSnapshot,
    RecordStatus,
    ReleaseIdentity,
    ValueState,
    ValueView,
    count_by_class,
    count_by_status,
    diff_releases,
    ensure_comparable,
    filter_diffs,
    paginate,
    parse_status,
    value_view,
)
from app.exporters.report import Report, Sheet, standard_notices
from app.repositories.catalog_release_repository import CatalogReleaseRepository, ReleaseRow
from app.schemas.catalog_release import (
    CatalogReleaseOut,
    ClassCountOut,
    DiffFiltersOut,
    DiffItemOut,
    FieldChangeOut,
    NumbersOut,
    ReadingNumbersOut,
    RecordSideOut,
    ReleaseDiffOut,
    StatusCountOut,
    ValueSideOut,
)

DEFAULT_PAGE_SIZE = 50

#: Written in a cell where a side has no record, so absence is never a blank.
NOT_IN_RELEASE = "não está nesta release"
NOT_INFORMED = "não informado"


@dataclass(frozen=True)
class _Computed:
    base: CatalogReleaseOut
    target: CatalogReleaseOut
    diffs: list[RecordDiff]
    readings: dict[str, Reading]
    #: Sources cited by the values of each side, ``(label, is_demo)``.
    base_sources: list[tuple[str, bool]]
    target_sources: list[tuple[str, bool]]


def _release_out(row: ReleaseRow, previous_slug: str | None) -> CatalogReleaseOut:
    dataset = row.dataset
    return CatalogReleaseOut(
        slug=dataset.slug,
        name=dataset.name,
        release=dataset.release,
        lineage=dataset.lineage,
        license_label=dataset.license_label,
        provenance=dataset.provenance,
        source_sha256=dataset.source_sha256,
        is_active=dataset.is_active,
        is_demo=dataset.is_demo,
        created_at=dataset.created_at,
        imported_at=row.imported_at,
        bundle_sha256=row.bundle_sha256,
        manifest_sha256=row.manifest_sha256,
        material_count=row.material_count,
        previous_slug=previous_slug,
    )


def _numbers(view: NumbersView | None) -> NumbersOut | None:
    if view is None:
        return None
    return NumbersOut(
        value=view.value,
        min=view.min,
        max=view.max,
        typical=view.typical,
        uncertainty=view.uncertainty,
        unit=view.unit,
    )


def _side(view: ValueView) -> ValueSideOut:
    reading = None
    if view.reading is not None:
        reading = ReadingNumbersOut(
            **_numbers(view.reading).model_dump(),  # type: ignore[union-attr]
            unit_label=pretty_unit(view.reading.unit),
        )
    return ValueSideOut(
        state=view.state,
        state_label=view.state_label,
        original=_numbers(view.original),
        canonical=_numbers(view.canonical),
        reading=reading,
        conversion_method=view.conversion_method,
        measurement_condition=view.measurement_condition,
    )


def _record_side(record: RecordSnapshot | None) -> RecordSideOut | None:
    if record is None:
        return None
    return RecordSideOut(
        material_id=record.material_id,
        name=record.name,
        class_slug=record.class_slug,
        class_name=record.class_name,
        subclass=record.subclass,
        external_gruid=record.external_gruid,
        raw_record_sha256=record.raw_record_sha256,
        is_active=record.is_active,
    )


class CatalogReleaseService:
    def __init__(self, db: Session, unit_choices: Mapping[str, str] | None = None) -> None:
        self.repo = CatalogReleaseRepository(db)
        self.unit_choices: Mapping[str, str] = unit_choices or {}

    # -- releases -------------------------------------------------------------

    def _all(self) -> dict[str, tuple[ReleaseRow, CatalogReleaseOut]]:
        out: dict[str, tuple[ReleaseRow, CatalogReleaseOut]] = {}
        previous: dict[str, str] = {}
        for row in self.repo.list_releases():
            lineage = row.dataset.lineage
            out[row.dataset.slug] = (
                row,
                _release_out(row, previous.get(lineage) if lineage is not None else None),
            )
            if lineage is not None:
                previous[lineage] = row.dataset.slug
        return out

    def list_releases(self) -> list[CatalogReleaseOut]:
        return [release for _, release in self._all().values()]

    @staticmethod
    def _get(
        releases: Mapping[str, tuple[ReleaseRow, CatalogReleaseOut]], slug: str
    ) -> tuple[ReleaseRow, CatalogReleaseOut]:
        found = releases.get(slug)
        if found is None:
            raise NotFoundError(f"Release do catálogo não encontrada: '{slug}'.")
        return found

    # -- the diff -------------------------------------------------------------

    def _compute(self, base_slug: str, target_slug: str) -> _Computed:
        releases = self._all()
        base_row, base = self._get(releases, base_slug)
        target_row, target = self._get(releases, target_slug)
        ensure_comparable(
            ReleaseIdentity(base.slug, base.lineage, base.is_demo),
            ReleaseIdentity(target.slug, target.lineage, target.is_demo),
        )
        base_records = self.repo.material_snapshots(base_row.dataset.id)
        target_records = self.repo.material_snapshots(target_row.dataset.id)
        slugs = {
            slug for record in (*base_records, *target_records) for slug in record.values.keys()
        }
        definitions = self.repo.property_definitions(slugs)
        properties = {
            d.slug: PropertyInfo(slug=d.slug, name=d.name, canonical_unit=d.canonical_unit)
            for d in definitions
        }
        return _Computed(
            base=base,
            target=target,
            diffs=diff_releases(base_records, target_records, properties),
            readings=readings_for(definitions, self.unit_choices),
            base_sources=self.repo.value_sources(base_row.dataset.id),
            target_sources=self.repo.value_sources(target_row.dataset.id),
        )

    def _change_out(self, change: FieldChange, readings: Mapping[str, Reading]) -> FieldChangeOut:
        common = {
            "field": change.field,
            "label": change.label,
            "kind": change.kind,
            "kind_label": KIND_LABELS[change.kind],
        }
        if change.property_slug is None:
            return FieldChangeOut(
                **common, before_text=change.before_text, after_text=change.after_text
            )
        reading = readings[change.property_slug]
        return FieldChangeOut(
            **common,
            property_slug=change.property_slug,
            before=_side(value_view(change.before_value, reading)),
            after=_side(value_view(change.after_value, reading)),
            reading_unit=reading.unit,
            reading_unit_label=pretty_unit(reading.unit),
            canonical_unit=reading.canonical_unit,
        )

    def _item_out(self, diff: RecordDiff, readings: Mapping[str, Reading]) -> DiffItemOut:
        return DiffItemOut(
            external_table=diff.external_table,
            external_record_id=diff.external_record_id,
            status=diff.status,
            status_label=STATUS_LABELS[diff.status],
            base=_record_side(diff.base),
            target=_record_side(diff.target),
            raw_record_changed=diff.raw_record_changed,
            change_count=len(diff.changes),
            changes=[self._change_out(change, readings) for change in diff.changes],
        )

    def _filters(
        self, tipo: str | None, classe: str | None
    ) -> tuple[RecordStatus | None, str | None]:
        status = parse_status(tipo)
        class_slug = classe or None
        if class_slug is not None and not self.repo.class_exists(class_slug):
            raise ValidationError(f"Classe de material desconhecida: '{class_slug}'.")
        return status, class_slug

    def diff(
        self,
        base_slug: str,
        target_slug: str,
        *,
        tipo: str | None = None,
        classe: str | None = None,
        page: int = 1,
        page_size: int = DEFAULT_PAGE_SIZE,
    ) -> ReleaseDiffOut:
        status, class_slug = self._filters(tipo, classe)
        computed = self._compute(base_slug, target_slug)
        selected = filter_diffs(computed.diffs, status=status, class_slug=class_slug)
        chosen = paginate(selected, page, page_size)
        counts = count_by_status(computed.diffs)
        assert computed.base.lineage is not None
        return ReleaseDiffOut(
            base=computed.base,
            target=computed.target,
            lineage=computed.base.lineage,
            is_demo=computed.base.is_demo,
            rule=RULE_TEXT,
            counts=[
                StatusCountOut(status=s, label=STATUS_LABELS[s], count=counts[s])
                for s in STATUS_ORDER
            ],
            total=len(computed.diffs),
            classes=[
                ClassCountOut(slug=c.slug, name=c.name, count=c.count)
                for c in count_by_class(computed.diffs)
            ],
            filters=DiffFiltersOut(tipo=status, classe=class_slug),
            filtered_total=chosen.total,
            page=chosen.page,
            page_size=chosen.page_size,
            page_count=chosen.page_count,
            items=[self._item_out(diff, computed.readings) for diff in chosen.items],
        )

    def record(
        self,
        base_slug: str,
        target_slug: str,
        external_table: str | None,
        external_id: str | None,
    ) -> DiffItemOut:
        """One record of the diff, by its external identity — never by name."""
        if not external_table or not external_id:
            raise ValidationError(
                "Informe a identidade externa do registro: 'tabela' e 'id' da fonte."
            )
        computed = self._compute(base_slug, target_slug)
        for diff in computed.diffs:
            if diff.external_table == external_table and diff.external_record_id == external_id:
                return self._item_out(diff, computed.readings)
        raise NotFoundError(
            f"O registro {external_table}/{external_id} não está em nenhuma das duas releases."
        )

    # -- the exported file ----------------------------------------------------

    def diff_report(
        self,
        base_slug: str,
        target_slug: str,
        *,
        tipo: str | None = None,
        classe: str | None = None,
    ) -> Report:
        """The whole diff (filters applied, no page) as a CSV/XLSX document."""
        status, class_slug = self._filters(tipo, classe)
        computed = self._compute(base_slug, target_slug)
        selected = filter_diffs(computed.diffs, status=status, class_slug=class_slug)
        counts = count_by_status(computed.diffs)
        base, target = computed.base, computed.target

        includes_demo = (
            base.is_demo
            or target.is_demo
            or any(demo for _, demo in (*computed.base_sources, *computed.target_sources))
        )
        title = (
            f"Mudanças entre releases — {target.name}: "
            f"{base.release or base.slug} → {target.release or target.slug}"
        )
        subtitle = "; ".join(f"{STATUS_LABELS[s]}: {counts[s]}" for s in STATUS_ORDER) + (
            f" — catálogo '{base.lineage}'"
        )
        filters = []
        if status is not None:
            filters.append(f"tipo de mudança = {STATUS_LABELS[status]}")
        if class_slug is not None:
            filters.append(f"classe = {class_slug}")

        return Report(
            title=title,
            subtitle=subtitle,
            notices=standard_notices(includes_demo_data=includes_demo),
            sheets=[
                self._releases_sheet(computed),
                Sheet(
                    name="Resumo",
                    header=["Situação", "Registros"],
                    rows=[[STATUS_LABELS[s], counts[s]] for s in STATUS_ORDER]
                    + [["Total", len(computed.diffs)]],
                    notes=[
                        RULE_TEXT,
                        (
                            "Filtros aplicados às planilhas Registros e Alterações: "
                            + "; ".join(filters)
                            + f" ({len(selected)} registros)."
                            if filters
                            else "Sem filtro: todos os registros das duas releases."
                        ),
                    ],
                ),
                self._records_sheet(selected),
                self._changes_sheet(selected, computed.readings),
            ],
        )

    @staticmethod
    def _releases_sheet(computed: _Computed) -> Sheet:
        base, target = computed.base, computed.target

        def sources(items: Sequence[tuple[str, bool]]) -> str:
            return "; ".join(label for label, _ in items) or "nenhum valor com fonte"

        def text(value: object) -> object:
            return NOT_INFORMED if value is None or value == "" else value

        rows: list[list[object]] = [
            ["Slug da release", base.slug, target.slug],
            ["Catálogo (nome)", base.name, target.name],
            ["Release", text(base.release), text(target.release)],
            ["Linha (catálogo comparável)", text(base.lineage), text(target.lineage)],
            ["Licença", base.license_label, target.license_label],
            ["Proveniência", text(base.provenance), text(target.provenance)],
            ["SHA-256 da origem", base.source_sha256, target.source_sha256],
            [
                "Importada em",
                base.imported_at.isoformat() if base.imported_at else "sem importação registrada",
                (
                    target.imported_at.isoformat()
                    if target.imported_at
                    else "sem importação registrada"
                ),
            ],
            [
                "SHA-256 do bundle",
                text(base.bundle_sha256),
                text(target.bundle_sha256),
            ],
            [
                "SHA-256 do manifest",
                text(base.manifest_sha256),
                text(target.manifest_sha256),
            ],
            [
                "Fontes citadas pelos valores",
                sources(computed.base_sources),
                sources(computed.target_sources),
            ],
            ["Registros de material", base.material_count, target.material_count],
            ["Release ativa", base.is_active, target.is_active],
            ["Dado fictício", base.is_demo, target.is_demo],
        ]
        return Sheet(name="Releases", header=["Campo", "Base", "Alvo"], rows=rows)

    @staticmethod
    def _records_sheet(diffs: Sequence[RecordDiff]) -> Sheet:
        rows: list[list[object]] = []
        for diff in diffs:
            base, target = diff.base, diff.target
            raw = diff.raw_record_changed
            rows.append(
                [
                    STATUS_LABELS[diff.status],
                    diff.external_table,
                    diff.external_record_id,
                    diff.current.external_gruid or NOT_INFORMED,
                    base.name if base else NOT_IN_RELEASE,
                    target.name if target else NOT_IN_RELEASE,
                    base.class_name if base else NOT_IN_RELEASE,
                    target.class_name if target else NOT_IN_RELEASE,
                    len(diff.changes),
                    "não se aplica" if raw is None else raw,
                ]
            )
        return Sheet(
            name="Registros",
            header=[
                "Situação",
                "Tabela externa",
                "ID externo",
                "GRUID",
                "Nome na base",
                "Nome no alvo",
                "Classe na base",
                "Classe no alvo",
                "Campos alterados",
                "Registro de origem mudou",
            ],
            rows=rows,
            notes=[] if diffs else ["Nenhum registro com os filtros aplicados."],
        )

    @staticmethod
    def _changes_sheet(diffs: Sequence[RecordDiff], readings: Mapping[str, Reading]) -> Sheet:
        rows: list[list[object]] = []
        not_text = "não se aplica (campo de texto)"
        for diff in diffs:
            for change in diff.changes:
                identity = [diff.external_table, diff.external_record_id, diff.current.name]
                kind = KIND_LABELS[change.kind]
                if change.property_slug is None:
                    rows.append(
                        [
                            *identity,
                            change.label,
                            kind,
                            change.before_text or NOT_INFORMED,
                            not_text,
                            not_text,
                            change.after_text or NOT_INFORMED,
                            not_text,
                            not_text,
                            *([not_text] * 10),
                        ]
                    )
                    continue
                reading = readings[change.property_slug]
                before = value_view(change.before_value, reading)
                after = value_view(change.after_value, reading)
                rows.append(
                    [
                        *identity,
                        change.label,
                        kind,
                        *_reading_cells(before),
                        *_reading_cells(after),
                        pretty_unit(reading.unit) or "adimensional",
                        _cell(before, before.original, "value"),
                        _unit_cell(before, before.original),
                        _cell(after, after.original, "value"),
                        _unit_cell(after, after.original),
                        reading.canonical_unit,
                        _cell(before, before.canonical, "value"),
                        _cell(after, after.canonical, "value"),
                        before.conversion_method or _absent(before),
                        after.conversion_method or _absent(after),
                    ]
                )
        return Sheet(
            name="Alterações",
            header=[
                "Tabela externa",
                "ID externo",
                "Material",
                "Campo",
                "Natureza da mudança",
                "Antes (leitura)",
                "Antes mín. (leitura)",
                "Antes máx. (leitura)",
                "Depois (leitura)",
                "Depois mín. (leitura)",
                "Depois máx. (leitura)",
                "Unidade de leitura",
                "Antes, como a fonte escreveu",
                "Antes: unidade original",
                "Depois, como a fonte escreveu",
                "Depois: unidade original",
                "Unidade canônica",
                "Antes (canônico)",
                "Depois (canônico)",
                "Antes: método de conversão",
                "Depois: método de conversão",
            ],
            rows=rows,
            notes=[
                "Faixa: o valor é o típico declarado (ou o ponto médio gravado na importação); "
                "mín. e máx. são os limites. Ausência escrita por extenso, nunca zero.",
            ]
            + ([] if rows else ["Nenhuma alteração de campo com os filtros aplicados."]),
        )


def _absent(view: ValueView) -> str:
    """The words for a side with no number (D-24)."""
    return view.state_label


def _cell(view: ValueView, numbers: NumbersView | None, attribute: str) -> object:
    if numbers is None:
        return _absent(view)
    value = getattr(numbers, attribute)
    if value is None:
        return "não se aplica (valor único)" if view.state is ValueState.SCALAR else NOT_INFORMED
    return value


def _unit_cell(view: ValueView, numbers: NumbersView | None) -> object:
    if numbers is None:
        return _absent(view)
    return numbers.unit or NOT_INFORMED


def _reading_cells(view: ValueView) -> list[object]:
    return [
        _cell(view, view.reading, "value"),
        _cell(view, view.reading, "min"),
        _cell(view, view.reading, "max"),
    ]
