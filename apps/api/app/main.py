"""FastAPI application entry point.

Creates the app, configures CORS for the local web client, and mounts the API
routers under the ``/api`` prefix.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import settings
from app.routers import health, materials

app = FastAPI(
    title=settings.app_name,
    version=__version__,
    description="API determinística de apoio à seleção de materiais (metodologia Ashby).",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(materials.router, prefix="/api")


@app.get("/", tags=["root"])
def root() -> dict[str, str]:
    """Root pointer to the API docs."""
    return {"app": settings.app_name, "docs": "/docs", "health": "/api/health"}
