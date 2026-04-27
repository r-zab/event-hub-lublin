"""
Router: Events — CRUD dla zdarzeń (awarie, wyłączenia, remonty).
"""

import asyncio
import logging
from asyncio import Task
from typing import Annotated

from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_current_dispatcher_or_admin, get_current_user, get_db
from app.models.event import Event, EventHistory
from app.models.event_type import EventType as EventTypeModel
from app.models.street import Street
from app.models.user import User
from app.schemas.event import EventCreate, EventResponse, EventUpdate, PaginatedEventResponse
from app.services.notification_service import notify_event
from app.ws_manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter()


def _log_task_exception(task: Task) -> None:
    """Callback dla asyncio.Task — loguje nieobsłużony wyjątek zadania powiadomień."""
    if not task.cancelled() and task.exception() is not None:
        logger.error(
            "Nieobsłużony wyjątek w zadaniu powiadomień: %s",
            task.exception(),
            exc_info=task.exception(),
        )


@router.get("", response_model=PaginatedEventResponse, summary="Lista aktywnych zdarzeń")
async def list_events(
    skip: Annotated[int, Query(ge=0, description="Pominięte rekordy")] = 0,
    limit: Annotated[int, Query(ge=1, le=200, description="Liczba wyników (max 200)")] = 20,
    search: str | None = Query(None, description="Szukaj po nazwie ulicy lub opisie"),
    status_filter: str | None = Query(None, description="Filtruj po statusie"),
    type_filter: str | None = Query(None, description="Filtruj po typie zdarzenia"),
    dept_filter: str | None = Query(None, description="Filtruj po dziale (TSK/TSW/TP)"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Zwróć paginowaną listę zdarzeń. Bez status_filter domyślnie wyklucza 'usunieta'."""
    filters = []
    if status_filter and status_filter != "all":
        filters.append(Event.status == status_filter)
    else:
        filters.append(Event.status != "usunieta")
    if search:
        pattern = f"%{search}%"
        filters.append(
            or_(Event.street_name.ilike(pattern), Event.description.ilike(pattern))
        )
    if type_filter and type_filter != "all":
        filters.append(Event.event_type == type_filter)
    if dept_filter and dept_filter != "all":
        filters.append(Event.created_by_department == dept_filter)

    count_result = await db.execute(select(func.count(Event.id)).where(*filters))
    total_count: int = count_result.scalar_one()

    result = await db.execute(
        select(Event)
        .options(selectinload(Event.history), selectinload(Event.street), selectinload(Event.notifications))
        .where(*filters)
        .order_by(Event.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    events = result.scalars().all()
    for event in events:
        event.street_geojson = event.street.geojson if event.street else None
        event.notified_count = len(event.notifications)
    logger.debug("Lista zdarzeń: skip=%d limit=%d total=%d", skip, limit, total_count)
    return {"items": events, "total_count": total_count}


_EVENT_TYPE_LABEL = {
    "awaria": "Awaria",
    "planowane_wylaczenie": "Planowane wyłączenie",
    "remont": "Remont",
}


@router.get("/feed", response_class=PlainTextResponse, summary="Aktywne awarie dla IVR 994")
async def events_feed(db: AsyncSession = Depends(get_db)) -> str:
    """Zwróć aktywne zdarzenia jako czysty tekst czytelny dla syntezatora mowy (IVR 994). Endpoint publiczny."""
    result = await db.execute(
        select(Event)
        .where(Event.status != "usunieta")
        .order_by(Event.created_at.desc())
    )
    events = result.scalars().all()
    if not events:
        return "Aktualnie brak zgłoszonych awarii i planowanych wyłączeń w sieci MPWiK."
    lines: list[str] = []
    for event in events:
        label = _EVENT_TYPE_LABEL.get(event.event_type, "Zdarzenie")
        street = event.street_name or "nieznana ulica"
        if event.estimated_end:
            end_local = event.estimated_end.astimezone(ZoneInfo("Europe/Warsaw"))
            end_str = end_local.strftime("%d.%m.%Y %H:%M")
            lines.append(f"{label}: ulica {street}. Przewidywany czas naprawy: {end_str}.")
        else:
            lines.append(f"{label}: ulica {street}.")
    return "\n".join(lines)


@router.get("/{event_id}", response_model=EventResponse, summary="Szczegóły zdarzenia")
async def get_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    """Pobierz szczegóły konkretnego zdarzenia. Endpoint publiczny."""
    result = await db.execute(
        select(Event)
        .options(selectinload(Event.history), selectinload(Event.street), selectinload(Event.notifications))
        .where(Event.id == event_id)
    )
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zdarzenie nie istnieje")
    event.street_geojson = event.street.geojson if event.street else None
    event.notified_count = len(event.notifications)
    return event


@router.post("", response_model=EventResponse, status_code=status.HTTP_201_CREATED, summary="Utwórz zdarzenie")
async def create_event(
    data: EventCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_dispatcher_or_admin),
) -> EventResponse:
    """Utwórz nowe zdarzenie. Wymaga roli dispatcher lub admin."""
    has_buildings = bool(
        data.geojson_segment
        and isinstance(data.geojson_segment.get("features"), list)
        and data.geojson_segment["features"]
    )
    has_range = bool(data.house_number_from or data.house_number_to)
    if not has_buildings and not has_range:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Zdarzenie musi dotyczyć co najmniej jednego budynku.",
        )
    # T2.1: walidacja kodu typu zdarzenia względem słownika event_types (must be active).
    type_check = await db.execute(
        select(EventTypeModel).where(
            EventTypeModel.code == data.event_type,
            EventTypeModel.is_active.is_(True),
        )
    )
    if type_check.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nieznany lub nieaktywny typ zdarzenia: '{data.event_type}'.",
        )
    dept = data.created_by_department or current_user.department
    event_data = data.model_dump(exclude={"created_by_department"})
    event = Event(**event_data, created_by=current_user.id, created_by_department=dept)
    db.add(event)
    await db.commit()
    await db.refresh(event)
    # Załaduj relacje (puste przy tworzeniu)
    await db.execute(select(Event).options(selectinload(Event.history)).where(Event.id == event.id))
    event.notified_count = 0
    logger.info("Utworzono zdarzenie id=%d typ=%r przez user=%d", event.id, event.event_type, current_user.id)
    await ws_manager.broadcast({"entity": "events", "action": "update"})
    task = asyncio.create_task(notify_event(event.id))
    task.add_done_callback(_log_task_exception)
    return event


@router.delete(
    "/{event_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Usuń zdarzenie (admin)",
)
async def delete_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_dispatcher_or_admin),
) -> None:
    """Fizycznie usuń zdarzenie wraz z historią. Wymaga roli admin lub dispatcher."""
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Zdarzenie nie istnieje",
        )

    # Zapamiętaj stary status, ustaw "usunieta" i commituj — notify_event odczyta zdarzenie
    # z poprawnym statusem z własnej sesji DB.
    old_status: str = event.status
    event.status = "usunieta"
    db.add(event)
    await db.commit()

    # Wyślij powiadomienie zamykające (synchronicznie, zanim zdarzenie zniknie z bazy).
    await notify_event(event_id, old_status=old_status)

    # Fizyczne usunięcie — FK notification_log.event_id ma ON DELETE SET NULL.
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if event is not None:
        await db.delete(event)
        await db.commit()

    logger.info("Usunięto zdarzenie id=%d przez user=%d (admin)", event_id, current_user.id)
    await ws_manager.broadcast({"entity": "events", "action": "update"})


@router.put("/{event_id}", response_model=EventResponse, summary="Aktualizuj zdarzenie")
async def update_event(
    event_id: int,
    data: EventUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_dispatcher_or_admin),
) -> EventResponse:
    """Aktualizuj zdarzenie. Przy zmianie statusu zapisuje wpis do event_history. Wymaga roli dispatcher lub admin."""
    result = await db.execute(
        select(Event)
        .options(selectinload(Event.history), selectinload(Event.street))
        .where(Event.id == event_id)
    )
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zdarzenie nie istnieje")

    update_data = data.model_dump(exclude_none=True)
    old_status: str = event.status
    old_estimated_end = event.estimated_end
    old_description: str | None = event.description

    if "status" in update_data and update_data["status"] != old_status:
        history_entry = EventHistory(
            event_id=event.id,
            old_status=old_status,
            new_status=update_data["status"],
            changed_by=current_user.id,
        )
        db.add(history_entry)
        logger.info(
            "Zmiana statusu zdarzenia id=%d: %r → %r przez user=%d",
            event.id,
            old_status,
            update_data["status"],
            current_user.id,
        )

    for field, value in update_data.items():
        setattr(event, field, value)

    db.add(event)
    await db.commit()
    await db.refresh(event)
    # Odśwież relacje po ewentualnym dodaniu wpisu historii
    result = await db.execute(
        select(Event)
        .options(selectinload(Event.history), selectinload(Event.street), selectinload(Event.notifications))
        .where(Event.id == event.id)
    )
    event = result.scalar_one()
    event.street_geojson = event.street.geojson if event.street else None
    event.notified_count = len(event.notifications)
    status_changed = "status" in update_data and update_data["status"] != old_status
    estimated_end_changed = (
        "estimated_end" in update_data
        and update_data["estimated_end"] != old_estimated_end
    )
    description_changed = (
        "description" in update_data
        and update_data["description"] != old_description
    )
    if status_changed or estimated_end_changed or description_changed:
        task = asyncio.create_task(
            notify_event(
                event.id,
                old_status=old_status,
                old_estimated_end=old_estimated_end,
                old_description=old_description,
            )
        )
        task.add_done_callback(_log_task_exception)
    await ws_manager.broadcast({"entity": "events", "action": "update"})
    return event
