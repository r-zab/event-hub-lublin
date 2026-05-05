"""
Router: EventTypes — słownik typów zdarzeń (T2.1).

GET (publiczny) zwraca listę aktywnych typów do dropdownów.
POST/PATCH/DELETE wymagają roli admin.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_admin, get_db
from app.models.event import Event
from app.models.event_type import EventType
from app.models.user import User
from app.schemas.event_type import EventTypeCreate, EventTypeResponse, EventTypeUpdate

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("", response_model=list[EventTypeResponse], summary="Lista typów zdarzeń")
async def list_event_types(
    only_active: bool = True,
    db: AsyncSession = Depends(get_db),
) -> list[EventTypeResponse]:
    """Zwróć typy zdarzeń (domyślnie tylko aktywne). Endpoint publiczny."""
    stmt = select(EventType)
    if only_active:
        stmt = stmt.where(EventType.is_active.is_(True))
    stmt = stmt.order_by(EventType.sort_order, EventType.name_pl)
    result = await db.execute(stmt)
    types = result.scalars().all()
    return [EventTypeResponse.model_validate(t) for t in types]


@router.post(
    "",
    response_model=EventTypeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Dodaj typ zdarzenia (admin)",
)
async def create_event_type(
    body: EventTypeCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> EventTypeResponse:
    """Utwórz nowy typ zdarzenia. Wymaga roli admin."""
    existing = await db.execute(select(EventType).where(EventType.code == body.code))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Typ zdarzenia o kodzie '{body.code}' już istnieje.",
        )

    et = EventType(
        code=body.code,
        name_pl=body.name_pl,
        default_color_rgb=body.default_color_rgb,
        icon_key=body.icon_key,
        is_active=body.is_active,
        sort_order=body.sort_order,
    )
    db.add(et)
    await db.commit()
    await db.refresh(et)
    logger.info("Admin id=%d utworzył typ zdarzenia %r", current_admin.id, et.code)
    return EventTypeResponse.model_validate(et)


@router.patch(
    "/{type_id}",
    response_model=EventTypeResponse,
    summary="Aktualizuj typ zdarzenia (admin)",
)
async def update_event_type(
    type_id: int,
    body: EventTypeUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> EventTypeResponse:
    """Aktualizuj nazwę/kolor/sort_order/is_active typu. Kod jest niemodyfikowalny (FK z events)."""
    result = await db.execute(select(EventType).where(EventType.id == type_id))
    et = result.scalar_one_or_none()
    if et is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Typ zdarzenia nie istnieje.")

    update_data = body.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(et, field, value)
    db.add(et)
    await db.commit()
    await db.refresh(et)
    logger.info(
        "Admin id=%d zaktualizował typ zdarzenia id=%d (%s)",
        current_admin.id, et.id, et.code,
    )
    return EventTypeResponse.model_validate(et)


@router.delete(
    "/{type_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Usuń typ zdarzenia (admin)",
)
async def delete_event_type(
    type_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> None:
    """Usuń typ zdarzenia. Blokowane gdy istnieją zdarzenia używające tego kodu."""
    result = await db.execute(select(EventType).where(EventType.id == type_id))
    et = result.scalar_one_or_none()
    if et is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Typ zdarzenia nie istnieje.")

    used_count_result = await db.execute(
        select(func.count()).select_from(Event).where(Event.event_type == et.code)
    )
    used_count: int = used_count_result.scalar_one()
    if used_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nie można usunąć — istnieje {used_count} zdarzeń używających tego typu. Dezaktywuj zamiast usuwać.",
        )

    await db.delete(et)
    await db.commit()
    logger.info("Admin id=%d usunął typ zdarzenia id=%d (%s)", current_admin.id, type_id, et.code)
