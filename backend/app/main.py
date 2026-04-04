"""
Event Hub Lublin - FastAPI Application
System powiadamiania mieszkancow o awariach sieci wodociagowej.
"""

import logging
import logging.config
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, events, streets, subscribers

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
            "uvicorn.access": {"level": "INFO", "propagate": False},
            "uvicorn.error": {"level": "INFO", "propagate": False},
        },
        "root": {
            "level": _app_level,
            "handlers": ["console"],
        },
    }
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Uruchamianie %s v%s", settings.APP_NAME, settings.APP_VERSION)
    yield
    logger.info("Zatrzymywanie %s", settings.APP_NAME)


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Event Hub Lublin - System powiadamiania mieszkancow MPWiK Lublin.",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://localhost:5173",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:5173",
    ],
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

# TODO: Include remaining routers as they are implemented
# from app.routers import admin, external
# app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])
# app.include_router(external.router, prefix="/api/v1/external", tags=["External API"])
