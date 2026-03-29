"""
Router: Events — CRUD dla zdarzeń (awarie, wyłączenia, remonty).
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_current_user, get_db
from app.models.event import Event, EventHistory
from app.models.user import User
from app.schemas.event import EventCreate, EventResponse, EventUpdate

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/", response_model=list[EventResponse], summary="Lista aktywnych zdarzeń")
async def list_events(
    skip: Annotated[int, Query(ge=0, description="Pominięte rekordy")] = 0,
    limit: Annotated[int, Query(ge=1, le=100, description="Liczba wyników (max 100)")] = 20,
    db: AsyncSession = Depends(get_db),
) -> list[EventResponse]:
    """Zwróć listę aktywnych zdarzeń (status != 'usunieta'). Endpoint publiczny."""
    result = await db.execute(
        select(Event)
        .options(selectinload(Event.history))
        .where(Event.status != "usunieta")
        .order_by(Event.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    events = result.scalars().all()
    logger.debug("Lista zdarzeń: skip=%d limit=%d → %d wyników", skip, limit, len(events))
    return events


@router.get("/{event_id}", response_model=EventResponse, summary="Szczegóły zdarzenia")
async def get_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    """Pobierz szczegóły konkretnego zdarzenia. Endpoint publiczny."""
    result = await db.execute(
        select(Event)
        .options(selectinload(Event.history))
        .where(Event.id == event_id)
    )
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zdarzenie nie istnieje")
    return event


@router.post("/", response_model=EventResponse, status_code=status.HTTP_201_CREATED, summary="Utwórz zdarzenie")
async def create_event(
    data: EventCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EventResponse:
    """Utwórz nowe zdarzenie. Wymaga JWT."""
    event = Event(**data.model_dump(), created_by=current_user.id)
    db.add(event)
    await db.commit()
    await db.refresh(event)
    # Załaduj relację history (pusta przy tworzeniu)
    await db.execute(select(Event).options(selectinload(Event.history)).where(Event.id == event.id))
    logger.info("Utworzono zdarzenie id=%d typ=%r przez user=%d", event.id, event.event_type, current_user.id)
    # TODO(rafal): notification_engine.notify()
    return event


@router.put("/{event_id}", response_model=EventResponse, summary="Aktualizuj zdarzenie")
async def update_event(
    event_id: int,
    data: EventUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EventResponse:
    """Aktualizuj zdarzenie. Przy zmianie statusu zapisuje wpis do event_history. Wymaga JWT."""
    result = await db.execute(
        select(Event)
        .options(selectinload(Event.history))
        .where(Event.id == event_id)
    )
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zdarzenie nie istnieje")

    update_data = data.model_dump(exclude_none=True)

    if "status" in update_data and update_data["status"] != event.status:
        history_entry = EventHistory(
            event_id=event.id,
            old_status=event.status,
            new_status=update_data["status"],
            changed_by=current_user.id,
        )
        db.add(history_entry)
        logger.info(
            "Zmiana statusu zdarzenia id=%d: %r → %r przez user=%d",
            event.id,
            event.status,
            update_data["status"],
            current_user.id,
        )

    for field, value in update_data.items():
        setattr(event, field, value)

    db.add(event)
    await db.commit()
    await db.refresh(event)
    # Odśwież relację history po ewentualnym dodaniu wpisu
    result = await db.execute(
        select(Event).options(selectinload(Event.history)).where(Event.id == event.id)
    )
    event = result.scalar_one()
    # TODO(rafal): notification_engine.notify()
    return event
