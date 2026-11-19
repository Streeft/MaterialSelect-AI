"""What cites a source, and moving those citations to another source (D-249).

A source is cited from nine places: the values of a material (the bulk of them), its curves,
composition, designations and ordinal values, the equivalence groups, the process attributes, the
battery chemistries and the transport modes. Deleting a source that any of them names would
either fail on a foreign key or, for the two that ``SET NULL``, quietly turn a cited value into an
uncited one. So the screen asks this repository two questions first — how many cite it, and where
— and merging is one ``UPDATE`` per table, never a loop in Python over the rows.
"""

from __future__ import annotations

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.battery_chemistry import BatteryChemistry
from app.models.equivalence import EquivalenceGroup
from app.models.material_composition import MaterialCompositionEntry
from app.models.material_curve import MaterialCurve
from app.models.material_designation import MaterialDesignation
from app.models.material_property_value import MaterialPropertyValue
from app.models.ordinal_property import MaterialOrdinalValue
from app.models.process_attribute import ProcessAttributeValue
from app.models.source import Source
from app.models.transport_mode import TransportMode

#: ``(model, singular, plural)`` of everything that carries a ``source_id``. The words are the
#: ones the refusal uses ("12 valores de propriedade e 3 designações"), so they live with the list.
CITING: tuple[tuple[type, str, str], ...] = (
    (MaterialPropertyValue, "valor de propriedade", "valores de propriedade"),
    (MaterialCurve, "curva", "curvas"),
    (MaterialCompositionEntry, "linha de composição", "linhas de composição"),
    (MaterialDesignation, "designação", "designações"),
    (MaterialOrdinalValue, "valor ordinal", "valores ordinais"),
    (EquivalenceGroup, "grupo de equivalência", "grupos de equivalência"),
    (ProcessAttributeValue, "atributo de processo", "atributos de processo"),
    (BatteryChemistry, "química de bateria", "químicas de bateria"),
    (TransportMode, "modal de transporte", "modais de transporte"),
)


class SourceRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def citation_counts(self) -> dict[int, int]:
        """``{source_id: how many rows cite it}`` over every table, in one grouped read each."""
        totals: dict[int, int] = {}
        for model, _one, _many in CITING:
            column = model.source_id
            stmt = select(column, func.count()).where(column.is_not(None)).group_by(column)
            for source_id, count in self.db.execute(stmt):
                totals[source_id] = totals.get(source_id, 0) + count
        return totals

    def citations_of(self, source_id: int) -> list[tuple[str, str, int]]:
        """``(singular, plural, count)`` for each kind that cites this source, never a zero."""
        found: list[tuple[str, str, int]] = []
        for model, one, many in CITING:
            count = self.db.execute(
                select(func.count()).select_from(model).where(model.source_id == source_id)
            ).scalar_one()
            if count:
                found.append((one, many, count))
        return found

    def move_citations(self, from_id: int, to_id: int) -> int:
        """Point every citation of ``from_id`` at ``to_id``; how many rows moved."""
        moved = 0
        for model, _one, _many in CITING:
            result = self.db.execute(
                update(model)
                .where(model.source_id == from_id)
                .values(source_id=to_id)
                .execution_options(synchronize_session=False)
            )
            moved += result.rowcount or 0
        return moved

    def delete(self, source: Source) -> None:
        self.db.delete(source)
        self.db.flush()

    def commit(self) -> None:
        self.db.commit()
