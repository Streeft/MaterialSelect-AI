"""Cadernos (D-92): the student's private notebooks.

Every route is scoped to whoever is logged in; there is no user id in any path,
and a notebook id that is not the caller's answers 404 like one that does not
exist. Thin on purpose: the rules live in ``NotebookService``.
"""

from __future__ import annotations

from collections.abc import Callable, Generator
from typing import Literal

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, File, Response, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.config import settings
from app.db.base import get_db, get_session_factory
from app.dependencies import get_current_project, get_current_user
from app.domain.errors import ValidationError
from app.integrations.http import build_client, get_http_transport, get_resolver
from app.integrations.safe_fetch import Resolver
from app.models.project import Project
from app.models.user import User
from app.schemas.notebook import (
    AppSourceIn,
    ArtifactOut,
    ArtifactUpdate,
    AskIn,
    ChatOut,
    ExternalSourceIn,
    MessageOut,
    NotebookIn,
    NotebookOut,
    NotebookSummaryOut,
    NotebookUpdate,
    NoteIn,
    NoteOut,
    NoteUpdate,
    SearchIn,
    SearchOut,
    SelectAllIn,
    SourceCapabilitiesOut,
    SourceDetailOut,
    SourceOut,
    SourceUpdate,
    StudioCatalogOut,
    StudioIn,
    StudioListOut,
    TextSourceIn,
    UrlSourceIn,
    YoutubeOut,
    YoutubeSourceIn,
)
from app.services.external_source_service import ExternalSourceService
from app.services.notebook_service import NotebookService
from app.services.studio_service import StudioService, run_job

router = APIRouter(prefix="/notebooks", tags=["notebooks"])


def _service(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    project: Project = Depends(get_current_project),
) -> NotebookService:
    return NotebookService(db, user, project_id=project.id)


def _studio(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> StudioService:
    return StudioService(db, user)


def _external(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    project: Project = Depends(get_current_project),
    transport: httpx.BaseTransport | None = Depends(get_http_transport),
    resolver: Resolver | None = Depends(get_resolver),
) -> Generator[ExternalSourceService, None, None]:
    """The outside-sources service with a client of its own, closed after the
    request. Transport and resolver are dependencies so tests can replace them
    and no test ever reaches the network (D-97)."""
    client = build_client(settings, transport)
    try:
        yield ExternalSourceService(db, user, settings, client, resolver, project_id=project.id)
    finally:
        client.close()


# --- the Studio's catalogue ----------------------------------------------------
#
# Declared before ``/{notebook_id}``: the path would otherwise be read as a
# notebook id and answer 422.


@router.get("/studio-catalog", response_model=StudioCatalogOut)
def studio_catalog() -> StudioCatalogOut:
    """The Studio's tools, formats, templates and their default instructions —
    the one truth the "Criar …" modal reads."""
    return StudioService.catalog()


@router.get("/source-capabilities", response_model=SourceCapabilitiesOut)
def source_capabilities() -> SourceCapabilitiesOut:
    """Which outside sources this server has switched on, and why not — from
    configuration alone, the same for every student (D-97)."""
    return ExternalSourceService.capabilities(settings)


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


@router.post(
    "/{notebook_id}/sources/url", response_model=SourceOut, status_code=status.HTTP_201_CREATED
)
def add_url_source(
    notebook_id: int, payload: UrlSourceIn, service: ExternalSourceService = Depends(_external)
) -> SourceOut:
    """A web page by its link: fetched once by the server, under the SSRF
    policy of ``safe_fetch``, and kept as text. Spends one outside request."""
    return service.add_url(notebook_id, payload)


@router.post("/{notebook_id}/sources/youtube", response_model=YoutubeOut)
def add_youtube_source(
    notebook_id: int,
    payload: YoutubeSourceIn,
    response: Response,
    service: ExternalSourceService = Depends(_external),
) -> YoutubeOut:
    """A YouTube video with its pasted transcript. Without one the answer is
    ``needs_transcript`` (200, nothing stored); with one, the source (201)."""
    result = service.add_youtube(notebook_id, payload)
    if result.source is not None:
        response.status_code = status.HTTP_201_CREATED
    return result


@router.post("/{notebook_id}/search", response_model=SearchOut)
def search_sources(
    notebook_id: int, payload: SearchIn, service: ExternalSourceService = Depends(_external)
) -> SearchOut:
    """Articles (OpenAlex), Wikipedia or the web. A POST because it spends the
    day's quota of outside requests."""
    return service.search(notebook_id, payload)


@router.post(
    "/{notebook_id}/sources/external",
    response_model=SourceOut,
    status_code=status.HTTP_201_CREATED,
)
def add_external_source(
    notebook_id: int,
    payload: ExternalSourceIn,
    service: ExternalSourceService = Depends(_external),
) -> SourceOut:
    """A search result, by its key. The server fetches it again rather than
    trusting anything the browser sends about it."""
    return service.add_external(notebook_id, payload)


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


# --- studio (D-94) -------------------------------------------------------------


@router.get("/{notebook_id}/studio", response_model=StudioListOut)
def list_artifacts(notebook_id: int, service: StudioService = Depends(_studio)) -> StudioListOut:
    return service.list(notebook_id)


@router.post(
    "/{notebook_id}/studio", response_model=ArtifactOut, status_code=status.HTTP_202_ACCEPTED
)
def create_artifact(
    notebook_id: int,
    payload: StudioIn,
    background: BackgroundTasks,
    service: StudioService = Depends(_studio),
    user: User = Depends(get_current_user),
    factory: Callable[[], Session] = Depends(get_session_factory),
) -> ArtifactOut:
    """Start a generation. Answers at once with the artifact ``gerando``; the
    work runs after the response, in a session of its own, and the list shows
    ``pronto`` or ``falhou`` when it ends."""
    artifact = service.create(notebook_id, payload)
    background.add_task(run_job, factory, user.id, artifact.id)
    return artifact


@router.get("/{notebook_id}/studio/{artifact_id}", response_model=ArtifactOut)
def get_artifact(
    notebook_id: int, artifact_id: int, service: StudioService = Depends(_studio)
) -> ArtifactOut:
    return service.get(notebook_id, artifact_id)


@router.patch("/{notebook_id}/studio/{artifact_id}", response_model=ArtifactOut)
def rename_artifact(
    notebook_id: int,
    artifact_id: int,
    payload: ArtifactUpdate,
    service: StudioService = Depends(_studio),
) -> ArtifactOut:
    return service.rename(notebook_id, artifact_id, payload)


@router.delete("/{notebook_id}/studio/{artifact_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_artifact(
    notebook_id: int, artifact_id: int, service: StudioService = Depends(_studio)
) -> Response:
    service.delete(notebook_id, artifact_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{notebook_id}/studio/{artifact_id}/note",
    response_model=NoteOut,
    status_code=status.HTTP_201_CREATED,
)
def save_artifact_as_note(
    notebook_id: int, artifact_id: int, service: StudioService = Depends(_studio)
) -> NoteOut:
    return service.save_as_note(notebook_id, artifact_id)


@router.get("/{notebook_id}/studio/{artifact_id}/export.{fmt}")
def export_artifact(
    notebook_id: int,
    artifact_id: int,
    fmt: Literal["docx", "csv", "xlsx", "svg"],
    service: StudioService = Depends(_studio),
) -> Response:
    """The artifact as a file, with the limitation notice inside. An SVG is
    served as an attachment under ``default-src 'none'``, like the HTML report:
    a layer independent of the escaping."""
    exported = service.export(notebook_id, artifact_id, fmt)
    return Response(
        content=exported.body,
        media_type=exported.media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{exported.filename}"',
            "Content-Security-Policy": "default-src 'none'",
            "X-Content-Type-Options": "nosniff",
        },
    )
