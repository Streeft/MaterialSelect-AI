"""Health-check endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from app import __version__
from app.config import settings
from app.knowledge.embeddings import EmbeddingClient
from app.schemas.common import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Return a simple liveness payload."""
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
