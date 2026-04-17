"""Admin router — endpointy wymagające roli admin.

Prefix: /api/v1/admin
Auth:   Bearer JWT + rola 'admin' (get_current_admin)
"""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_admin
from app.models.event import Event
from app.models.notification import NotificationLog
from app.models.subscriber import Subscriber
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(get_current_admin)])


# ---------------------------------------------------------------------------
# Schematy odpowiedzi (lokalne — nie dublują schemas/)
# ---------------------------------------------------------------------------


class StatsResponse(BaseModel):
    """Statystyki systemu dla panelu admina."""

    total_subscribers: int
    active_events: int
    notifications_sent: int


class AdminAddressItem(BaseModel):
    """Uproszczony adres w widoku admina."""

    id: int
    street_name: str
    house_number: str
    flat_number: str | None

    model_config = {"from_attributes": True}


class AdminSubscriberItem(BaseModel):
    """Uproszczony subskrybent w widoku admina."""

    id: int
    phone: str | None
    email: str | None
    rodo_consent: bool
    night_sms_consent: bool
    notify_by_email: bool
    notify_by_sms: bool
    created_at: datetime
    addresses: list[AdminAddressItem] = []

    model_config = {"from_attributes": True}


class AdminSubscriberList(BaseModel):
    """Paginowana lista subskrybentów."""

    items: list[AdminSubscriberItem]
    total_count: int


class AdminNotificationItem(BaseModel):
    """Wpis logu powiadomień w widoku admina."""

    id: int
    event_id: int | None
    subscriber_id: int | None
    channel: str
    recipient: str
    message_text: str | None
    status: str
    sent_at: datetime
    error_message: str | None

    model_config = {"from_attributes": True}


class AdminNotificationList(BaseModel):
    """Paginowana lista powiadomień."""

    items: list[AdminNotificationItem]
    total_count: int


# ---------------------------------------------------------------------------
# Endpointy
# ---------------------------------------------------------------------------


@router.get("/stats", response_model=StatsResponse)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> StatsResponse:
    """Zwraca podstawowe statystyki systemu.

    - total_subscribers: liczba wszystkich zarejestrowanych subskrybentów
    - active_events: liczba zdarzeń ze statusem 'zgloszona' lub 'w_naprawie'
    - notifications_sent: liczba wpisów w notification_log ze statusem 'sent'
    """
    total_subscribers_result = await db.execute(select(func.count()).select_from(Subscriber))
    total_subscribers: int = total_subscribers_result.scalar_one()

    active_events_result = await db.execute(
        select(func.count())
        .select_from(Event)
        .where(or_(Event.status == "zgloszona", Event.status == "w_naprawie"))
    )
    active_events: int = active_events_result.scalar_one()

    notifications_sent_result = await db.execute(
        select(func.count())
        .select_from(NotificationLog)
        .where(NotificationLog.status == "sent")
    )
    notifications_sent: int = notifications_sent_result.scalar_one()

    logger.debug(
        "Admin stats: subscribers=%d active_events=%d notifications_sent=%d",
        total_subscribers,
        active_events,
        notifications_sent,
    )

    return StatsResponse(
        total_subscribers=total_subscribers,
        active_events=active_events,
        notifications_sent=notifications_sent,
    )


@router.get("/subscribers", response_model=AdminSubscriberList)
async def list_subscribers(
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> AdminSubscriberList:
    """Zwraca paginowaną listę subskrybentów (posortowanych od najnowszych).

    Query params:
    - skip: offset (domyślnie 0)
    - limit: maks. liczba rekordów (domyślnie 20)
    """
    total_result = await db.execute(select(func.count()).select_from(Subscriber))
    total_count: int = total_result.scalar_one()

    subscribers_result = await db.execute(
        select(Subscriber)
        .options(selectinload(Subscriber.addresses))
        .order_by(Subscriber.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    subscribers = list(subscribers_result.scalars().all())

    items = [AdminSubscriberItem.model_validate(s) for s in subscribers]
    return AdminSubscriberList(items=items, total_count=total_count)


@router.get("/notifications", response_model=AdminNotificationList)
async def list_notifications(
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> AdminNotificationList:
    """Zwraca paginowany log powiadomień (posortowanych malejąco po sent_at).

    Query params:
    - skip: offset (domyślnie 0)
    - limit: maks. liczba rekordów (domyślnie 20)
    """
    total_result = await db.execute(select(func.count()).select_from(NotificationLog))
    total_count: int = total_result.scalar_one()

    notifications_result = await db.execute(
        select(NotificationLog)
        .order_by(NotificationLog.sent_at.desc())
        .offset(skip)
        .limit(limit)
    )
    notifications = list(notifications_result.scalars().all())

    items = [AdminNotificationItem.model_validate(n) for n in notifications]
    return AdminNotificationList(items=items, total_count=total_count)
