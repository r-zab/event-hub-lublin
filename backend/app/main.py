"""
Event Hub Lublin - FastAPI Application
System powiadamiania mieszkancow o awariach sieci wodociagowej.
"""

import logging
import logging.config
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.limiter import limiter
from app.routers import admin, auth, events, streets, subscribers
from app.services.notification_service import process_morning_queue

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
    scheduler.start()
    logger.info("Uruchamianie %s v%s", settings.APP_NAME, settings.APP_VERSION)
    logger.info("APScheduler uruchomiony — poranna kolejka SMS o 06:00 Europe/Warsaw")
    yield
    scheduler.shutdown(wait=False)
    logger.info("Zatrzymywanie %s", settings.APP_NAME)


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Event Hub Lublin - System powiadamiania mieszkancow MPWiK Lublin.",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_cors_parts = settings.CORS_ORIGINS.split(",") if settings.CORS_ORIGINS else []
_cors_origins = [o.strip() for o in _cors_parts if o.strip()] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
app.include_router(events.router, prefix="/api/v1/events", tags=["Events"])
app.include_router(subscribers.router, prefix="/api/v1/subscribers", tags=["Subscribers"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])
