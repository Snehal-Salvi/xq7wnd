"""FastAPI application: routes, dependency wiring, error handling, request logging."""

import logging
import time as perf
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from datetime import date, time
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import Settings, get_settings
from app.elexon import ElexonClient, UpstreamError
from app.schemas import AccuracyReport, DecisionView, HorizonReport, Meta
from app.service import OutOfScopeError, WindDataService

logger = logging.getLogger("app")


def build_service(settings: Settings) -> WindDataService:
    http = httpx.AsyncClient(base_url=settings.elexon_base_url, timeout=settings.elexon_timeout_s)
    client = ElexonClient(
        http, max_retries=settings.elexon_max_retries, chunk_days=settings.elexon_chunk_days
    )
    return WindDataService(client, settings)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logging.basicConfig(
        level=get_settings().log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )
    yield
    service: WindDataService | None = getattr(app.state, "service", None)
    if service is not None:
        await service.aclose()


def get_service(request: Request) -> WindDataService:
    """Created lazily so it also works on serverless runtimes that skip ASGI lifespan events."""
    state = request.app.state
    if getattr(state, "service", None) is None:
        state.service = build_service(get_settings())
    return state.service  # type: ignore[no-any-return]


ServiceDep = Annotated[WindDataService, Depends(get_service)]
GateClosure = Annotated[
    time | None, Query(description="Gate closure, UK local time (HH:MM). Defaults to 09:50.")
]

router = APIRouter(prefix="/api")


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/meta", response_model=Meta)
async def meta(service: ServiceDep, settings: Annotated[Settings, Depends(get_settings)]) -> Meta:
    return Meta(
        decision_dates=service.decision_dates,
        default_gate_closure=settings.default_gate_closure,
        timezone=settings.market_timezone,
    )


@router.get("/decisions/{decision_date}", response_model=DecisionView)
async def decision(
    decision_date: date,
    service: ServiceDep,
    settings: Annotated[Settings, Depends(get_settings)],
    gate_closure: GateClosure = None,
) -> DecisionView:
    """Forecast in force at gate closure on ``decision_date`` for the next (delivery) day."""
    try:
        return await service.decision_view(decision_date, gate_closure or settings.default_gate_closure)
    except OutOfScopeError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/accuracy", response_model=AccuracyReport)
async def accuracy(
    service: ServiceDep,
    settings: Annotated[Settings, Depends(get_settings)],
    gate_closure: GateClosure = None,
) -> AccuracyReport:
    """Back-test of gate-closure forecasts across every decision date in the pilot."""
    return await service.accuracy(gate_closure or settings.default_gate_closure)


@router.get("/accuracy/horizon", response_model=HorizonReport)
async def horizon(
    service: ServiceDep,
    bucket_hours: Annotated[int, Query(ge=1, le=24)] = 3,
) -> HorizonReport:
    """Forecast error as a function of lead time (all published forecasts)."""
    return await service.horizon(bucket_hours)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Wind Forecast Monitor API",
        version="1.0.0",
        description="Day-ahead wind forecast visibility and accuracy for GB power procurement.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET"], allow_headers=["*"]
    )

    @app.middleware("http")
    async def observe(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        started = perf.perf_counter()
        response = await call_next(request)
        elapsed_ms = (perf.perf_counter() - started) * 1000
        response.headers["x-request-id"] = request_id
        response.headers["server-timing"] = f"app;dur={elapsed_ms:.1f}"
        # Historical data: let browsers/CDN cache successful reads.
        if request.method == "GET" and response.status_code == 200 and request.url.path != "/api/health":
            response.headers["cache-control"] = "public, max-age=300, s-maxage=3600"
        logger.info(
            "request id=%s method=%s path=%s status=%d duration_ms=%.1f",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )
        return response

    @app.exception_handler(UpstreamError)
    async def upstream_error(_: Request, exc: UpstreamError) -> JSONResponse:
        logger.error("upstream failure: %s", exc)
        return JSONResponse(
            status_code=502, content={"detail": "Elexon data source is unavailable, try again shortly."}
        )

    app.include_router(router)
    return app


app = create_app()
