"""
Router: Streets — autocomplete ulic TERYT + obrysy budynków + zarządzanie ulicami.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_dispatcher_or_admin, get_db
from app.limiter import limiter
from app.models.audit import StreetAuditLog
from app.models.building import Building
from app.models.street import Street
from app.models.user import User
from app.schemas.building import BuildingResponse
from app.schemas.street import StreetCreate, StreetResponse, StreetUpdate

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


@router.post(
    "",
    response_model=StreetResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Utwórz ulicę (dyspozytor/admin)",
)
async def create_street(
    data: StreetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_dispatcher_or_admin),
) -> StreetResponse:
    """Dodaje nową ulicę do rejestru. Wymaga roli dispatcher lub admin."""
    full_name = f"{data.street_type} {data.name}".strip() if data.street_type else data.name
    street = Street(
        name=data.name,
        full_name=full_name,
        street_type=data.street_type,
        city=data.city,
    )
    db.add(street)
    await db.commit()
    await db.refresh(street)

    audit = StreetAuditLog(
        user_id=current_user.id,
        street_id=street.id,
        action="create",
        old_data=None,
        new_data={"name": street.name, "street_type": street.street_type, "city": street.city},
    )
    db.add(audit)
    await db.commit()

    logger.info(
        "Ulica id=%d %r utworzona przez user=%d (rola=%s)",
        street.id, street.full_name, current_user.id, current_user.role,
    )
    return street


@router.put(
    "/{street_id}",
    response_model=StreetResponse,
    summary="Aktualizuj ulicę (dyspozytor/admin)",
)
async def update_street(
    street_id: int,
    data: StreetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_dispatcher_or_admin),
) -> StreetResponse:
    """Aktualizuje dane ulicy. Wymaga roli dispatcher lub admin."""
    result = await db.execute(select(Street).where(Street.id == street_id))
    street = result.scalar_one_or_none()
    if street is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ulica nie istnieje")

    old_data = {"name": street.name, "street_type": street.street_type, "city": street.city}

    update_fields = data.model_dump(exclude_none=True)
    for field, value in update_fields.items():
        setattr(street, field, value)

    # Odbuduj full_name po zmianie nazwy lub typu
    street.full_name = (
        f"{street.street_type} {street.name}".strip() if street.street_type else street.name
    )

    db.add(street)
    await db.commit()
    await db.refresh(street)

    audit = StreetAuditLog(
        user_id=current_user.id,
        street_id=street.id,
        action="update",
        old_data=old_data,
        new_data={"name": street.name, "street_type": street.street_type, "city": street.city},
    )
    db.add(audit)
    await db.commit()

    logger.info(
        "Ulica id=%d %r zaktualizowana przez user=%d (rola=%s)",
        street.id, street.full_name, current_user.id, current_user.role,
    )
    return street
