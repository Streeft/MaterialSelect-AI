"""Cadernos (D-92): the student's private notebooks.

Every route is scoped to whoever is logged in; there is no user id in any path,
and a notebook id that is not the caller's answers 404 like one that does not
exist. Thin on purpose: the rules live in ``NotebookService``.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Response, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.config import settings
from app.db.base import get_db
from app.dependencies import get_current_project, get_current_user
from app.domain.errors import ValidationError
from app.models.project import Project
from app.models.user import User
from app.schemas.notebook import (
    AppSourceIn,
    AskIn,
    ChatOut,
    MessageOut,
    NotebookIn,
    NotebookOut,
    NotebookSummaryOut,
    NotebookUpdate,
    NoteIn,
    NoteOut,
    NoteUpdate,
    SelectAllIn,
    SourceDetailOut,
    SourceOut,
    SourceUpdate,
    TextSourceIn,
)
from app.services.notebook_service import NotebookService

router = APIRouter(prefix="/notebooks", tags=["notebooks"])


def _service(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    project: Project = Depends(get_current_project),
) -> NotebookService:
    return NotebookService(db, user, project_id=project.id)


# --- notebooks ---------------------------------------------------------------


@router.get("", response_model=list[NotebookSummaryOut])
def list_notebooks(service: NotebookService = Depends(_service)) -> list[NotebookSummaryOut]:
    return service.list_notebooks()


@router.post("", response_model=NotebookOut, status_code=status.HTTP_201_CREATED)
def create_notebook(
    payload: NotebookIn, service: NotebookService = Depends(_service)
) -> NotebookOut:
    return service.create(payload)


@router.get("/{notebook_id}", response_model=NotebookOut)
def get_notebook(notebook_id: int, service: NotebookService = Depends(_service)) -> NotebookOut:
    return service.get(notebook_id)


@router.patch("/{notebook_id}", response_model=NotebookOut)
def update_notebook(
    notebook_id: int, payload: NotebookUpdate, service: NotebookService = Depends(_service)
) -> NotebookOut:
    return service.update(notebook_id, payload)


@router.delete("/{notebook_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notebook(notebook_id: int, service: NotebookService = Depends(_service)) -> Response:
    service.delete(notebook_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- sources -----------------------------------------------------------------


@router.post(
    "/{notebook_id}/sources/upload",
    response_model=SourceOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_source(
    notebook_id: int,
    file: UploadFile = File(...),
    service: NotebookService = Depends(_service),
) -> SourceOut:
    """A PDF, DOCX, TXT or Markdown file. Only its text is kept.

    ``async`` to await the upload stream, and the extraction goes to the
    threadpool for the reason ``imports.upload_file`` spells out: a long PDF
    parsed inline would freeze every request in the process.
    """
    limit = settings.notebook_max_upload_bytes
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise ValidationError(f"Arquivo excede o limite de {limit / (1024 * 1024):.0f} MB.")
    return await run_in_threadpool(
        service.add_upload, notebook_id, file.filename or "arquivo.txt", data
    )


@router.post(
    "/{notebook_id}/sources/text", response_model=SourceOut, status_code=status.HTTP_201_CREATED
)
def add_text_source(
    notebook_id: int, payload: TextSourceIn, service: NotebookService = Depends(_service)
) -> SourceOut:
    return service.add_text(notebook_id, payload)


@router.post(
    "/{notebook_id}/sources/app", response_model=SourceOut, status_code=status.HTTP_201_CREATED
)
def add_app_source(
    notebook_id: int, payload: AppSourceIn, service: NotebookService = Depends(_service)
) -> SourceOut:
    """A material datasheet or a saved study, written out as text."""
    return service.add_app_source(notebook_id, payload)


@router.put("/{notebook_id}/sources/selection", response_model=list[SourceOut])
def select_all_sources(
    notebook_id: int, payload: SelectAllIn, service: NotebookService = Depends(_service)
) -> list[SourceOut]:
    return service.select_all(notebook_id, payload.selected)


@router.get("/{notebook_id}/sources/{source_id}", response_model=SourceDetailOut)
def get_source(
    notebook_id: int, source_id: int, service: NotebookService = Depends(_service)
) -> SourceDetailOut:
    return service.get_source(notebook_id, source_id)


@router.patch("/{notebook_id}/sources/{source_id}", response_model=SourceOut)
def update_source(
    notebook_id: int,
    source_id: int,
    payload: SourceUpdate,
    service: NotebookService = Depends(_service),
) -> SourceOut:
    return service.update_source(notebook_id, source_id, payload)


@router.delete("/{notebook_id}/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_source(
    notebook_id: int, source_id: int, service: NotebookService = Depends(_service)
) -> Response:
    service.delete_source(notebook_id, source_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- chat and guide ----------------------------------------------------------


@router.get("/{notebook_id}/messages", response_model=list[MessageOut])
def list_messages(
    notebook_id: int, service: NotebookService = Depends(_service)
) -> list[MessageOut]:
    return service.messages(notebook_id)


@router.delete("/{notebook_id}/messages", status_code=status.HTTP_204_NO_CONTENT)
def clear_messages(notebook_id: int, service: NotebookService = Depends(_service)) -> Response:
    service.clear_messages(notebook_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{notebook_id}/chat", response_model=ChatOut)
def ask(notebook_id: int, payload: AskIn, service: NotebookService = Depends(_service)) -> ChatOut:
    """Ask the selected sources. Every figure in the answer is checked against
    the passages it cites; the day's quota is counted on success."""
    return service.ask(notebook_id, payload)


@router.post("/{notebook_id}/summary", response_model=NotebookOut)
def summarize(notebook_id: int, service: NotebookService = Depends(_service)) -> NotebookOut:
    """Write (or rewrite) the notebook guide and its suggested questions."""
    return service.summarize(notebook_id)


# --- notes -------------------------------------------------------------------


@router.post("/{notebook_id}/notes", response_model=NoteOut, status_code=status.HTTP_201_CREATED)
def add_note(
    notebook_id: int, payload: NoteIn, service: NotebookService = Depends(_service)
) -> NoteOut:
    return service.add_note(notebook_id, payload)


@router.post(
    "/{notebook_id}/messages/{message_id}/note",
    response_model=NoteOut,
    status_code=status.HTTP_201_CREATED,
)
def save_message_as_note(
    notebook_id: int, message_id: int, service: NotebookService = Depends(_service)
) -> NoteOut:
    return service.save_message_as_note(notebook_id, message_id)


@router.patch("/{notebook_id}/notes/{note_id}", response_model=NoteOut)
def update_note(
    notebook_id: int,
    note_id: int,
    payload: NoteUpdate,
    service: NotebookService = Depends(_service),
) -> NoteOut:
    return service.update_note(notebook_id, note_id, payload)


@router.delete("/{notebook_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(
    notebook_id: int, note_id: int, service: NotebookService = Depends(_service)
) -> Response:
    service.delete_note(notebook_id, note_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
