"""
Router: Streets — autocomplete ulic TERYT.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.street import Street
from app.schemas.street import StreetResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/", response_model=list[StreetResponse], summary="Autocomplete ulic")
async def search_streets(
    q: Annotated[str, Query(min_length=3, description="Szukana fraza (min. 3 znaki)")],
    limit: Annotated[int, Query(ge=1, le=50, description="Liczba wyników (max 50)")] = 10,
    db: AsyncSession = Depends(get_db),
) -> list[StreetResponse]:
    """Wyszukaj ulice po nazwie (autocomplete). Endpoint publiczny."""
    result = await db.execute(
        select(Street).where(Street.full_name.ilike(f"%{q}%")).limit(limit)
    )
    streets = result.scalars().all()
    logger.debug("Autocomplete '%s' → %d wynikow", q, len(streets))
    return streets
