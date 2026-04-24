"""
System Powiadomień MPWiK Lublin - FastAPI Application
System powiadamiania mieszkancow o awariach sieci wodociagowej.
"""

import logging
import logging.config
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.middleware import TrustedProxyMiddleware

from app.config import settings
from app.limiter import limiter
from app.routers import admin, auth, buildings, events, streets, subscribers
from app.services.notification_service import auto_extend_overdue_events, process_morning_queue

# ---------------------------------------------------------------------------
# Konfiguracja logowania
# ---------------------------------------------------------------------------
_app_level = "DEBUG" if settings.DEBUG else "INFO"
logging.config.dictConfig(
    {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            }
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "default",
                "stream": "ext://sys.stderr",
            }
        },
        "loggers": {
            # Wycisz SQL — tylko błędy bazy będą widoczne
            "sqlalchemy.engine": {"level": "WARNING", "propagate": False},
            "sqlalchemy.pool": {"level": "WARNING", "propagate": False},
            # Uvicorn access — zostaw na INFO, ale bez duplikatów
            "uvicorn.access": {"level": "INFO", "handlers": ["console"], "propagate": False},
            "uvicorn.error": {"level": "INFO", "handlers": ["console"], "propagate": False},
        },
        "root": {
            "level": _app_level,
            "handlers": ["console"],
        },
    }
)

logger = logging.getLogger(__name__)


scheduler = AsyncIOScheduler(timezone="Europe/Warsaw")


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.add_job(
        process_morning_queue,
        trigger="cron",
        hour=6,
        minute=0,
        id="morning_sms_queue",
        replace_existing=True,
    )
    scheduler.add_job(
        auto_extend_overdue_events,
        trigger="interval",
        minutes=1,
        id="auto_extend_overdue_events",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Uruchamianie %s v%s", settings.APP_NAME, settings.APP_VERSION)
    logger.info("Trusted proxies (T1.4): %s", settings.TRUSTED_PROXIES)
    logger.info(
        "APScheduler uruchomiony — poranna kolejka SMS o 06:00, auto-close/extend co 1 min (Europe/Warsaw)"
    )
    yield
    scheduler.shutdown(wait=False)
    logger.info("Zatrzymywanie %s", settings.APP_NAME)


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="System Powiadomień MPWiK Lublin — system powiadamiania mieszkańców o awariach sieci wodociągowej.",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


def _sanitize_for_json(obj: object) -> object:
    """Rekurencyjnie konwertuje nieskojarzalne z JSON obiekty (np. ValueError z ctx Pydantic v2) na string."""
    if isinstance(obj, dict):
        return {k: _sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize_for_json(v) for v in obj]
    if isinstance(obj, Exception):
        return str(obj)
    try:
        import json as _json
        _json.dumps(obj)
        return obj
    except (TypeError, ValueError):
        return str(obj)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Loguj błędy walidacji w czytelnym formacie zamiast surowego obiektu Pydantic."""
    for error in exc.errors():
        loc = " → ".join(str(p) for p in error.get("loc", []) if p != "body")
        msg = error.get("msg", "").removeprefix("Value error, ")
        logger.warning("BŁĄD WALIDACJI: [%s] → %s", loc or "payload", msg)
    safe_errors = _sanitize_for_json(exc.errors())
    return JSONResponse(status_code=422, content={"detail": safe_errors})

_cors_parts = settings.CORS_ORIGINS.split(",") if settings.CORS_ORIGINS else []
_cors_origins = [o.strip() for o in _cors_parts if o.strip()] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Musi być dodany po CORSMiddleware — staje się warstwą zewnętrzną (outermost).
# Przepisuje request.client.host na realny IP z X-Forwarded-For,
# dzięki czemu slowapi rate-limit działa po IP użytkownika, nie IP WAF.
_trusted_proxies = [h.strip() for h in settings.TRUSTED_PROXIES.split(",") if h.strip()]
app.add_middleware(TrustedProxyMiddleware, trusted_hosts=_trusted_proxies)


@app.get("/health", tags=["System"])
async def health_check():
    """Sprawdzenie stanu systemu."""
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }



app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(streets.router, prefix="/api/v1/streets", tags=["Streets"])
app.include_router(buildings.router, prefix="/api/v1/buildings", tags=["Buildings"])
app.include_router(events.router, prefix="/api/v1/events", tags=["Events"])
app.include_router(subscribers.router, prefix="/api/v1/subscribers", tags=["Subscribers"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])
