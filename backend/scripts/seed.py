"""
Skrypt seed — wypełnia bazę testowymi danymi dla celów deweloperskich.

Uruchomienie (z katalogu backend/):
    python -m scripts.seed
"""

import asyncio
import logging
import secrets
import sys

# Zapewnij widoczność pakietu app przy wywołaniu python -m scripts.seed
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import AsyncSessionLocal
from app.models.event import Event, EventHistory
from app.models.street import Street
from app.models.subscriber import Subscriber, SubscriberAddress
from app.models.user import User
from app.utils.security import hash_password

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Dane seedowe
# ---------------------------------------------------------------------------

STREETS = [
    {
        "teryt_sym_ul": "21404",
        "name": "Piłsudskiego",
        "full_name": "Aleja Marszałka Józefa Piłsudskiego",
        "street_type": "al.",
        "city": "Lublin",
    },
    {
        "teryt_sym_ul": "21102",
        "name": "Lipowa",
        "full_name": "Ulica Lipowa",
        "street_type": "ul.",
        "city": "Lublin",
    },
    {
        "teryt_sym_ul": "21307",
        "name": "Nadbystrzycka",
        "full_name": "Ulica Nadbystrzycka",
        "street_type": "ul.",
        "city": "Lublin",
    },
    {
        "teryt_sym_ul": "21501",
        "name": "Zana",
        "full_name": "Ulica Tomasza Zana",
        "street_type": "ul.",
        "city": "Lublin",
    },
    {
        "teryt_sym_ul": "21601",
        "name": "Kraśnicka",
        "full_name": "Aleja Kraśnicka",
        "street_type": "al.",
        "city": "Lublin",
    },
]

EVENTS_DATA = [
    {
        "street_index": 0,  # Piłsudskiego
        "event_type": "awaria",
        "source": "mpwik",
        "house_number_from": "1",
        "house_number_to": "20",
        "description": "Pęknięcie głównej rury wodociągowej. Brak wody w budynkach nr 1-20.",
        "status": "w_naprawie",
        "history": [
            {"old_status": "zgloszona", "new_status": "w_naprawie"},
        ],
    },
    {
        "street_index": 1,  # Lipowa
        "event_type": "planowane_wylaczenie",
        "source": "mpwik",
        "house_number_from": "5",
        "house_number_to": "15",
        "description": "Planowana wymiana wodomierzy. Przerwa 08:00–14:00.",
        "status": "zgloszona",
        "history": [],
    },
    {
        "street_index": 2,  # Nadbystrzycka
        "event_type": "remont",
        "source": "mpwik",
        "house_number_from": "30",
        "house_number_to": "50",
        "description": "Modernizacja sieci wodociągowej. Utrudnienia potrwają ok. 2 tygodnie.",
        "status": "usunieta",
        "history": [
            {"old_status": "zgloszona", "new_status": "w_naprawie"},
            {"old_status": "w_naprawie", "new_status": "usunieta"},
        ],
    },
]

SUBSCRIBERS_DATA = [
    {
        "phone": "600100200",
        "email": "jan.kowalski@example.com",
        "rodo_consent": True,
        "night_sms_consent": False,
        "addresses": [
            {"street_index": 0, "house_number": "10", "flat_number": "3"},
            {"street_index": 1, "house_number": "7", "flat_number": None},
        ],
    },
    {
        "phone": "700300400",
        "email": "anna.nowak@example.com",
        "rodo_consent": True,
        "night_sms_consent": True,
        "addresses": [
            {"street_index": 2, "house_number": "42", "flat_number": "12"},
        ],
    },
]


# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------

async def seed() -> None:
    async with AsyncSessionLocal() as db:
        logger.info("=== Seed start ===")

        # 1. Użytkownik — dyspozytor
        user = User(
            username="admin",
            password_hash=hash_password("admin123"),
            full_name="Administrator Testowy",
            role="dispatcher",
            is_active=True,
        )
        db.add(user)
        await db.flush()
        logger.info("Dodano użytkownika: %s (id=%d)", user.username, user.id)

        # 2. Ulice
        street_objects: list[Street] = []
        for s in STREETS:
            street = Street(**s)
            db.add(street)
            street_objects.append(street)
        await db.flush()
        for s in street_objects:
            logger.info("Dodano ulicę: %s (id=%d)", s.full_name, s.id)

        # 3. Zdarzenia + historia
        for ev_data in EVENTS_DATA:
            street = street_objects[ev_data["street_index"]]
            event = Event(
                event_type=ev_data["event_type"],
                source=ev_data["source"],
                street_id=street.id,
                street_name=street.name,
                house_number_from=ev_data.get("house_number_from"),
                house_number_to=ev_data.get("house_number_to"),
                description=ev_data.get("description"),
                status=ev_data["status"],
                created_by=user.id,
            )
            db.add(event)
            await db.flush()

            for h in ev_data.get("history", []):
                db.add(
                    EventHistory(
                        event_id=event.id,
                        old_status=h["old_status"],
                        new_status=h["new_status"],
                        changed_by=user.id,
                    )
                )

            logger.info(
                "Dodano zdarzenie id=%d typ=%r status=%r ulica=%r",
                event.id,
                event.event_type,
                event.status,
                street.name,
            )

        # 4. Subskrybenci + adresy
        for sub_data in SUBSCRIBERS_DATA:
            subscriber = Subscriber(
                phone=sub_data["phone"],
                email=sub_data["email"],
                rodo_consent=sub_data["rodo_consent"],
                night_sms_consent=sub_data["night_sms_consent"],
                unsubscribe_token=secrets.token_hex(32),
            )
            db.add(subscriber)
            await db.flush()

            for addr in sub_data["addresses"]:
                street = street_objects[addr["street_index"]]
                db.add(
                    SubscriberAddress(
                        subscriber_id=subscriber.id,
                        street_id=street.id,
                        street_name=street.name,
                        house_number=addr["house_number"],
                        flat_number=addr.get("flat_number"),
                    )
                )

            logger.info(
                "Dodano subskrybenta id=%d email=%r adresy=%d",
                subscriber.id,
                subscriber.email,
                len(sub_data["addresses"]),
            )

        await db.commit()
        logger.info("=== Seed zakończony sukcesem ===")


if __name__ == "__main__":
    asyncio.run(seed())
