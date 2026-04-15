"""Buildings router — endpoints do pobierania i aktualizacji budynków.

Prefix: /api/v1/buildings
Auth:
  GET  — publiczny (brak tokenu)
  PATCH — Bearer JWT + rola 'dispatcher' lub 'admin'
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from geoalchemy2.functions import ST_Intersects, ST_MakeEnvelope

from app.database import get_db
from app.dependencies import get_current_dispatcher_or_admin
from app.models.building import Building
from app.models.user import User
from app.schemas.building import BuildingBboxResponse, BuildingUpdate

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("", response_model=list[BuildingBboxResponse], summary="Budynki w bbox")
async def get_buildings_in_bbox(
    min_lat: Annotated[float, Query(ge=-90, le=90, description="Południowa granica (latitude)")],
    max_lat: Annotated[float, Query(ge=-90, le=90, description="Północna granica (latitude)")],
    min_lon: Annotated[float, Query(ge=-180, le=180, description="Zachodnia granica (longitude)")],
    max_lon: Annotated[float, Query(ge=-180, le=180, description="Wschodnia granica (longitude)")],
    limit: Annotated[int, Query(ge=1, le=1000, description="Maks. liczba wyników")] = 500,
    db: AsyncSession = Depends(get_db),
) -> list[BuildingBboxResponse]:
    """Zwraca budynki przecinające podany bounding box.

    Zapytanie korzysta z indeksu GIST na kolumnie `geom` — wydajne przy 51k+ rekordach.
    Zwracaj maksymalnie `limit` budynków (domyślnie 500).
    Frontend powinien wywoływać ten endpoint tylko przy zoom >= 15.
    """
    if max_lat <= min_lat:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="max_lat musi być większe od min_lat",
        )
    if max_lon <= min_lon:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="max_lon musi być większe od min_lon",
        )

    stmt = (
        select(Building)
        .where(
            Building.geom.isnot(None),
            ST_Intersects(
                Building.geom,
                ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326),
            ),
        )
        .limit(limit)
    )

    result = await db.execute(stmt)
    buildings = list(result.scalars().all())

    logger.debug(
        "BBOX budynki: bbox=[%f,%f,%f,%f] limit=%d → %d wyników",
        min_lat, max_lat, min_lon, max_lon, limit, len(buildings),
    )
    return [BuildingBboxResponse.model_validate(b) for b in buildings]


@router.patch(
    "/{building_id}",
    response_model=BuildingBboxResponse,
    summary="Aktualizuj adres budynku (dispatcher/admin)",
)
async def update_building_address(
    building_id: int,
    data: BuildingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_dispatcher_or_admin),
) -> BuildingBboxResponse:
    """Ręcznie przypisuje adres do budynku bez adresu.

    Przeznaczone dla dyspozytora, który w panelu mapy klika na poligon
    bez przypisanego adresu i uzupełnia brakujące dane (ulica + numer).
    """
    result = await db.execute(select(Building).where(Building.id == building_id))
    building = result.scalar_one_or_none()
    if building is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budynek nie istnieje",
        )

    update_data = data.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Brak pól do aktualizacji",
        )

    for field, value in update_data.items():
        setattr(building, field, value)

    db.add(building)
    await db.commit()
    await db.refresh(building)

    logger.info(
        "Zaktualizowano adres budynku id=%d przez user=%d (rola=%s): %s",
        building_id,
        current_user.id,
        current_user.role,
        update_data,
    )
    return BuildingBboxResponse.model_validate(building)
