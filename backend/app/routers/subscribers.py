"""
Router: Subscribers — rejestracja i wyrejestrowanie subskrybentów powiadomień.
"""

import asyncio
import hashlib
import json
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import delete, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_db
from app.limiter import limiter
from app.models.building import Building
from app.models.pending_subscriber import PendingSubscriber
from app.models.street import Street
from app.models.subscriber import Subscriber, SubscriberAddress
from app.schemas.subscriber import (
    InitRegistrationResponse,
    SubscriberCreate,
    SubscriberResponse,
    VerifyRegistrationRequest,
)
from app.services.gateways import EmailSender, get_sms_gateway
from app.services.notification_service import (
    notify_new_subscriber_about_active_events,
    send_welcome_with_unsubscribe_token,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# In-memory store for delete verification codes: token → (code, expires_at)
# Nie nadaje się dla deploymentów wieloprocesorowych — wystarczy dla jednego workera.
_delete_codes: dict[str, tuple[str, datetime]] = {}
_DELETE_CODE_TTL = timedelta(minutes=15)

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


def _generate_verification_code() -> str:
    return str(secrets.randbelow(1000000)).zfill(6)


@router.post(
    "/init",
    response_model=InitRegistrationResponse,
    status_code=status.HTTP_200_OK,
    summary="Inicjuj rejestrację — wyślij kod weryfikacyjny SMS/email",
)
@limiter.limit("3/minute")
async def init_registration(
    request: Request,
    data: SubscriberCreate,
    db: AsyncSession = Depends(get_db),
) -> InitRegistrationResponse:
    """
    Krok 1 rejestracji 2FA. Waliduje dane, wysyła 6-cyfrowy kod przez SMS lub e-mail
    i zwraca `pending_id` potrzebny do weryfikacji. Token ważny 24h, max 5 prób.
    """
    # Sprawdź unikalność e-maila i telefonu
    conditions = []
    if data.email is not None:
        conditions.append(Subscriber.email == data.email)
    if data.phone is not None:
        conditions.append(Subscriber.phone == data.phone)

    if conditions:
        duplicate = await db.execute(select(Subscriber).where(or_(*conditions)).limit(1))
        if duplicate.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ten e-mail lub numer telefonu jest już zarejestrowany.",
            )

    # Walidacja wszystkich adresów
    resolved: list[dict] = []
    for addr in data.addresses:
        if addr.street_id is not None:
            resolved_sid: int | None = addr.street_id
        else:
            resolved_sid = await _resolve_street_id(db, addr.street_name)

        if resolved_sid is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Podany adres (ulica lub numer budynku) nie istnieje w oficjalnym spisie MPWiK.",
            )

        bldg_result = await db.execute(
            select(Building)
            .where(
                Building.street_id == resolved_sid,
                Building.house_number.ilike(addr.house_number.strip()),
            )
            .limit(1)
        )
        if bldg_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Podany adres (ulica lub numer budynku) nie istnieje w oficjalnym spisie MPWiK.",
            )

        resolved.append(
            {
                "street_id": resolved_sid,
                "street_name": addr.street_name,
                "house_number": addr.house_number,
                "flat_number": addr.flat_number,
            }
        )

    # Odrzuć zduplikowane adresy (ten sam street_id + house_number)
    seen_addr: set[tuple[int, str]] = set()
    for r in resolved:
        key = (r["street_id"], r["house_number"].strip().upper())
        if key in seen_addr:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Lista adresów zawiera duplikaty — każdy adres może wystąpić tylko raz.",
            )
        seen_addr.add(key)

    # Wyczyść wygasłe wpisy przy okazji
    await db.execute(
        delete(PendingSubscriber).where(PendingSubscriber.expires_at < datetime.now(timezone.utc).replace(tzinfo=None))
    )

    code = _generate_verification_code()
    pending_id = secrets.token_hex(32)
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=24)

    pending = PendingSubscriber(
        pending_id=pending_id,
        verification_code=code,
        attempts=0,
        expires_at=expires_at,
        subscriber_data=json.dumps(
            {
                "phone": data.phone,
                "email": data.email,
                "rodo_consent": data.rodo_consent,
                "night_sms_consent": data.night_sms_consent,
                "notify_by_email": data.notify_by_email,
                "notify_by_sms": data.notify_by_sms,
                "addresses": resolved,
            }
        ),
    )
    db.add(pending)
    await db.commit()

    # Wyślij kod przez SMS (priorytet) lub e-mail
    sms_text = f"MPWiK Lublin: kod weryfikacyjny {code}. Wazny 24h. Nie udostepniaj nikomu."
    email_subject = "[MPWiK Lublin] Kod weryfikacyjny rejestracji"
    email_body = (
        f"Twój kod weryfikacyjny: {code}\n\n"
        "Kod jest ważny 24 godziny (max 5 prób).\n\n"
        "Jeśli to nie Ty składał(a)ś rejestrację, zignoruj tę wiadomość.\n\n"
        "— MPWiK Lublin"
    )

    code_sent = False
    if data.notify_by_sms and data.phone:
        sms_gateway = get_sms_gateway()
        code_sent = await sms_gateway.send(data.phone, sms_text)
        logger.info("init_registration: SMS z kodem do %s…, status=%s", data.phone[:6], "sent" if code_sent else "failed")

    if data.notify_by_email and data.email and not code_sent:
        email_sender = EmailSender()
        code_sent = await email_sender.send(data.email, email_subject, email_body)
        logger.info("init_registration: email z kodem do %s…, status=%s", data.email[:4], "sent" if code_sent else "failed")

    if not code_sent:
        logger.warning("init_registration: nie udało się wysłać kodu weryfikacyjnego (pending_id=%s)", pending_id[:8])

    return InitRegistrationResponse(pending_id=pending_id)


@router.post(
    "/verify",
    response_model=SubscriberResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Zweryfikuj kod i finalizuj rejestrację",
)
@limiter.limit("10/minute")
async def verify_registration(
    request: Request,
    data: VerifyRegistrationRequest,
    db: AsyncSession = Depends(get_db),
) -> SubscriberResponse:
    """
    Krok 2 rejestracji 2FA. Weryfikuje 6-cyfrowy kod i tworzy konto subskrybenta.
    Maksymalnie 5 prób; po wygaśnięciu TTL (24h) wymagana nowa rejestracja.
    """
    result = await db.execute(
        select(PendingSubscriber).where(PendingSubscriber.pending_id == data.pending_id)
    )
    pending = result.scalar_one_or_none()

    if pending is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sesja weryfikacji nie istnieje lub wygasła. Rozpocznij rejestrację od nowa.",
        )

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if pending.expires_at < now:
        await db.delete(pending)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Kod weryfikacyjny wygasł (TTL 24h). Rozpocznij rejestrację od nowa.",
        )

    pending.attempts += 1
    await db.flush()

    if pending.attempts > 5:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Przekroczono limit 5 prób weryfikacji. Rozpocznij rejestrację od nowa.",
        )

    if pending.verification_code != data.code.strip():
        remaining = 5 - pending.attempts
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nieprawidłowy kod weryfikacyjny. Pozostało prób: {remaining}.",
        )

    sub_data = json.loads(pending.subscriber_data)

    # Ostatnia kontrola duplikatów (mogło minąć 24h)
    conditions = []
    if sub_data.get("email"):
        conditions.append(Subscriber.email == sub_data["email"])
    if sub_data.get("phone"):
        conditions.append(Subscriber.phone == sub_data["phone"])
    if conditions:
        dup = await db.execute(select(Subscriber).where(or_(*conditions)).limit(1))
        if dup.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ten e-mail lub numer telefonu jest już zarejestrowany.",
            )

    unsubscribe_token = secrets.token_hex(32)
    subscriber = Subscriber(
        phone=sub_data.get("phone"),
        email=sub_data.get("email"),
        rodo_consent=sub_data["rodo_consent"],
        night_sms_consent=sub_data.get("night_sms_consent", False),
        notify_by_email=sub_data.get("notify_by_email", False),
        notify_by_sms=sub_data.get("notify_by_sms", False),
        unsubscribe_token=unsubscribe_token,
    )
    db.add(subscriber)
    await db.flush()

    for addr in sub_data["addresses"]:
        db.add(
            SubscriberAddress(
                subscriber_id=subscriber.id,
                street_id=addr["street_id"],
                street_name=addr["street_name"],
                house_number=addr["house_number"],
                flat_number=addr.get("flat_number"),
            )
        )

    await db.delete(pending)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Podany adres jest już przypisany do tego konta. Sprawdź formularz i usuń duplikaty.",
        )
    await db.refresh(subscriber)

    result2 = await db.execute(
        select(Subscriber)
        .options(selectinload(Subscriber.addresses))
        .where(Subscriber.id == subscriber.id)
    )
    subscriber = result2.scalar_one()

    asyncio.create_task(send_welcome_with_unsubscribe_token(subscriber.id, unsubscribe_token))
    asyncio.create_task(notify_new_subscriber_about_active_events(subscriber.id))

    email_hash = hashlib.sha256(subscriber.email.encode()).hexdigest()[:12] if subscriber.email else "brak"
    logger.info(
        "verify_registration: zarejestrowano subskrybenta id=%d email_hash=%s adresy=%d",
        subscriber.id,
        email_hash,
        len(subscriber.addresses),
    )
    return subscriber


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
    # Sprawdź unikalność e-maila i telefonu przed INSERT (tylko dla wartości non-NULL)
    conditions = []
    if data.email is not None:
        conditions.append(Subscriber.email == data.email)
    if data.phone is not None:
        conditions.append(Subscriber.phone == data.phone)

    if conditions:
        duplicate = await db.execute(
            select(Subscriber).where(or_(*conditions)).limit(1)
        )
        if duplicate.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ten e-mail lub numer telefonu jest już zarejestrowany.",
            )

    # Faza 1: walidacja wszystkich adresów przed jakimkolwiek zapisem
    resolved: list[tuple[int, object]] = []
    for addr in data.addresses:
        if addr.street_id is not None:
            resolved_sid: int | None = addr.street_id
        else:
            resolved_sid = await _resolve_street_id(db, addr.street_name)

        if resolved_sid is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Podany adres (ulica lub numer budynku) nie istnieje w oficjalnym spisie MPWiK.",
            )

        bldg_result = await db.execute(
            select(Building)
            .where(
                Building.street_id == resolved_sid,
                Building.house_number.ilike(addr.house_number.strip()),
            )
            .limit(1)
        )
        if bldg_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Podany adres (ulica lub numer budynku) nie istnieje w oficjalnym spisie MPWiK.",
            )

        resolved.append((resolved_sid, addr))

    unsubscribe_token = secrets.token_hex(32)

    subscriber = Subscriber(
        phone=data.phone,
        email=data.email,
        rodo_consent=data.rodo_consent,
        night_sms_consent=data.night_sms_consent,
        notify_by_email=data.notify_by_email,
        notify_by_sms=data.notify_by_sms,
        unsubscribe_token=unsubscribe_token,
    )
    db.add(subscriber)
    await db.flush()  # uzyskaj subscriber.id przed dodaniem adresów

    for resolved_street_id, addr in resolved:
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

    asyncio.create_task(send_welcome_with_unsubscribe_token(subscriber.id, unsubscribe_token))
    asyncio.create_task(notify_new_subscriber_about_active_events(subscriber.id))

    email_hash = hashlib.sha256(subscriber.email.encode()).hexdigest()[:12] if subscriber.email else "brak"
    logger.info(
        "Zarejestrowano subskrybenta id=%d email_hash=%s adresy=%d",
        subscriber.id,
        email_hash,
        len(subscriber.addresses),
    )
    return subscriber


@router.post(
    "/{unsubscribe_token}/send-code",
    status_code=status.HTTP_200_OK,
    summary="Wyślij kod 2FA potwierdzający usunięcie konta",
)
@limiter.limit("3/minute")
async def send_delete_code(
    request: Request,
    unsubscribe_token: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Wysyła jednorazowy 6-cyfrowy kod (SMS lub e-mail) wymagany do potwierdzenia
    fizycznego usunięcia konta (RODO). Kod ważny 15 minut.
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

    # Wyczyść ewentualnie stary kod
    _delete_codes.pop(unsubscribe_token, None)
    # Usuń przy okazji wygasłe wpisy innych tokenów
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    expired = [k for k, (_, exp) in _delete_codes.items() if exp < now]
    for k in expired:
        _delete_codes.pop(k, None)

    code = _generate_verification_code()
    _delete_codes[unsubscribe_token] = (code, now + _DELETE_CODE_TTL)

    sms_text = f"MPWiK Lublin: kod usunięcia konta: {code}. Ważny 15 min. Nie udostępniaj nikomu."
    email_subject = "[MPWiK Lublin] Kod potwierdzenia usunięcia konta"
    email_body = (
        f"Twój kod potwierdzający usunięcie konta: {code}\n\n"
        "Kod jest ważny 15 minut.\n\n"
        "Jeśli to nie Ty wysłał(a)ś prośbę o usunięcie, zignoruj tę wiadomość.\n\n"
        "— MPWiK Lublin"
    )

    sent = False
    if subscriber.phone and subscriber.notify_by_sms:
        sms_gateway = get_sms_gateway()
        sent = await sms_gateway.send(subscriber.phone, sms_text)
        logger.info("send_delete_code: SMS do %s…, status=%s", subscriber.phone[:6], "sent" if sent else "failed")

    if not sent and subscriber.email:
        email_sender = EmailSender()
        sent = await email_sender.send(subscriber.email, email_subject, email_body)
        logger.info("send_delete_code: email do %s…, status=%s", subscriber.email[:4], "sent" if sent else "failed")

    if not sent:
        logger.warning("send_delete_code: nie udało się wysłać kodu (token=%s…)", unsubscribe_token[:8])

    channel = "SMS" if (subscriber.phone and subscriber.notify_by_sms) else "e-mail"
    return {"detail": f"Kod weryfikacyjny wysłany przez {channel}."}


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
    code: str | None = Query(default=None, description="Jednorazowy kod 2FA z send-code"),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Fizycznie usuwa subskrybenta. Wymaga wcześniejszego wywołania POST /{token}/send-code
    i podania otrzymanego kodu jako parametru query `code`.

    Wymóg RODO — brak soft delete. Adresy usuwane automatycznie przez ON DELETE CASCADE.
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

    # Weryfikacja kodu 2FA
    stored = _delete_codes.get(unsubscribe_token)
    if stored is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Wymagany kod potwierdzenia. Kliknij 'Wyślij kod potwierdzający' i wprowadź otrzymany kod.",
        )
    stored_code, expires_at = stored
    if datetime.now(timezone.utc).replace(tzinfo=None) > expires_at:
        _delete_codes.pop(unsubscribe_token, None)
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Kod potwierdzenia wygasł. Wyślij nowy kod.",
        )
    if code != stored_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nieprawidłowy kod potwierdzenia.",
        )

    _delete_codes.pop(unsubscribe_token, None)
    await db.delete(subscriber)
    await db.commit()

    logger.info(
        "Fizycznie usunięto subskrybenta id=%d (RODO+2FA) — token=%s…",
        subscriber.id,
        unsubscribe_token[:8],
    )
