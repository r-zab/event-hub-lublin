"""
Event Hub Lublin - FastAPI Application
System powiadamiania mieszkancow o awariach sieci wodociagowej.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, events, streets, subscribers


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup and shutdown events.
    print(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    yield
    print("Shutting down...")


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
    allow_origins=settings.CORS_ORIGINS.split(","),
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
