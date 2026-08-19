"""The catalogue panel: what is in the catalogue, and how much of it is real.

This service answers one question in several shapes — *how complete is this
data?* — and it is the screen where the project's third principle stops being a
rule in a document and becomes something a reader can see. A (material,
property) slot is in exactly one of three states:

``filled``
    a row exists and carries a normalised number.
``declared_missing``
    a row exists and says, explicitly, that the value is absent. Somebody looked
    and recorded that they found nothing. That is evidence.
``not_recorded``
    no row exists at all. Nobody has looked yet. That is a to-do list.

Reporting the last two as one number would be the ordinary thing to do and would
throw away the distinction this application was built to make.

Nothing here reaches for the ORM directly and nothing formats for display: the
counting is in :mod:`app.repositories.dashboard_repository`, the arithmetic is in
:mod:`app.calculations.statistics`, and pt-BR formatting is the client's job.
"""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy.orm import Session

from app.calculations.statistics import five_number_summary, share
from app.domain.errors import NotFoundError
from app.models.enums import DataQuality
from app.repositories.dashboard_repository import DashboardRepository
from app.schemas.dashboard import (
    BoxOut,
    ClassCoverageOut,
    Coverage,
    DistributionOut,
    OverviewOut,
    PropertyCoverageOut,
    QualitySliceOut,
)

# How many of the least-covered properties the panel names outright. Five fits
# on one screen next to the figure; a longer list stops being a call to action
# and becomes a second copy of the per-property table below it.
GAP_LIMIT = 5


def _coverage(filled: int, declared_missing: int, slots: int) -> Coverage:
    """Assemble a coverage record, letting an impossible count fail loudly.

    ``not_recorded`` is derived, and it can only go negative if the catalogue
    holds more value rows than there are (material × property) pairs — which the
    unique constraint on that pair makes impossible. It is deliberately *not*
    clamped: if the impossible ever happens, the schema's ``ge=0`` turns it into
    a 500 that someone investigates, instead of a plausible-looking percentage
    nobody questions.
    """
    return Coverage(
        filled=filled,
        declared_missing=declared_missing,
        not_recorded=slots - filled - declared_missing,
        slots=slots,
        filled_pct=share(filled, slots),
    )


class DashboardService:
    """Read-only aggregation over the catalogue."""

    def __init__(self, db: Session) -> None:
        self.repo = DashboardRepository(db)

    def overview(self) -> OverviewOut:
        """Totals, provenance mix, per-class and per-property coverage."""
        materials, demo_materials = self.repo.count_materials()
        classes = self.repo.count_classes()
        properties = self.repo.list_properties()
        property_count = len(properties)

        by_class_counts = self.repo.value_counts_by_class()
        by_property_counts = self.repo.value_counts_by_property()
        quality_counts = self.repo.quality_counts()

        # The denominator of the whole panel: every material could carry every
        # property, and the gap between that and what exists is the story.
        total_slots = materials * property_count
        total_filled = sum(filled for filled, _ in by_class_counts.values())
        total_declared = sum(missing for _, missing in by_class_counts.values())
        total = _coverage(total_filled, total_declared, total_slots)

        by_class = [
            ClassCoverageOut(
                slug=slug,
                name=name,
                materials=count,
                coverage=_coverage(
                    *by_class_counts.get(slug, (0, 0)),
                    slots=count * property_count,
                ),
            )
            for slug, name, count in self.repo.class_material_counts()
        ]

        by_property = [
            PropertyCoverageOut(
                slug=definition.slug,
                name=definition.name,
                category=definition.category,
                canonical_unit=definition.canonical_unit,
                # One slot per material: every material either has this property
                # or does not.
                coverage=_coverage(
                    *by_property_counts.get(definition.slug, (0, 0)),
                    slots=materials,
                ),
            )
            for definition in properties
        ]

        return OverviewOut(
            materials=materials,
            demo_materials=demo_materials,
            classes=classes,
            properties=property_count,
            coverage=total,
            by_quality=self._quality_slices(quality_counts, total),
            by_class=by_class,
            by_property=by_property,
            gaps=self._gaps(by_property),
        )

    def distribution(self, property_slug: str) -> DistributionOut:
        """One property's five-number summary, per class, in canonical units."""
        definition = self.repo.get_property(property_slug)
        if definition is None:
            raise NotFoundError(f"Propriedade não encontrada: {property_slug}")

        grouped: dict[str, list[float]] = defaultdict(list)
        names: dict[str, str] = {}
        for class_slug, class_name, value in self.repo.values_for_property(property_slug):
            grouped[class_slug].append(value)
            names[class_slug] = class_name

        boxes: list[BoxOut] = []
        for class_slug, values in grouped.items():
            summary = five_number_summary(values)
            # Unreachable while `grouped` only gains keys alongside a value, and
            # kept because `five_number_summary` is the one function here allowed
            # to say "nothing to summarise" — swallowing that would be the bug.
            if summary is None:
                continue
            boxes.append(
                BoxOut(
                    class_slug=class_slug,
                    class_name=names[class_slug],
                    count=summary.count,
                    minimum=summary.minimum,
                    q1=summary.q1,
                    median=summary.median,
                    q3=summary.q3,
                    maximum=summary.maximum,
                )
            )

        # Tallest median first: the figure is read as a ranking of classes, and
        # alphabetical order would hide the comparison it exists to make. Ties
        # break on the class name so the order is stable between requests.
        boxes.sort(key=lambda box: (-box.median, box.class_name))

        # Only classes that actually hold materials. A class with no materials at
        # all is not "missing this property" — it is simply empty, and saying
        # otherwise would blame the property for a gap in the taxonomy.
        without = [
            name
            for slug, name, count in self.repo.class_material_counts()
            if count > 0 and slug not in grouped
        ]

        return DistributionOut(
            property_slug=definition.slug,
            property_name=definition.name,
            category=definition.category,
            canonical_unit=definition.canonical_unit,
            allows_log_scale=definition.allows_log_scale,
            boxes=boxes,
            classes_without_data=without,
        )

    # --- Internals --------------------------------------------------------

    @staticmethod
    def _quality_slices(
        quality_counts: dict[DataQuality, int], total: Coverage
    ) -> list[QualitySliceOut]:
        """The provenance mix, over every slot rather than over every row.

        The denominator is ``slots``, not the number of stored values, so the
        five slices add up to the whole catalogue. Sharing out only the rows that
        exist would let a catalogue with two measured values and ten thousand
        empty slots report "100% medido".
        """
        buckets: list[tuple[str, int]] = [
            (quality.value, quality_counts.get(quality, 0)) for quality in DataQuality
        ]
        buckets.append(("AUSENTE", total.declared_missing))
        buckets.append(("NAO_REGISTRADO", total.not_recorded))
        return [
            QualitySliceOut(bucket=bucket, count=count, share_pct=share(count, total.slots))
            for bucket, count in buckets
        ]

    @staticmethod
    def _gaps(by_property: list[PropertyCoverageOut]) -> list[PropertyCoverageOut]:
        """The least-filled properties, worst first.

        Sorted on the count and not on the percentage: with no materials every
        percentage is ``None``, and a sort that has to special-case its own key
        is a sort that will be read wrong later. The count answers the reader's
        actual question — how many materials would I have to fill in?
        """
        return sorted(by_property, key=lambda p: (p.coverage.filled, p.name))[:GAP_LIMIT]
