"""Projects with parts (D-257): the reader's bill of parts and what it adds up to."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.calculations.assembly import (
    CARBON,
    ENERGY,
    MASS,
    MATERIAL_COST,
    PROPERTY_OF,
    AssemblySummary,
    MaterialValue,
    PartInput,
    summarise,
)
from app.domain.errors import ConflictError, NotFoundError, ValidationError
from app.models.assembly import Assembly, AssemblyPart
from app.repositories.assembly_repository import AssemblyRepository
from app.repositories.chart_repository import ChartRepository
from app.schemas.assembly import (
    TOTAL_UNITS,
    AssemblyBriefOut,
    AssemblyIn,
    AssemblyOut,
    AssemblyPatch,
    AssemblyTotalsOut,
    FigureOut,
    PartIn,
    PartMaterialOut,
    PartOut,
    PartPatch,
    PartStudyOut,
    TotalOut,
)

#: One account's projects, and one project's parts. Both are generous for a
#: design of a real object and keep one account from filling the tables.
MAX_ASSEMBLIES = 50
MAX_PARTS = 60

#: The material properties the sums read; nothing else is loaded.
_SLUGS = [slug for slug, _label in PROPERTY_OF.values()]


class AssemblyService:
    """Every method is scoped to one project. Another reader's assembly is a
    404, never a 403, so its existence is not disclosed (D-42)."""

    def __init__(self, db: Session, project_id: int, viewer_id: int) -> None:
        self.repo = AssemblyRepository(db)
        self.materials = ChartRepository(db, viewer_id)
        self.project_id = project_id

    # --- assemblies ---------------------------------------------------------

    def list_assemblies(self) -> list[AssemblyBriefOut]:
        return [self._brief(assembly) for assembly in self.repo.list_for(self.project_id)]

    def get_assembly(self, assembly_id: int) -> AssemblyOut:
        return self._out(self._own(assembly_id))

    def create_assembly(self, payload: AssemblyIn) -> AssemblyOut:
        if self.repo.count_for(self.project_id) >= MAX_ASSEMBLIES:
            raise ConflictError(
                f"Limite de {MAX_ASSEMBLIES} projetos por conta. Apague um antes de criar outro."
            )
        self._refuse_duplicate_name(payload.name)
        assembly = Assembly(
            project_id=self.project_id, name=payload.name, description=payload.description
        )
        self.repo.add(assembly)
        self.repo.commit()
        return self._out(self._own(assembly.id))

    def update_assembly(self, assembly_id: int, patch: AssemblyPatch) -> AssemblyOut:
        assembly = self._own(assembly_id)
        sent = patch.model_fields_set
        if "name" in sent:
            if patch.name is None:
                raise ValidationError("O nome do projeto não pode ficar em branco.")
            self._refuse_duplicate_name(patch.name, exclude_id=assembly.id)
            assembly.name = patch.name
        if "description" in sent:
            assembly.description = patch.description
        self._touch(assembly)
        self.repo.commit()
        return self._out(self._own(assembly_id))

    def delete_assembly(self, assembly_id: int) -> None:
        self.repo.delete(self._own(assembly_id))
        self.repo.commit()

    # --- parts --------------------------------------------------------------

    def add_part(self, assembly_id: int, payload: PartIn) -> AssemblyOut:
        assembly = self._own(assembly_id)
        if len(assembly.parts) >= MAX_PARTS:
            raise ConflictError(
                f"Limite de {MAX_PARTS} peças por projeto. Remova uma antes de acrescentar outra."
            )
        self._check_links(payload.material_id, payload.study_id)
        part = AssemblyPart(
            assembly_id=assembly.id,
            position=max((p.position for p in assembly.parts), default=-1) + 1,
            name=payload.name,
            role=payload.role,
            quantity=payload.quantity,
            unit_mass=payload.unit_mass,
            material_id=payload.material_id,
            study_id=payload.study_id,
            notes=payload.notes,
        )
        self.repo.add(part)
        self._touch(assembly)
        self.repo.commit()
        return self._reread(assembly)

    def update_part(self, assembly_id: int, part_id: int, patch: PartPatch) -> AssemblyOut:
        assembly = self._own(assembly_id)
        part = self._part(assembly, part_id)
        sent = patch.model_fields_set
        # Name, role, quantity and position have no "absent" state: null is refused.
        for required in ("name", "role", "quantity", "position"):
            if required in sent and getattr(patch, required) is None:
                raise ValidationError(f"O campo {required} não pode ser nulo.")
        self._check_links(
            patch.material_id if "material_id" in sent else None,
            patch.study_id if "study_id" in sent else None,
        )
        for name in (
            "name",
            "role",
            "quantity",
            "position",
            "unit_mass",
            "material_id",
            "study_id",
            "notes",
        ):
            if name in sent:
                setattr(part, name, getattr(patch, name))
        self._touch(assembly)
        self.repo.commit()
        return self._reread(assembly)

    def delete_part(self, assembly_id: int, part_id: int) -> AssemblyOut:
        assembly = self._own(assembly_id)
        self.repo.delete(self._part(assembly, part_id))
        self._touch(assembly)
        self.repo.commit()
        return self._reread(assembly)

    # --- helpers ------------------------------------------------------------

    def _own(self, assembly_id: int) -> Assembly:
        assembly = self.repo.get(assembly_id, self.project_id)
        if assembly is None:
            raise NotFoundError(f"Projeto não encontrado: {assembly_id}")
        return assembly

    def _reread(self, assembly: Assembly) -> AssemblyOut:
        # The parts collection was loaded before the write; read it again.
        self.repo.expire(assembly)
        return self._out(self._own(assembly.id))

    @staticmethod
    def _part(assembly: Assembly, part_id: int) -> AssemblyPart:
        for part in assembly.parts:
            if part.id == part_id:
                return part
        raise NotFoundError(f"Peça não encontrada: {part_id}")

    @staticmethod
    def _touch(assembly: Assembly) -> None:
        assembly.updated_at = datetime.now(UTC)

    def _refuse_duplicate_name(self, name: str, exclude_id: int | None = None) -> None:
        if self.repo.name_exists(name, self.project_id, exclude_id=exclude_id):
            raise ConflictError(f"Já existe um projeto chamado “{name}”.")

    def _check_links(self, material_id: int | None, study_id: int | None) -> None:
        """A part may only point at a material the reader can see and at a
        study of their own that returns materials. Anything else is the same
        404 a hidden record gets everywhere (D-42)."""
        if material_id is not None and not self.materials.list_materials(
            material_ids=[material_id], with_values=False
        ):
            raise NotFoundError(f"Material não encontrado: {material_id}")
        if study_id is not None:
            found = self.repo.study_names([study_id], self.project_id).get(study_id)
            if found is None:
                raise NotFoundError(f"Estudo não encontrado: {study_id}")
            if found[1] != "material":
                raise ValidationError(
                    "Uma peça é decidida por um estudo de materiais; este estudo devolve processos."
                )

    @staticmethod
    def _brief(assembly: Assembly) -> AssemblyBriefOut:
        return AssemblyBriefOut(
            id=assembly.id,
            name=assembly.name,
            description=assembly.description,
            part_count=len(assembly.parts),
            chosen_count=sum(1 for part in assembly.parts if part.material_id is not None),
            updated_at=assembly.updated_at,
        )

    def _out(self, assembly: Assembly) -> AssemblyOut:
        parts = list(assembly.parts)
        wanted = sorted({part.material_id for part in parts if part.material_id is not None})
        # Only the materials of this project, and only the three properties the
        # sums read (D-231). A hidden or inactive material is simply not here.
        materials = (
            {
                m.id: m
                for m in self.materials.list_materials(material_ids=wanted, property_slugs=_SLUGS)
            }
            if wanted
            else {}
        )
        studies = self.repo.study_names(
            sorted({part.study_id for part in parts if part.study_id is not None}), self.project_id
        )

        inputs: list[PartInput] = []
        for part in parts:
            material = materials.get(part.material_id) if part.material_id is not None else None
            inputs.append(
                PartInput(
                    name=part.name,
                    quantity=part.quantity,
                    unit_mass=part.unit_mass,
                    # A chosen material that cannot be read still counts as chosen:
                    # the reason then says it is gone, not that none was picked.
                    material_name=self._material_name(part, material),
                    values=self._values(material) if material is not None else None,
                )
            )
        summary: AssemblySummary = summarise(inputs)

        parts_out: list[PartOut] = []
        for part, figures in zip(parts, summary.parts, strict=True):
            material = materials.get(part.material_id) if part.material_id is not None else None
            study = studies.get(part.study_id) if part.study_id is not None else None
            parts_out.append(
                PartOut(
                    id=part.id,
                    position=part.position,
                    name=part.name,
                    role=part.role,
                    quantity=part.quantity,
                    unit_mass=part.unit_mass,
                    material=(
                        PartMaterialOut(
                            id=material.id,
                            name=material.name,
                            class_name=material.material_class.name,
                        )
                        if material is not None
                        else None
                    ),
                    material_unavailable=part.material_id is not None and material is None,
                    study=PartStudyOut(id=part.study_id, name=study[0]) if study else None,
                    notes=part.notes,
                    mass=self._figure(figures.figures[MASS]),
                    material_cost=self._figure(figures.figures[MATERIAL_COST]),
                    embodied_energy=self._figure(figures.figures[ENERGY]),
                    carbon=self._figure(figures.figures[CARBON]),
                )
            )

        brief = self._brief(assembly)
        return AssemblyOut(
            **brief.model_dump(),
            created_at=assembly.created_at,
            parts=parts_out,
            totals=AssemblyTotalsOut(
                **{
                    quantity: TotalOut(
                        value=total.value,
                        known_sum=total.known_sum,
                        known_parts=total.known_parts,
                        missing_parts=total.missing_parts,
                        unit=TOTAL_UNITS[quantity],
                    )
                    for quantity, total in summary.totals.items()
                }
            ),
        )

    @staticmethod
    def _material_name(part: AssemblyPart, material) -> str | None:
        if part.material_id is None:
            return None
        return material.name if material is not None else "O material escolhido"

    @staticmethod
    def _figure(figure) -> FigureOut:
        return FigureOut(value=figure.value, reason=figure.reason, quality=figure.quality)

    @staticmethod
    def _values(material) -> dict[str, MaterialValue]:
        """The material's usable values among the three the sums read.

        A row flagged missing and a row with no normalised value are absent
        here, the same as a slug with no row (principle 3)."""
        values: dict[str, MaterialValue] = {}
        for row in material.property_values:
            if row.is_missing or row.normalized_value is None:
                continue
            values[row.property_definition.slug] = MaterialValue(
                value=float(row.normalized_value), quality=row.data_quality.value
            )
        return values
