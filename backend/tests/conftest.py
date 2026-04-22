"""Shared fixtures for backend pytest tests."""

import pytest_asyncio
import httpx
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool

from app.main import app
from app.config import settings
from app.dependencies import get_db


@pytest_asyncio.fixture
async def async_client():
    """Async HTTP client pointed at the FastAPI app via ASGI transport.

    Uses NullPool so every request gets a fresh DB connection — avoids
    asyncpg connection-pool / event-loop conflicts across tests on Windows.
    """
    test_engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    TestSession = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with TestSession() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client

    app.dependency_overrides.clear()
    await test_engine.dispose()
