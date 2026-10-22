"""Releases of the official catalogue and the diff between two of them (D-108, TM7).

The service resolves the two releases, refuses a pair that is not comparable,
asks the repository for what each release stored and hands both lists to the
pure diff in ``app/domain/release_diff.py``. It writes only the stored diff
(``materialize``, called by the importer; D-123), never a row of a release.

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
    COMPOSITION_PREFIX,
    COMPOSITION_UNIT,
    EXPORT_DEFAULT_PAGE_SIZE,
    EXPORT_MAX_PAGE_SIZE,
    KIND_LABELS,
    RULE_TEXT,
    STATUS_LABELS,
    STATUS_ORDER,
    UNIVERSE_LABELS,
    FieldChange,
    NumbersView,
    PropertyInfo,
    RecordDiff,
    RecordSnapshot,
    RecordStatus,
    ReleaseIdentity,
    Universe,
    ValueState,
    ValueView,
    count_by_class,
    count_by_status,
    count_by_universe,
    diff_releases,
    ensure_comparable,
    filter_diffs,
    paginate,
    parse_status,
    parse_universe,
    value_view,
)
from app.domain.release_diff_store import FORMAT_VERSION, NotStorable, dump_diffs, load_diffs
from app.exporters.report import Report, Sheet, standard_notices
from app.repositories.catalog_release_diff_repository import CatalogReleaseDiffRepository
from app.repositories.catalog_release_repository import (
    ATTRIBUTE_PREFIX,
    TRANSPORT_CARBON_KEY,
    TRANSPORT_CARBON_UNIT,
    TRANSPORT_ENERGY_KEY,
    TRANSPORT_ENERGY_UNIT,
    CatalogReleaseRepository,
    ReleaseRow,
)
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
    UniverseCountOut,
    ValueSideOut,
)

DEFAULT_PAGE_SIZE = 50

#: Written in a cell where a side has no record, so absence is never a blank.
NOT_IN_RELEASE = "não está nesta versão"
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
        labels=list(view.labels),
    )


def _record_side(record: RecordSnapshot | None) -> RecordSideOut | None:
    if record is None:
        return None
    return RecordSideOut(
        record_id=record.record_id,
        material_id=record.record_id if record.universe is Universe.MATERIAL else None,
        universe=record.universe,
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
        self.diff_store = CatalogReleaseDiffRepository(db)
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
            raise NotFoundError(f"Versão do catálogo não encontrada: '{slug}'.")
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
        diffs = self._stored(base_row.dataset.id, target_row.dataset.id)
        if diffs is None:
            diffs, keys = self._live(base_row.dataset.id, target_row.dataset.id)
        else:
            keys = {c.property_slug for d in diffs for c in d.changes if c.property_slug}
        return _Computed(
            base=base,
            target=target,
            diffs=diffs,
            readings=self._readings(keys),
            base_sources=self.repo.value_sources(base_row.dataset.id),
            target_sources=self.repo.value_sources(target_row.dataset.id),
        )

    def _properties(self, keys: set[str]) -> dict[str, PropertyInfo]:
        definitions = self.repo.property_definitions({key for key in keys if ":" not in key})
        properties = {
            d.slug: PropertyInfo(slug=d.slug, name=d.name, canonical_unit=d.canonical_unit)
            for d in definitions
        }
        for attribute in self.repo.process_attribute_definitions(keys):
            key = f"{ATTRIBUTE_PREFIX}{attribute.slug}"
            properties[key] = PropertyInfo(
                slug=key, name=attribute.name, canonical_unit=attribute.canonical_unit or ""
            )
        for key, name, unit in (
            (TRANSPORT_ENERGY_KEY, "Intensidade energética", TRANSPORT_ENERGY_UNIT),
            (TRANSPORT_CARBON_KEY, "Intensidade de carbono", TRANSPORT_CARBON_UNIT),
        ):
            properties[key] = PropertyInfo(slug=key, name=name, canonical_unit=unit)
        return properties

    def _readings(self, keys: set[str]) -> dict[str, Reading]:
        """How each changed value is read; only the keys a change can name are looked up."""
        definitions = self.repo.property_definitions({key for key in keys if ":" not in key})
        readings = readings_for(definitions, self.unit_choices)
        readings.update(
            {
                f"{ATTRIBUTE_PREFIX}{slug}": reading
                for slug, reading in readings_for(
                    self.repo.process_attribute_definitions(keys), {}
                ).items()
            }
        )
        for key, unit in (
            (TRANSPORT_ENERGY_KEY, TRANSPORT_ENERGY_UNIT),
            (TRANSPORT_CARBON_KEY, TRANSPORT_CARBON_UNIT),
        ):
            readings[key] = Reading(unit=unit, canonical_unit=unit)
        return readings

    def _live(self, base_id: int, target_id: int) -> tuple[list[RecordDiff], set[str]]:
        """The diff computed from the rows both releases stored (D-108)."""
        base_records = self.repo.snapshots(base_id)
        target_records = self.repo.snapshots(target_id)
        keys = {key for record in (*base_records, *target_records) for key in record.values.keys()}
        return diff_releases(base_records, target_records, self._properties(keys)), keys

    def _stored(self, base_id: int, target_id: int) -> list[RecordDiff] | None:
        """The stored diff of the pair, only while it is provably current (D-123)."""
        row = self.diff_store.get(base_id, target_id)
        if row is None or row.format_version != FORMAT_VERSION:
            return None
        if row.fingerprint != self.diff_store.fingerprint(base_id, target_id, FORMAT_VERSION):
            return None
        return load_diffs(row.payload)

    def materialize_previous(self, target_slug: str) -> int | None:
        """Store the diff of a release against the one before it in its lineage."""
        _, target = self._get(self._all(), target_slug)
        if target.previous_slug is None:
            return None
        return self.materialize(target.previous_slug, target_slug)

    def materialize(self, base_slug: str, target_slug: str) -> int | None:
        """Compute the diff of a pair from its rows and store it (D-123).

        Returns the number of records stored, or ``None`` when the pair is not
        comparable or the diff cannot be stored faithfully — then nothing is
        stored and the API keeps computing it from the rows. The caller commits.
        """
        releases = self._all()
        base_row, base = self._get(releases, base_slug)
        target_row, target = self._get(releases, target_slug)
        try:
            ensure_comparable(
                ReleaseIdentity(base.slug, base.lineage, base.is_demo),
                ReleaseIdentity(target.slug, target.lineage, target.is_demo),
            )
            diffs, _ = self._live(base_row.dataset.id, target_row.dataset.id)
            payload = dump_diffs(diffs)
        except (ValueError, NotStorable):
            # ValidationError and a repeated identity are ValueErrors: the API
            # will compute the diff from the rows and say so in words.
            return None
        self.diff_store.db.flush()
        fingerprint = self.diff_store.fingerprint(
            base_row.dataset.id, target_row.dataset.id, FORMAT_VERSION
        )
        self.diff_store.put(
            base_dataset_id=base_row.dataset.id,
            target_dataset_id=target_row.dataset.id,
            version=FORMAT_VERSION,
            fingerprint=fingerprint,
            payload=payload,
        )
        return len(payload)

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
        reading = _reading_of(change.property_slug, readings)
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
            universe=diff.current.universe,
            universe_label=UNIVERSE_LABELS[diff.current.universe],
            base=_record_side(diff.base),
            target=_record_side(diff.target),
            raw_record_changed=diff.raw_record_changed,
            change_count=len(diff.changes),
            changes=[self._change_out(change, readings) for change in diff.changes],
        )

    def _filters(
        self, tipo: str | None, classe: str | None, universo: str | None = None
    ) -> tuple[RecordStatus | None, str | None, Universe | None]:
        status = parse_status(tipo)
        universe = parse_universe(universo)
        class_slug = classe or None
        if class_slug is not None and not self.repo.class_exists(class_slug):
            raise ValidationError(f"Classe de material desconhecida: '{class_slug}'.")
        return status, class_slug, universe

    def diff(
        self,
        base_slug: str,
        target_slug: str,
        *,
        tipo: str | None = None,
        classe: str | None = None,
        universo: str | None = None,
        page: int = 1,
        page_size: int = DEFAULT_PAGE_SIZE,
    ) -> ReleaseDiffOut:
        status, class_slug, universe = self._filters(tipo, classe, universo)
        computed = self._compute(base_slug, target_slug)
        selected = filter_diffs(
            computed.diffs, status=status, class_slug=class_slug, universe=universe
        )
        chosen = paginate(selected, page, page_size)
        counts = count_by_status(computed.diffs)
        universes = count_by_universe(computed.diffs)
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
            universes=[
                UniverseCountOut(universe=u, label=UNIVERSE_LABELS[u], count=universes[u])
                for u in Universe
            ],
            filters=DiffFiltersOut(tipo=status, classe=class_slug, universo=universe),
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
            f"O registro {external_table}/{external_id} não está em nenhuma das duas versões."
        )

    # -- the exported file ----------------------------------------------------

    def diff_report(
        self,
        base_slug: str,
        target_slug: str,
        *,
        tipo: str | None = None,
        classe: str | None = None,
        universo: str | None = None,
        page: int | None = None,
        page_size: int | None = None,
    ) -> Report:
        """The diff (filters applied) as a CSV/XLSX document.

        Without ``page`` or ``page_size`` it is the whole diff. With either, the
        file holds one page of the records — and only the field changes of those
        records — and says so in the title and in the summary
        (TM7-d-resid, D-162). The counts in the summary stay those of the whole
        diff: a page never changes what the two versions are.
        """
        status, class_slug, universe = self._filters(tipo, classe, universo)
        computed = self._compute(base_slug, target_slug)
        filtered = filter_diffs(
            computed.diffs, status=status, class_slug=class_slug, universe=universe
        )
        paged = page is not None or page_size is not None
        window = None
        selected = filtered
        if paged:
            window = paginate(
                filtered,
                page if page is not None else 1,
                page_size if page_size is not None else EXPORT_DEFAULT_PAGE_SIZE,
                max_page_size=EXPORT_MAX_PAGE_SIZE,
            )
            selected = window.items
        counts = count_by_status(computed.diffs)
        base, target = computed.base, computed.target

        title = (
            f"Mudanças entre versões — {target.name}: "
            f"{base.release or base.slug} → {target.release or target.slug}"
        )
        subtitle = "; ".join(f"{STATUS_LABELS[s]}: {counts[s]}" for s in STATUS_ORDER) + (
            f" — catálogo '{base.lineage}'"
        )
        page_note: list[str] = []
        if window is not None:
            first = (window.page - 1) * window.page_size + 1 if window.items else 0
            last = first + len(window.items) - 1 if window.items else 0
            where = (
                f"Página {window.page} de {window.page_count}: registros {first} a {last} "
                f"de {window.total} (com os filtros aplicados), {window.page_size} por página."
                if window.items
                else f"Página {window.page} de {window.page_count}: nenhum registro."
            )
            title = f"{title} (página {window.page} de {window.page_count})"
            page_note = [
                where,
                "Os totais do resumo são os das duas versões inteiras; as planilhas Registros e "
                "Alterações trazem só os registros desta página.",
            ]
        filters = []
        if status is not None:
            filters.append(f"tipo de mudança = {STATUS_LABELS[status]}")
        if class_slug is not None:
            filters.append(f"classe = {class_slug}")
        if universe is not None:
            filters.append(f"universo = {UNIVERSE_LABELS[universe]}")

        return Report(
            title=title,
            subtitle=subtitle,
            notices=standard_notices(),
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
                            + f" ({len(filtered)} registros)."
                            if filters
                            else "Sem filtro: todos os registros das duas versões."
                        ),
                        *page_note,
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
            ["Slug da versão", base.slug, target.slug],
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
            ["Versão ativa", base.is_active, target.is_active],
        ]
        return Sheet(name="Versões", header=["Campo", "Base", "Alvo"], rows=rows)

    @staticmethod
    def _records_sheet(diffs: Sequence[RecordDiff]) -> Sheet:
        rows: list[list[object]] = []
        for diff in diffs:
            base, target = diff.base, diff.target
            raw = diff.raw_record_changed
            rows.append(
                [
                    STATUS_LABELS[diff.status],
                    UNIVERSE_LABELS[diff.current.universe],
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
                "Universo",
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
                reading = _reading_of(change.property_slug, readings)
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


def _reading_of(key: str, readings: Mapping[str, Reading]) -> Reading:
    """The reading of a changed value; composition is always read in mass percent."""
    if key.startswith(COMPOSITION_PREFIX):
        return Reading(unit=COMPOSITION_UNIT, canonical_unit=COMPOSITION_UNIT)
    return readings[key]


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
