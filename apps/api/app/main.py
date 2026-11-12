"""FastAPI application entry point.

Creates the app, configures CORS for the local web client, mounts the API
routers under ``/api``, and maps domain errors to HTTP status codes.
"""

from __future__ import annotations

import logging
import math
from typing import Any

from fastapi import Depends, FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exception_handlers import http_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import __version__
from app.ai.provider import AIUnavailableError
from app.config import settings
from app.dependencies import require_active_subscription
from app.domain.display_units import DisplayUnitError
from app.domain.errors import (
    AuthenticationError,
    CatalogReadOnlyError,
    ConflictError,
    ExportRefusedError,
    NotFoundError,
    QuotaExceededError,
    ServiceUnavailableError,
    SubscriptionRequiredError,
    ValidationError,
)
from app.routers import (
    ai,
    audit,
    auth,
    battery,
    billing,
    catalog,
    charts,
    classes,
    curves,
    dashboard,
    defaults,
    eco,
    equivalences,
    exports,
    expressions,
    family_notes,
    glossary,
    health,
    imports,
    knowledge,
    materials,
    my_records,
    notebooks,
    part_cost,
    processes,
    properties,
    saved_charts,
    saved_views,
    search,
    selection,
    solver,
    sources,
    synthesis,
)


def _configure_logging() -> None:
    """Send the app's own log lines to stdout, which is what `fly logs` shows.

    Without a handler on the root logger an ``app.*`` logger reached only
    Python's last-resort stream, without time or level (D-198). ``basicConfig``
    does nothing when a handler is already set (uvicorn's or pytest's).
    httpx stays at WARNING: at INFO it logs full request URLs (D-97).
    """
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    for name in ("httpx", "httpcore"):
        logging.getLogger(name).setLevel(logging.WARNING)


_configure_logging()
logger = logging.getLogger("app")

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


UNKNOWN_ROUTE_MESSAGE = (
    "Endereço não encontrado na API: {path}. Se a interface acabou de ganhar este "
    "recurso, a API em produção pode ainda não ter sido implantada com ele."
)


@app.exception_handler(StarletteHTTPException)
async def _handle_http_exception(request: Request, exc: StarletteHTTPException) -> Response:
    """A path no route matches answers in pt-BR, never Starlette's bare "Not Found".

    The router raises a 404 whose detail is the literal "Not Found"; that body
    is what a user saw when the web app linked to an export the deployed API
    did not have yet (D-125). Every other HTTPException keeps its own detail.
    """
    if exc.status_code == 404 and exc.detail == "Not Found":
        return _error_response(404, UNKNOWN_ROUTE_MESSAGE.format(path=request.url.path))
    return await http_exception_handler(request, exc)


@app.exception_handler(ValidationError)
async def _handle_validation(_: Request, exc: ValidationError) -> JSONResponse:
    return _error_response(400, str(exc))


@app.exception_handler(DisplayUnitError)
async def _handle_display_unit(_: Request, exc: DisplayUnitError) -> JSONResponse:
    """Unidade de leitura inválida é 400, e não 500 (D-70).

    Ela chega pela URL, então é entrada do cliente como qualquer outra. Sem este
    tratador seria um 500 de corpo em texto puro — o defeito que o
    `AIUnavailableError` já custou uma vez — e aqui a mensagem importa mais
    ainda, porque ela nomeia as unidades que servem.
    """
    return _error_response(400, str(exc))


@app.exception_handler(ExportRefusedError)
async def _handle_export_refused(_: Request, exc: ExportRefusedError) -> JSONResponse:
    """D-104: a file that would be incomplete is refused, with what is missing."""
    return _error_response(422, str(exc))


@app.exception_handler(ConflictError)
async def _handle_conflict(_: Request, exc: ConflictError) -> JSONResponse:
    return _error_response(409, str(exc))


@app.exception_handler(AuthenticationError)
async def _handle_authentication(_: Request, exc: AuthenticationError) -> JSONResponse:
    return _error_response(401, str(exc))


@app.exception_handler(SubscriptionRequiredError)
async def _handle_subscription_required(_: Request, exc: SubscriptionRequiredError) -> JSONResponse:
    return _error_response(403, str(exc))


@app.exception_handler(CatalogReadOnlyError)
async def _handle_catalog_read_only(_: Request, exc: CatalogReadOnlyError) -> JSONResponse:
    return _error_response(403, str(exc))


@app.exception_handler(QuotaExceededError)
async def _handle_quota_exceeded(_: Request, exc: QuotaExceededError) -> JSONResponse:
    return _error_response(429, str(exc))


@app.exception_handler(ServiceUnavailableError)
async def _handle_service_unavailable(_: Request, exc: ServiceUnavailableError) -> JSONResponse:
    return _error_response(503, str(exc))


@app.exception_handler(AIUnavailableError)
async def _handle_ai_unavailable(_: Request, exc: AIUnavailableError) -> JSONResponse:
    """Um provedor que não respondeu é 503 com a mensagem dele, nunca um 500.

    `AIService._provider` já traduz a falha de *construção* para 400 — a camada
    estar desligada é estado de configuração, não avaria. O que faltava era a
    falha na *chamada*: chave rejeitada, modelo desconhecido, tempo esgotado.
    Sem este tratador ela subia como RuntimeError e virava um 500 de texto puro,
    que o frontend não consegue ler (ele lê `detail` do JSON) — o usuário via
    "Falha na requisição /api/ai/interpret" e perdia justamente a mensagem que
    diz o que corrigir. O provedor se dá ao trabalho de nomear o host e a causa;
    jogar isso fora era o pior desfecho possível.

    O `mock` nunca levanta isso numa chamada, e é por isso que o defeito
    atravessou a suíte inteira sem aparecer. Aqui em vez de nas rotas porque
    qualquer caminho que fale com um provedor precisa da mesma garantia.
    """
    return _error_response(503, str(exc))


@app.exception_handler(IntegrityError)
async def _handle_integrity(_: Request, exc: IntegrityError) -> JSONResponse:
    # Safety net: services pre-check uniqueness, but any constraint violation
    # that slips through (e.g. a race) must surface as a conflict, not a 500.
    # The message is generic on purpose — never leak SQL/driver details.
    return _error_response(409, "Conflito de integridade de dados.")


UNEXPECTED_ERROR_MESSAGE = (
    "Erro interno no servidor. A falha foi registrada no log; tente de novo em instantes."
)


@app.exception_handler(Exception)
async def _handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
    """Last resort: any exception no other handler took (D-198).

    Before this a bug or a dropped database connection answered a plain-text
    "Internal Server Error", which the web app cannot read (it reads `detail`)
    and which left no traceback anywhere the author could see. Now the answer
    is JSON in Portuguese and the traceback goes to the log (`fly logs`). The
    message never carries the exception's text: it may hold SQL or a path.
    """
    logger.error("Erro sem tratamento em %s %s", request.method, request.url.path, exc_info=exc)
    return _error_response(500, UNEXPECTED_ERROR_MESSAGE)


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


# `health`, `auth` e `billing` ficam sem a dependência de bloco: são as únicas
# rotas públicas (health/auth) ou que decidem sua própria regra por rota
# (billing — checkout precisa funcionar sem assinatura, para poder comprar
# uma). Todo outro router exige assinatura ativa, incluindo `audit` e
# `sources`, que chegaram depois deste desenho mas seguem o mesmo princípio:
# tudo fica atrás do portão, exceto o que não pode ficar.
app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(billing.router, prefix="/api")
# `curves` antes de `materials`: mesmo caminho de uma curva, com a unidade do
# parâmetro da família (TM4-e); a primeira rota registrada responde.
app.include_router(
    curves.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    materials.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    classes.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    catalog.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    properties.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    expressions.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    glossary.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    family_notes.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    processes.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    imports.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    imports.templates_router,
    prefix="/api",
    dependencies=[Depends(require_active_subscription)],
)
app.include_router(
    knowledge.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    selection.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    selection.indices_router,
    prefix="/api",
    dependencies=[Depends(require_active_subscription)],
)
app.include_router(
    saved_charts.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    saved_views.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    charts.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    dashboard.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(ai.router, prefix="/api", dependencies=[Depends(require_active_subscription)])
app.include_router(
    exports.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(audit.router, prefix="/api", dependencies=[Depends(require_active_subscription)])
app.include_router(
    my_records.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    sources.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    solver.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    part_cost.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(eco.router, prefix="/api", dependencies=[Depends(require_active_subscription)])
app.include_router(
    synthesis.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    battery.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
# Starting numbers of the calculators (D-216): one answer for cost, eco, battery, solver.
app.include_router(
    defaults.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
# The palette's light search (D-207): id, name, class and kind only, limited per kind.
app.include_router(
    search.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
# Cadernos (D-92): the same gate as every product route, so open access mode
# (D-83) admits a student. A notebook is the student's own, never the shared
# catalogue, so no route here needs `require_catalog_curator`.
app.include_router(
    notebooks.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
# Equivalência declarada entre designações (D-115): leitura para logados,
# escrita só do curador (`require_catalog_curator` no próprio router).
app.include_router(
    equivalences.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)


@app.get("/", tags=["root"])
def root() -> dict[str, str]:
    """Root pointer to the API docs."""
    return {"app": settings.app_name, "docs": "/docs", "health": "/api/health"}
