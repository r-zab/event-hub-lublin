"""
Notification Service — matchowanie subskrybentów i wysyłka powiadomień.

Algorytm:
1. Znajdź subskrybentów przypisanych do ulicy zdarzenia z rodo_consent=True.
2. Filtruj wg zakresu numerów domów (obsługa alfanumerycznych, np. "10A").
3. Wyślij email (jeśli ENABLE_EMAIL_NOTIFICATIONS=True) i SMS z respektowaniem nocnej ciszy.
4. Zapisz każdą próbę do notification_log.

Kill-switch emaili: zmienna ENABLE_EMAIL_NOTIFICATIONS w .env.
UWAGA: zmiana .env wymaga restartu serwera (settings czytane raz przy starcie).
"""

import logging
import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.event import Event
from app.models.notification import NotificationLog
from app.models.subscriber import Subscriber, SubscriberAddress
from app.services.gateways import EmailSender, get_sms_gateway

logger = logging.getLogger(__name__)

_NIGHT_HOUR_START = 22  # 22:00
_NIGHT_HOUR_END = 6  # 06:00

# Log stanu kill-switcha przy starcie modułu — widoczne w logach serwera
logger.info(
    "[INIT] ENABLE_EMAIL_NOTIFICATIONS=%s | SMS_GATEWAY_TYPE=%s",
    settings.ENABLE_EMAIL_NOTIFICATIONS,
    settings.SMS_GATEWAY_TYPE,
)


# ---------------------------------------------------------------------------
# Helpers — numery domów alfanumeryczne
# ---------------------------------------------------------------------------


def parse_house_number(raw: str) -> tuple[int, str]:
    """
    Podziel numer domu na część numeryczną i literową.

    Przykłady: "10A" → (10, "A"), "14" → (14, ""), "2B" → (2, "B").
    Niestandardowe formaty (np. puste, same litery) zwracają (0, raw.upper()).
    """
    raw = raw.strip().upper()
    match = re.match(r"^(\d+)([A-Z]?)$", raw)
    if match:
        numeric = int(match.group(1))
        letter = match.group(2)
        return numeric, letter
    # Fallback — traktuj jako niestandardowy
    return 0, raw


def is_in_range(house_number: str, from_nr: str | None, to_nr: str | None) -> bool:
    """
    Sprawdź czy numer domu mieści się w zakresie [from_nr, to_nr].

    Obsługuje numery alfanumeryczne (np. "10A"). Brak któregoś z krańców
    zakresu oznacza brak ograniczenia z tej strony.
    """
    if from_nr is None and to_nr is None:
        return True

    num, letter = parse_house_number(house_number)

    if from_nr is not None:
        from_num, from_letter = parse_house_number(from_nr)
        # Porównanie: najpierw numeryczne, przy równości — leksykograficzne liter
        if num < from_num or (num == from_num and letter < from_letter):
            return False

    if to_nr is not None:
        to_num, to_letter = parse_house_number(to_nr)
        if num > to_num or (num == to_num and letter > to_letter):
            return False

    return True


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------


async def match_subscribers(
    db: AsyncSession,
    street_id: int,
    house_number_from: str | None,
    house_number_to: str | None,
) -> list[tuple[Subscriber, SubscriberAddress]]:
    """
    Zwróć listę (Subscriber, SubscriberAddress) spełniających kryteria:
    - adres przypisany do street_id
    - numer domu w zakresie [house_number_from, house_number_to]
    - rodo_consent = True
    """
    result = await db.execute(
        select(SubscriberAddress)
        .options(selectinload(SubscriberAddress.subscriber))
        .where(SubscriberAddress.street_id == street_id)
    )
    addresses: list[SubscriberAddress] = list(result.scalars().all())

    matched: list[tuple[Subscriber, SubscriberAddress]] = []
    for addr in addresses:
        subscriber = addr.subscriber
        if not subscriber or not subscriber.rodo_consent:
            continue
        if is_in_range(addr.house_number, house_number_from, house_number_to):
            matched.append((subscriber, addr))

    logger.debug(
        "Matching street_id=%d zakres=%s-%s → %d subskrybentów",
        street_id,
        house_number_from,
        house_number_to,
        len(matched),
    )
    return matched


# ---------------------------------------------------------------------------
# Treść wiadomości
# ---------------------------------------------------------------------------


def build_sms_message(event: Event) -> str:
    """Zbuduj krótką treść SMS o zdarzeniu."""
    event_type_label = {
        "awaria": "Awaria",
        "planowane_wylaczenie": "Planowane wyłączenie",
        "remont": "Remont",
    }.get(event.event_type, event.event_type.capitalize())

    parts = [f"MPWiK Lublin: {event_type_label} — ul. {event.street_name}"]

    if event.house_number_from or event.house_number_to:
        nr_from = event.house_number_from or "?"
        nr_to = event.house_number_to or "?"
        if nr_from == nr_to:
            parts.append(f"nr {nr_from}")
        else:
            parts.append(f"nr {nr_from}-{nr_to}")

    if event.estimated_end:
        end_str = event.estimated_end.strftime("%d.%m %H:%M")
        parts.append(f"Szacowany czas naprawy: {end_str}")

    parts.append("Przepraszamy za utrudnienia.")
    return ". ".join(parts)


def build_email_subject(event: Event) -> str:
    """Zbuduj temat emaila o zdarzeniu."""
    label = {
        "awaria": "Awaria wody",
        "planowane_wylaczenie": "Planowane wyłączenie wody",
        "remont": "Remont sieci wodociągowej",
    }.get(event.event_type, "Informacja od MPWiK")
    return f"[MPWiK Lublin] {label} — ul. {event.street_name}"


def build_email_body(event: Event) -> str:
    """Zbuduj treść emaila o zdarzeniu."""
    event_type_label = {
        "awaria": "awaria sieci wodociągowej",
        "planowane_wylaczenie": "planowane wyłączenie wody",
        "remont": "remont sieci wodociągowej",
    }.get(event.event_type, event.event_type)

    lines = [
        "Szanowny Mieszkańcu,",
        "",
        f"Informujemy, że wystąpiła {event_type_label} przy ul. {event.street_name}",
    ]

    if event.house_number_from or event.house_number_to:
        nr_from = event.house_number_from or "?"
        nr_to = event.house_number_to or "?"
        if nr_from == nr_to:
            lines[-1] += f" nr {nr_from}."
        else:
            lines[-1] += f" nr {nr_from}–{nr_to}."
    else:
        lines[-1] += "."

    if event.description:
        lines += ["", f"Opis: {event.description}"]

    if event.estimated_end:
        end_str = event.estimated_end.strftime("%d.%m.%Y %H:%M")
        lines += ["", f"Szacowany czas usunięcia awarii: {end_str}"]

    lines += [
        "",
        "Przepraszamy za utrudnienia.",
        "",
        "MPWiK Lublin",
        "tel. alarmowy: 994",
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Nocna cisza
# ---------------------------------------------------------------------------


def _is_night_hours() -> bool:
    """Sprawdź czy aktualny czas (Europe/Warsaw) to nocna cisza (22:00–06:00)."""
    hour = datetime.now(ZoneInfo("Europe/Warsaw")).hour
    return hour >= _NIGHT_HOUR_START or hour < _NIGHT_HOUR_END


# ---------------------------------------------------------------------------
# Główna funkcja orkiestratora
# ---------------------------------------------------------------------------


async def _send_notifications_for_subscriber(
    db: AsyncSession,
    event: Event,
    subscriber: "Subscriber",
    sms_gateway: object,
    email_sender: "EmailSender | None",
    email_globally_enabled: bool,
    is_night: bool,
    sms_text: str,
    email_subject: str,
    email_body: str,
) -> None:
    """Wyślij powiadomienia (email + SMS) do jednego subskrybenta i zapisz log.

    Wyizolowana funkcja — wyjątek tutaj nie przerywa pętli dla pozostałych.
    """
    # --- EMAIL ---
    if not email_globally_enabled:
        pass  # Kill-switch globalny — pomijamy bez logu (już zalogowane przed pętlą)
    elif not subscriber.notify_by_email:
        logger.info(
            "Email do %s (sub_id=%d) pominięty — subskrybent wyłączył e-mail",
            subscriber.email,
            subscriber.id,
        )
    else:
        assert email_sender is not None  # gwarantowane przez email_globally_enabled
        email_ok = await email_sender.send(subscriber.email, email_subject, email_body)
        db.add(
            NotificationLog(
                event_id=event.id,
                subscriber_id=subscriber.id,
                channel="email",
                recipient=subscriber.email,
                message_text=email_body,
                status="sent" if email_ok else "failed",
                error_message=None if email_ok else "Błąd wysyłki email",
            )
        )

    # --- SMS ---
    if not subscriber.notify_by_sms:
        logger.info(
            "SMS do %s (sub_id=%d) pominięty — subskrybent wyłączył SMS",
            subscriber.phone,
            subscriber.id,
        )
    elif is_night and not subscriber.night_sms_consent:
        logger.info(
            "SMS do %s (sub_id=%d) odłożony na 06:00 (nocna cisza, brak zgody)",
            subscriber.phone,
            subscriber.id,
        )
        db.add(
            NotificationLog(
                event_id=event.id,
                subscriber_id=subscriber.id,
                channel="sms",
                recipient=subscriber.phone,
                message_text=sms_text,
                status="queued_morning",
                error_message="Nocna cisza — brak zgody na SMS nocne. Zaplanowano na 06:00.",
            )
        )
    else:
        sms_ok = await sms_gateway.send(subscriber.phone, sms_text)
        db.add(
            NotificationLog(
                event_id=event.id,
                subscriber_id=subscriber.id,
                channel="sms",
                recipient=subscriber.phone,
                message_text=sms_text,
                status="sent" if sms_ok else "failed",
                error_message=None if sms_ok else "Błąd wysyłki SMS",
            )
        )


async def notify_event(event_id: int) -> None:
    """
    Wyślij powiadomienia do subskrybentów dotkniętych zdarzeniem.

    Otwiera własną sesję bazy danych — bezpieczne do uruchomienia jako
    asyncio.create_task() po zamknięciu sesji routera.

    - Email: zawsze (o ile ENABLE_EMAIL_NOTIFICATIONS=True i subskrybent nie wyłączył).
    - SMS: jeśli czas nocny (22-06) i brak night_sms_consent → status 'queued_morning'.
    - Każda próba zapisana do notification_log.
    - Błąd dla jednego subskrybenta nie przerywa wysyłki do pozostałych.
    """
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Event).where(Event.id == event_id))
            event = result.scalar_one_or_none()
            if event is None:
                logger.error("notify_event: zdarzenie id=%d nie istnieje w bazie", event_id)
                return

            if not event.street_id:
                logger.info("Zdarzenie id=%d bez street_id — pomijam powiadomienia", event.id)
                return

            matched = await match_subscribers(
                db, event.street_id, event.house_number_from, event.house_number_to
            )

            if not matched:
                logger.info(
                    "Zdarzenie id=%d: brak subskrybentów do powiadomienia (street_id=%d)",
                    event.id,
                    event.street_id,
                )
                return

            sms_gateway = get_sms_gateway()
            email_globally_enabled: bool = settings.ENABLE_EMAIL_NOTIFICATIONS
            if not email_globally_enabled:
                logger.warning(
                    "ENABLE_EMAIL_NOTIFICATIONS=False — wysyłka e-mail wyłączona globalnie dla zdarzenia id=%d",
                    event.id,
                )
            email_sender = EmailSender() if email_globally_enabled else None
            is_night = _is_night_hours()

            sms_text = build_sms_message(event)
            email_subject = build_email_subject(event)
            email_body = build_email_body(event)

            sent_count = 0
            error_count = 0
            for subscriber, _addr in matched:
                try:
                    await _send_notifications_for_subscriber(
                        db=db,
                        event=event,
                        subscriber=subscriber,
                        sms_gateway=sms_gateway,
                        email_sender=email_sender,
                        email_globally_enabled=email_globally_enabled,
                        is_night=is_night,
                        sms_text=sms_text,
                        email_subject=email_subject,
                        email_body=email_body,
                    )
                    sent_count += 1
                except Exception:
                    error_count += 1
                    logger.exception(
                        "Błąd podczas wysyłki powiadomienia do sub_id=%d (zdarzenie id=%d) — kontynuuję dla pozostałych",
                        subscriber.id,
                        event_id,
                    )

            await db.commit()
            logger.info(
                "Zdarzenie id=%d: wysłano powiadomienia do %d/%d subskrybentów (nocna_cisza=%s, błędy=%d)",
                event.id,
                sent_count,
                len(matched),
                is_night,
                error_count,
            )
    except Exception:
        logger.exception("Błąd podczas wysyłki powiadomień dla zdarzenia id=%d", event_id)


# ---------------------------------------------------------------------------
# Scheduler — poranna kolejka SMS (06:00)
# ---------------------------------------------------------------------------


async def process_morning_queue() -> None:
    """Wyślij SMS-y odłożone na rano (status='queued_morning').

    Wywoływane przez APScheduler codziennie o 06:00 Europe/Warsaw.
    Dla każdego rekordu w kolejce próbuje wysłać SMS przez bramkę,
    a następnie aktualizuje status na 'sent' lub 'failed'.
    """
    logger.info("process_morning_queue: start")
    sms_gateway = get_sms_gateway()

    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(NotificationLog).where(NotificationLog.status == "queued_morning")
            )
            queued: list[NotificationLog] = list(result.scalars().all())

            if not queued:
                logger.info("process_morning_queue: brak rekordów w kolejce — koniec")
                return

            sent_count = 0
            error_count = 0
            for log_entry in queued:
                try:
                    ok = await sms_gateway.send(log_entry.recipient, log_entry.message_text or "")
                    log_entry.status = "sent" if ok else "failed"
                    if not ok:
                        log_entry.error_message = "Błąd wysyłki SMS (poranna kolejka)"
                        error_count += 1
                    else:
                        log_entry.error_message = None
                        sent_count += 1
                except Exception:
                    log_entry.status = "failed"
                    log_entry.error_message = "Wyjątek podczas wysyłki SMS (poranna kolejka)"
                    error_count += 1
                    logger.exception(
                        "process_morning_queue: błąd dla log_id=%d recipient=%s",
                        log_entry.id,
                        log_entry.recipient,
                    )

            await db.commit()
            logger.info(
                "process_morning_queue: zakończono — wysłano=%d, błędy=%d, łącznie=%d",
                sent_count,
                error_count,
                len(queued),
            )
    except Exception:
        logger.exception("process_morning_queue: nieoczekiwany błąd sesji DB")
