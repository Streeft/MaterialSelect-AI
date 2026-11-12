"""Health-check endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import __version__
from app.config import settings
from app.db.base import get_db
from app.knowledge.embeddings import EmbeddingClient
from app.schemas.common import DatabaseHealthResponse, HealthResponse
from app.services.health_service import HealthService

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Liveness: settings only, never the database (Fly probes it; D-223)."""
    embeddings = EmbeddingClient(settings)
    embedding_model = embeddings.model if embeddings.configured else None
    return HealthResponse(
        status="ok",
        app_name=settings.app_name,
        version=__version__,
        environment=settings.environment,
        access_mode=settings.access_mode,
        ai_provider=settings.ai_provider,
        # The simulated provider has no model; naming the default would claim one.
        ai_model=None if settings.ai_provider == "mock" else settings.ai_model,
        # Settings only — never the endpoint (a gateway path can carry a token).
        knowledge_embedding_model=embedding_model,
        knowledge_embedding_dimensions=(
            embeddings.dimensions if embedding_model and embeddings.dimensions > 0 else None
        ),
    )


@router.get("/health/db", response_model=DatabaseHealthResponse)
def health_db(db: Session = Depends(get_db)) -> DatabaseHealthResponse:
    """Deep check: one ``SELECT 1``. 503 in Portuguese when it fails (D-223)."""
    return HealthService(db).database()
