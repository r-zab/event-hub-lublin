"""Buildings router — endpoints do pobierania i aktualizacji budynków.

Prefix: /api/v1/buildings
Auth:
  GET         — publiczny (brak tokenu)
  PATCH/DELETE — Bearer JWT + rola 'admin'
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from geoalchemy2.functions import ST_Intersects, ST_MakeEnvelope

from app.database import get_db
from app.dependencies import get_current_admin
from app.models.audit import BuildingAuditLog
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
    summary="Aktualizuj adres budynku (admin)",
)
async def update_building_address(
    building_id: int,
    data: BuildingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> BuildingBboxResponse:
    """Ręcznie przypisuje lub poprawia adres budynku. Wymaga roli admin."""
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

    old_data = {
        "street_id": building.street_id,
        "street_name": building.street_name,
        "house_number": building.house_number,
    }

    for field, value in update_data.items():
        setattr(building, field, value)

    new_data = {
        "street_id": building.street_id,
        "street_name": building.street_name,
        "house_number": building.house_number,
    }

    audit = BuildingAuditLog(
        user_id=current_user.id,
        building_id=building_id,
        action="update",
        old_data=old_data,
        new_data=new_data,
    )
    db.add(building)
    db.add(audit)
    await db.commit()
    await db.refresh(building)

    logger.info(
        "Admin id=%d zaktualizował adres budynku id=%d: %s → %s",
        current_user.id, building_id, old_data, new_data,
    )
    return BuildingBboxResponse.model_validate(building)


@router.delete(
    "/{building_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Usuń adres budynku (admin)",
)
async def delete_building_address(
    building_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> None:
    """Usuwa dane adresowe z budynku (street_id, street_name, house_number → NULL).

    Nie usuwa rekordu budynku z bazy — zachowuje geometrię GIS.
    Operacja jest rejestrowana w tabeli audytowej.
    """
    result = await db.execute(select(Building).where(Building.id == building_id))
    building = result.scalar_one_or_none()
    if building is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budynek nie istnieje",
        )

    old_data = {
        "street_id": building.street_id,
        "street_name": building.street_name,
        "house_number": building.house_number,
    }

    building.street_id = None
    building.street_name = None
    building.house_number = None

    audit = BuildingAuditLog(
        user_id=current_user.id,
        building_id=building_id,
        action="delete",
        old_data=old_data,
        new_data=None,
    )
    db.add(building)
    db.add(audit)
    await db.commit()

    logger.info(
        "Admin id=%d usunął adres budynku id=%d (było: %s)",
        current_user.id, building_id, old_data,
    )
