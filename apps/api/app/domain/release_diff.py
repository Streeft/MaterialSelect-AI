"""What changed between two releases of one official catalogue (D-108, TM7).

Pure: no SQLAlchemy, no FastAPI. The repository hands over two lists of
:class:`RecordSnapshot` — what each release *stored* — and this module decides,
deterministically, which records are new, which left, which changed and how.

**Identity is external, never the name.** Two snapshots are the same record
when ``(external_table, external_record_id)`` match (D-102). A renamed record is
*changed* (its name is one of the compared fields); two records that happen to
share a name are two records.

**A value is compared in canonical units.** The physical quantity is what the
catalogue computes with, so ``7850 kg/m³`` and ``7,85 g/cm³`` are the same
value. The conversion goes through ``units.to_canonical`` (principle 4) and the
comparison is ``math.isclose`` with a relative tolerance of 1e-9 — far below any
measured precision, wide enough to absorb the last bits a unit conversion
leaves. When the canonical numbers agree but the source *wrote* them
differently (another unit, another number in that unit), that is still a change
— of the writing, not of the value — and it is labelled as such.

**Absence is a state, never zero (D-24).** A property can be *not registered*
in a release (no row) or *declared missing* by the source (a row with
``is_missing``). Moving between either of those and a number is a change of
presence, written in words; nothing here ever substitutes ``0`` for a side that
has no number.

**Three universes (TM7-c).** Besides materials the diff reads processes and
transport modes, each matched by the same external identity. A process carries
its attribute values (compared exactly like a material property, discrete label
sets included); a material carries its composition (compared in mass percent,
element by element) and its curves (matched by external id, compared point by
point in canonical units). A record's ``is_active`` flag is deliberately *not*
compared (D-114 revokes that part of D-109: after a promotion every record of
the base release is inactive by construction, so comparing it would mark
everything as changed), and a range with a representative point on one side
only is a change of *form*, never a number compared with ``None`` (TM7-f).
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from enum import Enum

from app.calculations.units import to_canonical, to_canonical_delta
from app.domain.display_units import Reading
from app.domain.errors import ValidationError

#: Relative tolerance for "the same canonical number". Exact equality would
#: report a change every time a value crossed a unit conversion
#: (3.9 g/cm³ → 3899.9999999999995 kg/m³); 1e-9 is beyond any measurement.
REL_TOL = 1e-9

#: Maximum page size: a page is a screen, not an export (the export has no page).
MAX_PAGE_SIZE = 200


class RecordStatus(str, Enum):
    """What happened to one external record from the base to the target release."""

    CHANGED = "alterado"
    NEW = "novo"
    REMOVED = "desativado"
    UNCHANGED = "inalterado"


#: Display order: what needs reading first comes first.
STATUS_ORDER: tuple[RecordStatus, ...] = (
    RecordStatus.CHANGED,
    RecordStatus.NEW,
    RecordStatus.REMOVED,
    RecordStatus.UNCHANGED,
)

STATUS_LABELS: dict[RecordStatus, str] = {
    RecordStatus.CHANGED: "Alterado",
    RecordStatus.NEW: "Novo nesta release",
    RecordStatus.REMOVED: "Desativado (saiu da release)",
    RecordStatus.UNCHANGED: "Inalterado",
}


class Universe(str, Enum):
    """Which table of the catalogue a record belongs to."""

    MATERIAL = "material"
    PROCESS = "processo"
    TRANSPORT = "modal"


UNIVERSE_LABELS: dict[Universe, str] = {
    Universe.MATERIAL: "Material",
    Universe.PROCESS: "Processo",
    Universe.TRANSPORT: "Modal de transporte",
}

#: A transport mode has no class table; this is the label its class column shows.
TRANSPORT_CLASS_SLUG = "modal-de-transporte"
TRANSPORT_CLASS_NAME = "Modal de transporte"


class ValueState(str, Enum):
    """The states a value can be in for one record of one release."""

    NOT_REGISTERED = "nao_cadastrado"
    MISSING = "ausente"
    SCALAR = "escalar"
    INTERVAL = "faixa"
    #: A process attribute that is a set of labels from a vocabulary.
    DISCRETE = "rotulos"


STATE_LABELS: dict[ValueState, str] = {
    ValueState.NOT_REGISTERED: "não cadastrado nesta release",
    ValueState.MISSING: "declarado ausente pela fonte",
    ValueState.SCALAR: "valor único",
    ValueState.INTERVAL: "faixa",
    ValueState.DISCRETE: "rótulos de um vocabulário",
}

_NUMERIC_STATES = frozenset({ValueState.SCALAR, ValueState.INTERVAL})


class ChangeKind(str, Enum):
    """The nature of one field change, from the most to the least significant."""

    TEXT = "texto"
    PRESENCE = "ausencia"
    FORM = "forma"
    VALUE = "valor"
    WRITING = "escrita_da_fonte"
    METADATA = "metadado"


KIND_LABELS: dict[ChangeKind, str] = {
    ChangeKind.TEXT: "Campo do registro",
    ChangeKind.PRESENCE: "Presença do dado",
    ChangeKind.FORM: "Forma do valor (único ↔ faixa, ou números declarados)",
    ChangeKind.VALUE: "Valor",
    ChangeKind.WRITING: "Só a escrita da fonte (mesmo valor físico)",
    ChangeKind.METADATA: "Condição de medição, incerteza ou rótulos",
}

#: The record fields compared besides the values: (attribute, field id, label).
#: The class is compared by slug and shown by name.
TEXT_FIELDS: tuple[tuple[str, str, str], ...] = (
    ("name", "nome", "Nome"),
    ("class_slug", "classe", "Classe"),
    ("subclass", "subclasse", "Subclasse"),
    ("description", "descricao", "Descrição"),
    ("external_gruid", "gruid", "GRUID"),
)

#: The rule, in the words the screen and the exported file both print.
RULE_TEXT = (
    "Registros casados pela identidade externa (tabela e id da fonte), nunca pelo "
    "nome. Valores comparados na unidade canônica; mesma grandeza escrita de outro "
    "jeito é mudança de escrita, não de valor. Dado ausente ou não cadastrado é um "
    "estado, nunca zero. A grafia da unidade (kg/m^3 ou kg/m³) não muda o valor: "
    "o mesmo número físico escrito de outro jeito conta como escrita da fonte. "
    "Faixa com ponto representativo só de um lado, ou com limites declarados de "
    "um lado só, é mudança de forma, nunca comparação de número com vazio."
)


@dataclass(frozen=True)
class ValueSnapshot:
    """One stored property value of one record, as the release wrote it.

    Attribute names mirror ``MaterialPropertyValue`` so :class:`Reading` can read
    it directly. Bounds and uncertainty are in the **original** unit, as stored.
    """

    is_missing: bool
    value_scalar: float | None = None
    value_min: float | None = None
    value_max: float | None = None
    value_typical: float | None = None
    original_unit: str | None = None
    normalized_value: float | None = None
    canonical_unit: str | None = None
    conversion_method: str | None = None
    uncertainty: float | None = None
    measurement_condition: str | None = None
    #: Process attributes only: the labels of a discrete value.
    labels: tuple[str, ...] = ()

    @property
    def state(self) -> ValueState:
        if self.labels:
            return ValueState.DISCRETE
        if self.is_missing:
            return ValueState.MISSING
        if self.value_min is not None or self.value_max is not None:
            return ValueState.INTERVAL
        if self.value_scalar is not None:
            return ValueState.SCALAR
        # A row with no number that does not say it is missing still has no
        # number: read as missing, never as zero.
        return ValueState.MISSING


def state_of(value: ValueSnapshot | None) -> ValueState:
    return ValueState.NOT_REGISTERED if value is None else value.state


@dataclass(frozen=True)
class PropertyInfo:
    """What the diff needs to know about a property definition."""

    slug: str
    name: str
    canonical_unit: str


@dataclass(frozen=True)
class CompositionSnapshot:
    """One element of a material's composition, in mass percent.

    ``value`` carries the **normalized** numbers as if they were the original
    (the source's unit — ``wt%``, ``% massa`` — is not a Pint unit, and the
    comparison is in mass percent anyway). A balance row carries no number:
    its state is "the rest", never an absence and never a computed figure.
    """

    value: ValueSnapshot
    is_balance: bool = False


@dataclass(frozen=True)
class CurvePointSnapshot:
    """One point: as written (original unit) and normalized (canonical unit)."""

    x_value: float
    y_value: float
    y_min_value: float | None
    y_max_value: float | None
    x_normalized: float
    y_normalized: float
    y_min_normalized: float | None
    y_max_normalized: float | None


@dataclass(frozen=True)
class CurveSeriesSnapshot:
    position: int
    label: str | None
    conditions: str | None
    parameter_value: float | None
    parameter_original_unit: str | None
    parameter_normalized: float | None
    points: tuple[CurvePointSnapshot, ...] = ()


@dataclass(frozen=True)
class CurveSnapshot:
    """One curve of one material in one release, keyed by its external id."""

    external_id: str
    title: str
    kind: str
    description: str | None
    x_label: str | None
    y_label: str | None
    x_quantity: str
    y_quantity: str
    x_original_unit: str
    y_original_unit: str
    x_canonical_unit: str
    y_canonical_unit: str
    series: tuple[CurveSeriesSnapshot, ...] = ()


@dataclass(frozen=True)
class RecordSnapshot:
    """One record (material, process or transport mode) of one release.

    Keyed by its external identity. ``record_id`` is the internal id in the
    record's own table, kept only so the screen can link to it.
    """

    external_table: str
    external_record_id: str
    raw_record_sha256: str
    record_id: int
    name: str
    class_slug: str
    class_name: str
    external_gruid: str | None = None
    subclass: str | None = None
    description: str | None = None
    is_active: bool = True
    universe: Universe = Universe.MATERIAL
    #: Value key → stored value. A key absent from the map is "not registered in
    #: this release", which is a state of its own. Material properties use the
    #: plain slug; other keys carry a prefix (``atributo:``, ``modal:``).
    values: Mapping[str, ValueSnapshot] = field(default_factory=dict)
    #: Element symbol → its composition row (materials only).
    composition: Mapping[str, CompositionSnapshot] = field(default_factory=dict)
    #: Curve external id → the curve (materials only).
    curves: Mapping[str, CurveSnapshot] = field(default_factory=dict)

    @property
    def key(self) -> tuple[str, str]:
        return (self.external_table, self.external_record_id)


@dataclass(frozen=True)
class CanonicalNumbers:
    """A value's numbers in the property's canonical unit (``None`` = no such number)."""

    value: float | None
    min: float | None
    max: float | None
    typical: float | None
    uncertainty: float | None
    unit: str


def canonical_numbers(value: ValueSnapshot | None, canonical_unit: str) -> CanonicalNumbers | None:
    """Every number of a value in canonical units; ``None`` when it has no number.

    The representative point is the stored ``normalized_value`` (what the
    catalogue already computes with); the bounds and the typical are converted
    from the original unit here, because ``MaterialPropertyValue`` stores them
    only as written. The uncertainty is a difference: ±5 °C is ±5 K.
    """
    if value is None or value.state not in _NUMERIC_STATES:
        return None
    unit = value.canonical_unit or canonical_unit
    origin = value.original_unit or unit

    def convert(number: float | None) -> float | None:
        if number is None:
            return None
        return to_canonical(number, origin, unit)[0]

    if value.state is ValueState.SCALAR:
        representative = (
            value.normalized_value
            if value.normalized_value is not None
            else convert(value.value_scalar)
        )
        bounds: tuple[float | None, float | None, float | None] = (None, None, None)
    else:
        bounds = (convert(value.value_min), convert(value.value_max), convert(value.value_typical))
        representative = value.normalized_value if value.normalized_value is not None else bounds[2]
    uncertainty = (
        None if value.uncertainty is None else to_canonical_delta(value.uncertainty, origin, unit)
    )
    return CanonicalNumbers(representative, bounds[0], bounds[1], bounds[2], uncertainty, unit)


def _same_number(a: float | None, b: float | None) -> bool:
    if a is None or b is None:
        return a is None and b is None
    return math.isclose(a, b, rel_tol=REL_TOL, abs_tol=0.0)


def _same_text(a: str | None, b: str | None) -> bool:
    # An empty string carries no more than NULL; both read "não informado".
    return (a or None) == (b or None)


def compare_values(
    before: ValueSnapshot | None, after: ValueSnapshot | None, canonical_unit: str
) -> ChangeKind | None:
    """The most significant change between two stored values, or ``None``.

    Order of significance: presence (a number appeared or disappeared), form
    (single value ↔ range ↔ labels, or a range that declares other numbers),
    value (canonical numbers or labels differ), writing (same canonical
    numbers, different original number or unit — the spelling of the unit
    included), metadata (measurement condition or uncertainty).
    """
    state_before, state_after = state_of(before), state_of(after)
    if state_before is not state_after:
        both_present = all(
            state in _NUMERIC_STATES or state is ValueState.DISCRETE
            for state in (state_before, state_after)
        )
        return ChangeKind.FORM if both_present else ChangeKind.PRESENCE
    if before is None or after is None:
        return None  # both not registered
    if state_before is ValueState.DISCRETE:
        if frozenset(before.labels) != frozenset(after.labels):
            return ChangeKind.VALUE
        if not _same_text(before.measurement_condition, after.measurement_condition):
            return ChangeKind.METADATA
        return None
    if state_before not in _NUMERIC_STATES:
        # Both declared missing: only what the source said about it can differ.
        if not _same_text(before.measurement_condition, after.measurement_condition):
            return ChangeKind.METADATA
        return None

    numbers_before = canonical_numbers(before, canonical_unit)
    numbers_after = canonical_numbers(after, canonical_unit)
    assert numbers_before is not None and numbers_after is not None
    attributes = ("value", "min", "max", "typical")
    # A number on one side and nothing on the other is a different *shape* of
    # the declaration (TM7-f): it is never compared as a number against None,
    # which would read as a change of value that nobody measured.
    for attribute in attributes:
        if (getattr(numbers_before, attribute) is None) != (
            getattr(numbers_after, attribute) is None
        ):
            return ChangeKind.FORM
    for attribute in attributes:
        if not _same_number(getattr(numbers_before, attribute), getattr(numbers_after, attribute)):
            return ChangeKind.VALUE
    written_before = (
        before.original_unit,
        before.value_scalar,
        before.value_min,
        before.value_max,
        before.value_typical,
    )
    written_after = (
        after.original_unit,
        after.value_scalar,
        after.value_min,
        after.value_max,
        after.value_typical,
    )
    if written_before != written_after:
        return ChangeKind.WRITING
    if not _same_number(numbers_before.uncertainty, numbers_after.uncertainty) or not _same_text(
        before.measurement_condition, after.measurement_condition
    ):
        return ChangeKind.METADATA
    return None


@dataclass(frozen=True)
class FieldChange:
    """One field of one record that differs between the two releases."""

    field: str
    label: str
    kind: ChangeKind
    #: Record field: the text on each side (``None`` = not informed).
    before_text: str | None = None
    after_text: str | None = None
    #: Property value: the slug and each side (``None`` = not registered).
    property_slug: str | None = None
    before_value: ValueSnapshot | None = None
    after_value: ValueSnapshot | None = None


@dataclass(frozen=True)
class RecordDiff:
    """One external record across the two releases."""

    external_table: str
    external_record_id: str
    status: RecordStatus
    base: RecordSnapshot | None
    target: RecordSnapshot | None
    changes: tuple[FieldChange, ...] = ()

    @property
    def current(self) -> RecordSnapshot:
        """The side that describes the record now: the target, else the base."""
        side = self.target or self.base
        assert side is not None
        return side

    @property
    def class_slugs(self) -> frozenset[str]:
        return frozenset(side.class_slug for side in (self.base, self.target) if side is not None)

    @property
    def raw_record_changed(self) -> bool | None:
        """Whether the source row's bytes changed; ``None`` when one side is absent.

        Informative only: the raw row may carry columns the catalogue does not
        map, so a different hash with no mapped change stays "inalterado".
        """
        if self.base is None or self.target is None:
            return None
        return self.base.raw_record_sha256 != self.target.raw_record_sha256


def _text_changes(base: RecordSnapshot, target: RecordSnapshot) -> list[FieldChange]:
    changes = []
    for attribute, field_id, label in TEXT_FIELDS:
        before, after = getattr(base, attribute), getattr(target, attribute)
        if _same_text(before, after):
            continue
        if attribute == "class_slug":
            before, after = base.class_name, target.class_name
        changes.append(
            FieldChange(
                field=field_id,
                label=label,
                kind=ChangeKind.TEXT,
                before_text=before or None,
                after_text=after or None,
            )
        )
    return changes


ABSENT_TEXT = STATE_LABELS[ValueState.NOT_REGISTERED]


def _property_order(slug: str, properties: Mapping[str, PropertyInfo]) -> tuple[str, str]:
    info = properties.get(slug)
    return ((info.name if info else slug).casefold(), slug)


def _value_field(key: str) -> str:
    """Material properties keep ``propriedade:<slug>``; other keys carry their prefix."""
    return key if ":" in key else f"propriedade:{key}"


def _value_changes(
    base: RecordSnapshot, target: RecordSnapshot, properties: Mapping[str, PropertyInfo]
) -> list[FieldChange]:
    changes = []
    slugs = sorted(
        set(base.values) | set(target.values), key=lambda s: _property_order(s, properties)
    )
    for slug in slugs:
        info = properties.get(slug)
        if info is None:
            # Defence in depth (TM7-g): the foreign key keeps this from happening
            # today, and if it ever does it is a refusal in words, not a 500.
            raise ValidationError(
                f"O valor '{slug}' não tem definição de propriedade no catálogo; "
                "a comparação não pode ler o que não sabe medir."
            )
        before, after = base.values.get(slug), target.values.get(slug)
        kind = compare_values(before, after, info.canonical_unit)
        if kind is None:
            continue
        changes.append(
            FieldChange(
                field=_value_field(slug),
                label=info.name,
                kind=kind,
                property_slug=slug,
                before_value=before,
                after_value=after,
            )
        )
    return changes


#: Composition is compared in mass percent (``app.domain.composition``).
COMPOSITION_UNIT = "percent"
COMPOSITION_PREFIX = "composicao:"


def _fmt(number: float) -> str:
    """A number the way pt-BR writes it, for the sentences built here."""
    return f"{number:.6g}".replace(".", ",")


def _describe_composition(entry: CompositionSnapshot | None) -> str:
    if entry is None:
        return ABSENT_TEXT
    if entry.is_balance:
        return "o resto da composição (balanço, não calculado)"
    numbers = canonical_numbers(entry.value, COMPOSITION_UNIT)
    if numbers is None:
        return STATE_LABELS[entry.value.state]
    if entry.value.state is ValueState.SCALAR:
        return f"{_fmt(numbers.value)} %" if numbers.value is not None else ABSENT_TEXT
    parts = []
    if numbers.min is not None:
        parts.append(f"mín. {_fmt(numbers.min)} %")
    if numbers.max is not None:
        parts.append(f"máx. {_fmt(numbers.max)} %")
    if numbers.typical is not None:
        parts.append(f"nominal {_fmt(numbers.typical)} %")
    return ", ".join(parts) or ABSENT_TEXT


def _composition_changes(base: RecordSnapshot, target: RecordSnapshot) -> list[FieldChange]:
    changes = []
    for element in sorted(set(base.composition) | set(target.composition)):
        before, after = base.composition.get(element), target.composition.get(element)
        label = f"Composição: {element}"
        key = f"{COMPOSITION_PREFIX}{element}"
        if (before is not None and before.is_balance) or (after is not None and after.is_balance):
            if before is not None and after is not None and before.is_balance == after.is_balance:
                continue  # the rest on both sides: nothing was declared that could differ
            kind = ChangeKind.PRESENCE if before is None or after is None else ChangeKind.FORM
            changes.append(
                FieldChange(
                    field=key,
                    label=label,
                    kind=kind,
                    before_text=_describe_composition(before),
                    after_text=_describe_composition(after),
                )
            )
            continue
        kind_or_none = compare_values(
            before.value if before else None, after.value if after else None, COMPOSITION_UNIT
        )
        if kind_or_none is None:
            continue
        changes.append(
            FieldChange(
                field=key,
                label=label,
                kind=kind_or_none,
                property_slug=key,
                before_value=before.value if before else None,
                after_value=after.value if after else None,
            )
        )
    return changes


def _plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


def _curve_summary(curve: CurveSnapshot | None) -> str:
    if curve is None:
        return ABSENT_TEXT
    points = sum(len(series.points) for series in curve.series)
    return (
        f"{_plural(len(curve.series), 'série', 'séries')}, " f"{_plural(points, 'ponto', 'pontos')}"
    )


def _curve_axes(curve: CurveSnapshot) -> str:
    return (
        f"x: {curve.x_quantity} em {curve.x_canonical_unit}; "
        f"y: {curve.y_quantity} em {curve.y_canonical_unit}"
    )


#: (field suffix, label, reader) of the descriptive fields of a curve.
_CURVE_TEXT_FIELDS: tuple[tuple[str, str, str], ...] = (
    ("titulo", "Título", "title"),
    ("descricao", "Descrição", "description"),
    ("rotulo_x", "Rótulo do eixo X", "x_label"),
    ("rotulo_y", "Rótulo do eixo Y", "y_label"),
    ("tipo", "Tipo da curva", "kind"),
)


def _same_optional(a: float | None, b: float | None) -> bool:
    return _same_number(a, b)


def _curve_data_change(
    before: CurveSnapshot, after: CurveSnapshot
) -> tuple[ChangeKind, int] | None:
    """The kind of change in the series and points of one curve, and how many points differ.

    Points are matched by position inside a series, series by position inside a
    curve; the comparison is on the normalized (canonical) numbers, so the same
    curve digitised in other units is not a change of value. A bound on one
    side only is a difference, never a number compared with ``None``.
    """
    differing = 0
    shape_changed = len(before.series) != len(after.series)
    value_changed = shape_changed
    writing_changed = False
    metadata_changed = False
    if before.x_original_unit != after.x_original_unit or (
        before.y_original_unit != after.y_original_unit
    ):
        writing_changed = True
    for series_before, series_after in zip(before.series, after.series, strict=False):
        if not _same_optional(
            series_before.parameter_normalized, series_after.parameter_normalized
        ):
            value_changed = True
        if (
            series_before.parameter_value != series_after.parameter_value
            or series_before.parameter_original_unit != series_after.parameter_original_unit
        ):
            writing_changed = True
        if not _same_text(series_before.label, series_after.label) or not _same_text(
            series_before.conditions, series_after.conditions
        ):
            metadata_changed = True
        if len(series_before.points) != len(series_after.points):
            value_changed = True
            differing += abs(len(series_before.points) - len(series_after.points))
        for pb, pa in zip(series_before.points, series_after.points, strict=False):
            same = (
                _same_number(pb.x_normalized, pa.x_normalized)
                and _same_number(pb.y_normalized, pa.y_normalized)
                and _same_optional(pb.y_min_normalized, pa.y_min_normalized)
                and _same_optional(pb.y_max_normalized, pa.y_max_normalized)
            )
            if not same:
                value_changed = True
                differing += 1
            elif (pb.x_value, pb.y_value, pb.y_min_value, pb.y_max_value) != (
                pa.x_value,
                pa.y_value,
                pa.y_min_value,
                pa.y_max_value,
            ):
                writing_changed = True
    if value_changed:
        return ChangeKind.VALUE, differing
    if writing_changed:
        return ChangeKind.WRITING, 0
    if metadata_changed:
        return ChangeKind.METADATA, 0
    return None


def _curve_changes(base: RecordSnapshot, target: RecordSnapshot) -> list[FieldChange]:
    changes = []
    for external_id in sorted(set(base.curves) | set(target.curves)):
        before, after = base.curves.get(external_id), target.curves.get(external_id)
        key = f"curva:{external_id}"
        current = after or before
        assert current is not None
        label = f"Curva: {current.title}"
        if before is None or after is None:
            changes.append(
                FieldChange(
                    field=key,
                    label=label,
                    kind=ChangeKind.PRESENCE,
                    before_text=_curve_summary(before),
                    after_text=_curve_summary(after),
                )
            )
            continue
        for suffix, field_label, attribute in _CURVE_TEXT_FIELDS:
            old, new = getattr(before, attribute), getattr(after, attribute)
            if not _same_text(old, new):
                changes.append(
                    FieldChange(
                        field=f"{key}:{suffix}",
                        label=f"{label} — {field_label}",
                        kind=ChangeKind.TEXT,
                        before_text=old or None,
                        after_text=new or None,
                    )
                )
        axes_before = (before.x_quantity, before.y_quantity, before.x_canonical_unit)
        axes_after = (after.x_quantity, after.y_quantity, after.x_canonical_unit)
        if axes_before != axes_after or before.y_canonical_unit != after.y_canonical_unit:
            changes.append(
                FieldChange(
                    field=f"{key}:eixos",
                    label=f"{label} — Grandezas e unidades dos eixos",
                    kind=ChangeKind.TEXT,
                    before_text=_curve_axes(before),
                    after_text=_curve_axes(after),
                )
            )
        data = _curve_data_change(before, after)
        if data is None:
            continue
        kind, differing = data
        note = {
            ChangeKind.VALUE: (
                f"; {_plural(differing, 'ponto', 'pontos')} com valor diferente"
                if differing
                else "; séries ou parâmetros com valor diferente"
            ),
            ChangeKind.WRITING: "; mesmos valores físicos, escritos de outro modo",
            ChangeKind.METADATA: "; rótulos ou condições das séries diferentes",
        }[kind]
        changes.append(
            FieldChange(
                field=f"{key}:pontos",
                label=f"{label} — Séries e pontos",
                kind=kind,
                before_text=_curve_summary(before),
                after_text=_curve_summary(after) + note,
            )
        )
    return changes


def _index(records: Iterable[RecordSnapshot], which: str) -> dict[tuple[str, str], RecordSnapshot]:
    indexed: dict[tuple[str, str], RecordSnapshot] = {}
    for record in records:
        if record.key in indexed:
            raise ValueError(f"Identidade externa repetida na release {which}: {record.key}")
        indexed[record.key] = record
    return indexed


def _sort_key(diff: RecordDiff) -> tuple[int, str, str, str]:
    return (
        STATUS_ORDER.index(diff.status),
        diff.current.name.casefold(),
        diff.external_table,
        diff.external_record_id,
    )


def diff_releases(
    base: Iterable[RecordSnapshot],
    target: Iterable[RecordSnapshot],
    properties: Mapping[str, PropertyInfo],
) -> list[RecordDiff]:
    """Every record of either release, classified, in a deterministic order.

    The order is: status (changed, new, removed, unchanged), then the current
    name, then the external identity as tie-breaker — the name sorts, it never
    matches.
    """
    before = _index(base, "base")
    after = _index(target, "alvo")
    diffs = []
    for key in set(before) | set(after):
        old, new = before.get(key), after.get(key)
        if old is None:
            diffs.append(RecordDiff(key[0], key[1], RecordStatus.NEW, None, new))
            continue
        if new is None:
            diffs.append(RecordDiff(key[0], key[1], RecordStatus.REMOVED, old, None))
            continue
        if old.universe is not new.universe:
            raise ValidationError(
                f"O registro {key[0]}/{key[1]} mudou de universo entre as releases "
                f"({UNIVERSE_LABELS[old.universe]} → {UNIVERSE_LABELS[new.universe]}); "
                "a identidade externa não pode apontar para duas tabelas."
            )
        changes = tuple(
            _text_changes(old, new)
            + _value_changes(old, new, properties)
            + _composition_changes(old, new)
            + _curve_changes(old, new)
        )
        status = RecordStatus.CHANGED if changes else RecordStatus.UNCHANGED
        diffs.append(RecordDiff(key[0], key[1], status, old, new, changes))
    return sorted(diffs, key=_sort_key)


def count_by_status(diffs: Sequence[RecordDiff]) -> dict[RecordStatus, int]:
    """Counts for every status, zero included, in display order."""
    counts = dict.fromkeys(STATUS_ORDER, 0)
    for diff in diffs:
        counts[diff.status] += 1
    return counts


@dataclass(frozen=True)
class ClassCount:
    slug: str
    name: str
    count: int


def count_by_class(diffs: Sequence[RecordDiff]) -> list[ClassCount]:
    """Records per class, a record counted in **each** class it has on either side.

    A record that moved class is found under both — the same rule as the class
    filter — so the sum can exceed the total by the number of moves.
    """
    names: dict[str, str] = {}
    counts: dict[str, int] = {}
    for diff in diffs:
        for side in (diff.base, diff.target):
            if side is not None:
                names.setdefault(side.class_slug, side.class_name)
        for slug in diff.class_slugs:
            counts[slug] = counts.get(slug, 0) + 1
    return sorted(
        (ClassCount(slug, names[slug], count) for slug, count in counts.items()),
        key=lambda item: (item.name.casefold(), item.slug),
    )


def filter_diffs(
    diffs: Sequence[RecordDiff],
    *,
    status: RecordStatus | None = None,
    class_slug: str | None = None,
    universe: Universe | None = None,
) -> list[RecordDiff]:
    """The records matching the filters; a class matches on either side."""
    return [
        diff
        for diff in diffs
        if (status is None or diff.status is status)
        and (class_slug is None or class_slug in diff.class_slugs)
        and (universe is None or diff.current.universe is universe)
    ]


def count_by_universe(diffs: Sequence[RecordDiff]) -> dict[Universe, int]:
    """Counts for every universe, zero included, in declaration order."""
    counts = dict.fromkeys(Universe, 0)
    for diff in diffs:
        counts[diff.current.universe] += 1
    return counts


def parse_universe(raw: str | None) -> Universe | None:
    """``universo`` from the URL; an unknown value is refused with the admitted list."""
    if raw is None or raw == "":
        return None
    try:
        return Universe(raw)
    except ValueError as exc:
        admitted = ", ".join(u.value for u in Universe)
        raise ValidationError(f"Universo desconhecido: {raw!r}. Admitidos: {admitted}.") from exc


def parse_status(raw: str | None) -> RecordStatus | None:
    """``tipo`` from the URL; an unknown value is refused with the admitted list."""
    if raw is None or raw == "":
        return None
    try:
        return RecordStatus(raw)
    except ValueError as exc:
        admitted = ", ".join(status.value for status in STATUS_ORDER)
        raise ValidationError(
            f"Tipo de mudança desconhecido: {raw!r}. Admitidos: {admitted}."
        ) from exc


@dataclass(frozen=True)
class Page:
    items: list[RecordDiff]
    page: int
    page_size: int
    page_count: int
    total: int


def paginate(items: Sequence[RecordDiff], page: int, page_size: int) -> Page:
    """One page; a page past the end is refused, never answered with silence.

    An empty result still has page 1 (empty), so the screen can say "nenhum
    registro" instead of an error.
    """
    if page_size < 1 or page_size > MAX_PAGE_SIZE:
        raise ValidationError(
            f"Tamanho de página inválido: {page_size}. Use de 1 a {MAX_PAGE_SIZE}."
        )
    if page < 1:
        raise ValidationError(f"Página inválida: {page}. A primeira página é 1.")
    page_count = max(1, math.ceil(len(items) / page_size))
    if page > page_count:
        raise ValidationError(
            f"A página {page} não existe: o resultado tem {page_count} "
            f"página{'s' if page_count > 1 else ''}."
        )
    start = (page - 1) * page_size
    return Page(list(items[start : start + page_size]), page, page_size, page_count, len(items))


@dataclass(frozen=True)
class ReleaseIdentity:
    """What decides whether two releases may be compared."""

    slug: str
    lineage: str | None
    is_demo: bool


def ensure_comparable(base: ReleaseIdentity, target: ReleaseIdentity) -> None:
    """Refuse, in Portuguese, any pair that is not two releases of one catalogue."""
    if base.slug == target.slug:
        raise ValidationError("Escolha duas releases diferentes para comparar.")
    for side in (base, target):
        if side.lineage is None:
            raise ValidationError(
                f"A release '{side.slug}' não declara a qual catálogo pertence (linha); "
                "sem isso ela não é comparável com nenhuma outra."
            )
    if base.lineage != target.lineage:
        raise ValidationError(
            f"As releases '{base.slug}' e '{target.slug}' são de catálogos diferentes "
            f"('{base.lineage}' e '{target.lineage}'); só releases do mesmo catálogo "
            "são comparáveis."
        )
    if base.is_demo != target.is_demo:
        raise ValidationError("Uma release fictícia não se compara com uma release real.")


@dataclass(frozen=True)
class NumbersView:
    value: float | None
    min: float | None
    max: float | None
    typical: float | None
    uncertainty: float | None
    unit: str | None


@dataclass(frozen=True)
class ValueView:
    """One side of a value change, ready to print: three units, absence in words."""

    state: ValueState
    state_label: str
    original: NumbersView | None
    canonical: NumbersView | None
    reading: NumbersView | None
    conversion_method: str | None
    measurement_condition: str | None
    #: The labels of a discrete value (process attributes); empty otherwise.
    labels: tuple[str, ...] = ()


def value_view(value: ValueSnapshot | None, reading: Reading) -> ValueView:
    """The original (as written), canonical and reading-unit numbers of one side.

    No number is produced for a side that has none: the three views are
    ``None`` and the state says why (D-24). The reading conversion starts from
    the original unit, the same rule as ``Reading.read`` everywhere else.
    """
    state = state_of(value)
    if value is None or state not in _NUMERIC_STATES:
        return ValueView(
            state=state,
            state_label=STATE_LABELS[state],
            original=None,
            canonical=None,
            reading=None,
            conversion_method=None,
            measurement_condition=value.measurement_condition if value else None,
            labels=value.labels if value else (),
        )
    canonical = canonical_numbers(value, reading.canonical_unit)
    assert canonical is not None
    read = reading.read(value)
    scalar = state is ValueState.SCALAR
    return ValueView(
        state=state,
        state_label=STATE_LABELS[state],
        original=NumbersView(
            value=value.value_scalar if scalar else value.value_typical,
            min=value.value_min,
            max=value.value_max,
            typical=value.value_typical,
            uncertainty=value.uncertainty,
            unit=value.original_unit,
        ),
        canonical=NumbersView(
            value=canonical.value,
            min=canonical.min,
            max=canonical.max,
            typical=canonical.typical,
            uncertainty=canonical.uncertainty,
            unit=canonical.unit,
        ),
        reading=NumbersView(
            value=read["display_value"] if scalar else read["display_typical"],  # type: ignore[arg-type]
            min=read["display_min"],  # type: ignore[arg-type]
            max=read["display_max"],  # type: ignore[arg-type]
            typical=read["display_typical"],  # type: ignore[arg-type]
            uncertainty=read["display_uncertainty"],  # type: ignore[arg-type]
            unit=reading.unit,
        ),
        conversion_method=value.conversion_method,
        measurement_condition=value.measurement_condition,
    )
