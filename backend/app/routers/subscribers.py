"""
Router: Subscribers — rejestracja i wyrejestrowanie subskrybentów powiadomień.
"""

import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_db
from app.models.street import Street
from app.models.subscriber import Subscriber, SubscriberAddress
from app.schemas.subscriber import SubscriberCreate, SubscriberResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/",
    response_model=SubscriberResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Zarejestruj subskrybenta",
)
async def register_subscriber(
    data: SubscriberCreate,
    db: AsyncSession = Depends(get_db),
) -> SubscriberResponse:
    """
    Zarejestruj nowego subskrybenta wraz z listą adresów.

    Wymaga zgody RODO (`rodo_consent=true`). Generuje unikalny token
    wyrejestrowania (`unsubscribe_token`). Endpoint publiczny.
    """
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
        resolved_street_id = addr.street_id

        # Fallback: jeśli street_id nie podano, szukaj po nazwie ulicy w bazie TERYT
        if resolved_street_id is None and addr.street_name:
            street_result = await db.execute(
                select(Street).where(Street.name.ilike(addr.street_name.strip()))
            )
            street = street_result.scalar_one_or_none()
            if street is not None:
                resolved_street_id = street.id
                logger.debug(
                    "Fallback street_id: '%s' → id=%d (sub_id=%d)",
                    addr.street_name,
                    street.id,
                    subscriber.id,
                )
            else:
                logger.warning(
                    "Nie znaleziono ulicy '%s' w bazie TERYT dla sub_id=%d — street_id pozostaje NULL",
                    addr.street_name,
                    subscriber.id,
                )

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
