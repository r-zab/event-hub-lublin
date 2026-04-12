"""
Router: Subscribers — rejestracja i wyrejestrowanie subskrybentów powiadomień.
"""

import asyncio
import logging
import re
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_db
from app.limiter import limiter
from app.models.street import Street
from app.models.subscriber import Subscriber, SubscriberAddress
from app.schemas.subscriber import SubscriberCreate, SubscriberResponse
from app.services.notification_service import notify_new_subscriber_about_active_events

logger = logging.getLogger(__name__)

router = APIRouter()

# Prefiksy usuwane przy normalizacji nazwy ulicy przed wyszukiwaniem w kolumnie name
_PREFIX_RE = re.compile(
    r"^(ul\.|al\.|pl\.|aleja|ulica|plac|os\.|osiedle|rondo|skwer|promenada|bulwar)\s+",
    re.IGNORECASE,
)


def _normalize_street_name(raw: str) -> str:
    """
    Iteracyjnie usuwa prefiksy typu 'ul.', 'al.', 'Ulica' itp.

    Przykłady:
      'ul. Lipowa'        → 'Lipowa'
      'Ulica Lipowa'      → 'Lipowa'
      'ul. Ulica Lipowa'  → 'Lipowa'
    """
    name = raw.strip()
    prev: str | None = None
    while name != prev:
        prev = name
        name = _PREFIX_RE.sub("", name).strip()
    return name


async def _resolve_street_id(db: AsyncSession, street_name: str) -> int | None:
    """
    Wyszukaj street_id na podstawie nazwy ulicy wpisanej przez użytkownika.

    Strategia (od najbardziej do najmniej precyzyjnej):
    1. full_name ILIKE raw            → 'Ulica Lipowa'
    2. full_name ILIKE once_stripped  → 'Ulica Lipowa' (gdy raw = 'ul. Ulica Lipowa')
    3. name ILIKE fully_normalized    → 'Lipowa'
    """
    raw = street_name.strip()
    once_stripped = _PREFIX_RE.sub("", raw).strip()
    fully_normalized = _normalize_street_name(raw)

    result = await db.execute(
        select(Street)
        .where(
            or_(
                Street.full_name.ilike(raw),
                Street.full_name.ilike(once_stripped),
                Street.name.ilike(fully_normalized),
            )
        )
        .limit(1)
    )
    street = result.scalar_one_or_none()
    if street is not None:
        logger.debug(
            "Fallback TERYT: '%s' → street_id=%d (name=%r, full_name=%r)",
            raw,
            street.id,
            street.name,
            street.full_name,
        )
        return street.id

    logger.warning(
        "Fallback TERYT: nie znaleziono ulicy dla '%s' — street_id pozostaje NULL",
        raw,
    )
    return None


@router.post(
    "",
    response_model=SubscriberResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Zarejestruj subskrybenta",
)
@limiter.limit("3/minute")
async def register_subscriber(
    request: Request,
    data: SubscriberCreate,
    db: AsyncSession = Depends(get_db),
) -> SubscriberResponse:
    """
    Zarejestruj nowego subskrybenta wraz z listą adresów.

    Wymaga zgody RODO (`rodo_consent=true`). Generuje unikalny token
    wyrejestrowania (`unsubscribe_token`). Endpoint publiczny.
    """
    # Sprawdź unikalność e-maila i telefonu przed INSERT
    duplicate = await db.execute(
        select(Subscriber).where(
            or_(
                Subscriber.email == str(data.email),
                Subscriber.phone == data.phone,
            )
        ).limit(1)
    )
    if duplicate.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ten e-mail lub numer telefonu jest już zarejestrowany.",
        )

    unsubscribe_token = secrets.token_hex(32)

    subscriber = Subscriber(
        phone=data.phone,
        email=str(data.email),
        rodo_consent=data.rodo_consent,
        night_sms_consent=data.night_sms_consent,
        notify_by_email=data.notify_by_email,
        notify_by_sms=data.notify_by_sms,
        unsubscribe_token=unsubscribe_token,
    )
    db.add(subscriber)
    await db.flush()  # uzyskaj subscriber.id przed dodaniem adresów

    for addr in data.addresses:
        # Użyj street_id z requesta lub szukaj fallbackiem po nazwie
        if addr.street_id is not None:
            resolved_street_id: int | None = addr.street_id
        else:
            resolved_street_id = await _resolve_street_id(db, addr.street_name)

        db.add(
            SubscriberAddress(
                subscriber_id=subscriber.id,
                street_id=resolved_street_id,
                street_name=addr.street_name,
                house_number=addr.house_number,
                flat_number=addr.flat_number,
            )
        )

    await db.commit()
    await db.refresh(subscriber)

    result = await db.execute(
        select(Subscriber)
        .options(selectinload(Subscriber.addresses))
        .where(Subscriber.id == subscriber.id)
    )
    subscriber = result.scalar_one()

    asyncio.create_task(notify_new_subscriber_about_active_events(subscriber.id))

    logger.info(
        "Zarejestrowano subskrybenta id=%d email=%r adresy=%d",
        subscriber.id,
        subscriber.email,
        len(subscriber.addresses),
    )
    return subscriber


@router.get(
    "/{unsubscribe_token}",
    response_model=SubscriberResponse,
    summary="Informacje o subskrybencie",
)
async def get_subscriber(
    unsubscribe_token: str,
    db: AsyncSession = Depends(get_db),
) -> SubscriberResponse:
    """
    Pobierz dane subskrybenta na podstawie tokenu wyrejestrowania.
    Służy do podglądu danych przed usunięciem konta. Endpoint publiczny.
    """
    result = await db.execute(
        select(Subscriber)
        .options(selectinload(Subscriber.addresses))
        .where(Subscriber.unsubscribe_token == unsubscribe_token)
    )
    subscriber = result.scalar_one_or_none()
    if subscriber is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subskrybent nie istnieje lub token jest nieprawidłowy.",
        )
    return subscriber


@router.delete(
    "/{unsubscribe_token}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Wyrejestruj subskrybenta (RODO — fizyczne usunięcie)",
)
async def delete_subscriber(
    unsubscribe_token: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Fizycznie usuń subskrybenta i wszystkie jego adresy z bazy danych.

    Wymóg RODO — brak soft delete. Adresy usuwane automatycznie
    przez `ON DELETE CASCADE`. Endpoint publiczny (token jako autoryzacja).
    """
    result = await db.execute(
        select(Subscriber).where(Subscriber.unsubscribe_token == unsubscribe_token)
    )
    subscriber = result.scalar_one_or_none()
    if subscriber is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subskrybent nie istnieje lub token jest nieprawidłowy.",
        )

    await db.delete(subscriber)
    await db.commit()

    logger.info(
        "Fizycznie usunięto subskrybenta id=%d (RODO) — token=%s…",
        subscriber.id,
        unsubscribe_token[:8],
    )
