"""FastAPI application entry point.

Creates the app, configures CORS for the local web client, mounts the API
routers under ``/api``, and maps domain errors to HTTP status codes.
"""

from __future__ import annotations

import math
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app import __version__
from app.config import settings
from app.domain.errors import ConflictError, NotFoundError, ValidationError
from app.routers import classes, health, imports, materials, properties

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


# --- Domain-error to HTTP mapping -----------------------------------------
def _error_response(status_code: int, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"detail": message})


@app.exception_handler(NotFoundError)
async def _handle_not_found(_: Request, exc: NotFoundError) -> JSONResponse:
    return _error_response(404, str(exc))


@app.exception_handler(ValidationError)
async def _handle_validation(_: Request, exc: ValidationError) -> JSONResponse:
    return _error_response(400, str(exc))


@app.exception_handler(ConflictError)
async def _handle_conflict(_: Request, exc: ConflictError) -> JSONResponse:
    return _error_response(409, str(exc))


@app.exception_handler(IntegrityError)
async def _handle_integrity(_: Request, exc: IntegrityError) -> JSONResponse:
    # Safety net: services pre-check uniqueness, but any constraint violation
    # that slips through (e.g. a race) must surface as a conflict, not a 500.
    # The message is generic on purpose — never leak SQL/driver details.
    return _error_response(409, "Conflito de integridade de dados.")


def _sanitize_nonfinite(obj: Any) -> Any:
    """Replace non-finite floats with their repr so the payload is JSON-safe."""
    if isinstance(obj, float) and not math.isfinite(obj):
        return repr(obj)
    if isinstance(obj, dict):
        return {k: _sanitize_nonfinite(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize_nonfinite(v) for v in obj]
    return obj


@app.exception_handler(RequestValidationError)
async def _handle_request_validation(_: Request, exc: RequestValidationError) -> JSONResponse:
    # The default handler echoes the offending input back in the 422 body; when
    # that input contains inf/NaN (rejected by allow_inf_nan=False) the response
    # itself fails JSON serialisation and becomes a 500. Sanitise first.
    errors = _sanitize_nonfinite(jsonable_encoder(exc.errors()))
    return JSONResponse(status_code=422, content={"detail": errors})


app.include_router(health.router, prefix="/api")
app.include_router(materials.router, prefix="/api")
app.include_router(classes.router, prefix="/api")
app.include_router(properties.router, prefix="/api")
app.include_router(imports.router, prefix="/api")
app.include_router(imports.templates_router, prefix="/api")


@app.get("/", tags=["root"])
def root() -> dict[str, str]:
    """Root pointer to the API docs."""
    return {"app": settings.app_name, "docs": "/docs", "health": "/api/health"}
