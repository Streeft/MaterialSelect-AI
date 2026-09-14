"""Find Similar: the catalogue side of ``app.domain.nearness`` (P2).

A service of its own rather than a method on ``ChartService``, which is about
figures, or on ``MaterialService``, which is about the catalogue's contents:
"what resembles this" is neither. It reads through ``ChartRepository`` because
that repository already loads materials with their values and the property
definitions — the same pair ``ExportService`` borrows it for — and a fifth
repository issuing the same query would be one more place for the visibility
filter to be forgotten (P1-4).
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.domain.errors import NotFoundError
from app.domain.nearness import RecordValues, find_similar
from app.models.material import Material
from app.repositories.chart_repository import ChartRepository
from app.schemas.similarity import ExcludedOut, NeighbourOut, SimilarOut, SimilarRequest


class SimilarityService:
    """Ranks catalogue records by distance from one of them."""

    def __init__(self, db: Session, viewer_id: int | None = None) -> None:
        # Same viewer contract as every other read service (P1-4): a person's
        # own records take part in their own similarity search, and nobody
        # else's ever appear — including as the reference.
        self.viewer_id = viewer_id
        self.repo = ChartRepository(db, viewer_id)

    def similar_to(self, material_id: int, request: SimilarRequest) -> SimilarOut:
        definitions = {p.slug: p for p in self.repo.list_properties()}
        unknown = [slug for slug in request.property_slugs if slug not in definitions]
        if unknown:
            raise NotFoundError(f"Propriedades não encontradas: {', '.join(unknown)}")

        materials = self.repo.list_materials()
        by_id = {m.id: m for m in materials}
        if material_id not in by_id:
            # The same 404 a hidden record gets, for the same reason: a
            # different answer here would say whether it exists.
            raise NotFoundError(f"Material não encontrado: {material_id}")

        basis = list(dict.fromkeys(request.property_slugs))
        records: list[RecordValues] = [
            (material.id, material.name, self._values(material, basis)) for material in materials
        ]
        log_scale = {slug: definitions[slug].allows_log_scale for slug in basis}

        result = find_similar(material_id, records, basis, log_scale=log_scale, limit=request.limit)

        def label(slug: str) -> str:
            """The property as a reader knows it — never the slug on screen."""
            return definitions[slug].name

        reference = by_id[material_id]
        return SimilarOut(
            reference_id=result.reference_id,
            reference_name=reference.name,
            basis=result.basis,
            basis_labels=[label(slug) for slug in result.basis],
            neighbours=[
                NeighbourOut(
                    record_id=neighbour.record_id,
                    name=neighbour.name,
                    class_name=by_id[neighbour.record_id].material_class.name,
                    class_slug=by_id[neighbour.record_id].material_class.slug,
                    is_demo=by_id[neighbour.record_id].is_demo,
                    is_own_record=by_id[neighbour.record_id].owner_id is not None,
                    distance=neighbour.distance,
                    rank=neighbour.rank,
                    contributions=neighbour.contributions,
                )
                for neighbour in result.neighbours
            ],
            excluded=[
                ExcludedOut(
                    record_id=item.record_id,
                    name=item.name,
                    missing_slugs=item.missing_keys,
                    missing_labels=[label(slug) for slug in item.missing_keys],
                )
                for item in result.excluded
            ],
            degenerate=result.degenerate,
            degenerate_labels=[label(slug) for slug in result.degenerate],
            linear_fallback=result.linear_fallback,
            linear_fallback_labels=[label(slug) for slug in result.linear_fallback],
        )

    @staticmethod
    def _values(material: Material, basis: list[str]) -> dict[str, float | None]:
        """One material's canonical values over the basis.

        ``None`` for a property the material declares missing, holds no
        normalised value for, or simply has no row for — three different data
        states that answer this one question identically: it cannot be placed on
        that axis (principle 3).
        """
        by_slug = {v.property_definition.slug: v for v in material.property_values}
        values: dict[str, float | None] = {}
        for slug in basis:
            value = by_slug.get(slug)
            if value is None or value.is_missing or value.normalized_value is None:
                values[slug] = None
            else:
                values[slug] = float(value.normalized_value)
        return values
