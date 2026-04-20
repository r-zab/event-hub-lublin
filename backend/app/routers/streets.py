"""
Router: Streets — autocomplete ulic TERYT + obrysy budynków.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.limiter import limiter
from app.models.building import Building
from app.models.street import Street
from app.schemas.building import BuildingResponse
from app.schemas.street import StreetResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("", response_model=list[StreetResponse], summary="Autocomplete ulic")
@limiter.limit("30/minute")
async def search_streets(
    request: Request,
    q: Annotated[str, Query(min_length=3, description="Szukana fraza (min. 3 znaki)")],
    limit: Annotated[int, Query(ge=1, le=50, description="Liczba wyników (max 50)")] = 10,
    db: AsyncSession = Depends(get_db),
) -> list[StreetResponse]:
    """Wyszukaj ulice po nazwie (autocomplete). Endpoint publiczny."""
    q_escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    result = await db.execute(
        select(Street).where(Street.full_name.ilike(f"%{q_escaped}%", escape="\\")).limit(limit)
    )
    streets = result.scalars().all()
    logger.debug("Autocomplete '%s' → %d wynikow", q, len(streets))
    return streets


@router.get(
    "/{street_id}/buildings",
    response_model=list[BuildingResponse],
    summary="Obrysy budynków dla ulicy",
)
async def get_buildings_for_street(
    street_id: int,
    db: AsyncSession = Depends(get_db),
) -> list[BuildingResponse]:
    """Zwróć listę budynków z obrysami GeoJSON dla danej ulicy. Endpoint publiczny."""
    result = await db.execute(
        select(Building)
        .where(Building.street_id == street_id)
        .order_by(Building.house_number)
    )
    buildings = result.scalars().all()
    logger.debug("Budynki dla street_id=%d → %d wynikow", street_id, len(buildings))
    return buildings
