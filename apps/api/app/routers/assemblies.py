"""Projects with parts (D-257). On screen a "Projeto"; in code an assembly,
because ``Project`` is the reader's container (``app.models.project``)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_project, get_current_user
from app.models.project import Project
from app.models.user import User
from app.schemas.assembly import (
    AssemblyBriefOut,
    AssemblyIn,
    AssemblyOut,
    AssemblyPatch,
    PartIn,
    PartPatch,
)
from app.services.assembly_service import AssemblyService

router = APIRouter(prefix="/assemblies", tags=["assemblies"])


def _service(
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> AssemblyService:
    return AssemblyService(db, project.id, user.id)


@router.get("", response_model=list[AssemblyBriefOut])
def list_assemblies(service: AssemblyService = Depends(_service)) -> list[AssemblyBriefOut]:
    """The reader's projects, most recently changed first."""
    return service.list_assemblies()


@router.post("", response_model=AssemblyOut, status_code=status.HTTP_201_CREATED)
def create_assembly(
    payload: AssemblyIn, service: AssemblyService = Depends(_service)
) -> AssemblyOut:
    return service.create_assembly(payload)


@router.get("/{assembly_id}", response_model=AssemblyOut)
def get_assembly(assembly_id: int, service: AssemblyService = Depends(_service)) -> AssemblyOut:
    """The project, its parts and what they add up to, from the catalogue as it stands."""
    return service.get_assembly(assembly_id)


@router.patch("/{assembly_id}", response_model=AssemblyOut)
def update_assembly(
    assembly_id: int, patch: AssemblyPatch, service: AssemblyService = Depends(_service)
) -> AssemblyOut:
    return service.update_assembly(assembly_id, patch)


@router.delete("/{assembly_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assembly(assembly_id: int, service: AssemblyService = Depends(_service)) -> Response:
    service.delete_assembly(assembly_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{assembly_id}/parts", response_model=AssemblyOut, status_code=status.HTTP_201_CREATED
)
def add_part(
    assembly_id: int, payload: PartIn, service: AssemblyService = Depends(_service)
) -> AssemblyOut:
    """Adds a part and answers the whole project, with the sums redone."""
    return service.add_part(assembly_id, payload)


@router.patch("/{assembly_id}/parts/{part_id}", response_model=AssemblyOut)
def update_part(
    assembly_id: int,
    part_id: int,
    patch: PartPatch,
    service: AssemblyService = Depends(_service),
) -> AssemblyOut:
    return service.update_part(assembly_id, part_id, patch)


@router.delete("/{assembly_id}/parts/{part_id}", response_model=AssemblyOut)
def delete_part(
    assembly_id: int, part_id: int, service: AssemblyService = Depends(_service)
) -> AssemblyOut:
    return service.delete_part(assembly_id, part_id)
