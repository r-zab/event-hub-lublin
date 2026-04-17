# pip install faker
"""Seed script: generates 30 Subscribers and 10 Events using existing Buildings and Streets.
Does NOT create new buildings, streets, or users.

Usage:
    cd backend
    python scripts/seed_traffic_only.py
"""

import asyncio
import random
import secrets
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta, timezone
from faker import Faker

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.building import Building
from app.models.street import Street
from app.models.subscriber import Subscriber, SubscriberAddress
from app.models.event import Event

fake = Faker("pl_PL")

EVENT_TYPES = [
    "awaria",
    "awaria",
    "awaria",
    "planowane_wylaczenie",
    "remont",
]

EVENT_DESCRIPTIONS = [
    "Awaria głównego przewodu wodociągowego. Trwają prace naprawcze.",
    "Przerwa w dostawie wody spowodowana awarią sieci.",
    "Planowane prace konserwacyjne na sieci wodociągowej.",
    "Awaria kanalizacji – ekipa techniczna na miejscu.",
    "Wymiana odcinka sieci wodociągowej.",
    "Naprawa przyłącza wodociągowego.",
    "Uszkodzenie kolektora kanalizacyjnego.",
    "Modernizacja pompowni – tymczasowe ograniczenie ciśnienia.",
    "Płukanie sieci wodociągowej.",
    "Awaria hydrantu przeciwpożarowego.",
]

STATUSES = ["zgloszona", "w_naprawie", "usunieta"]


def random_past(days: int = 30) -> datetime:
    delta = random.randint(0, days * 24 * 60)
    return datetime.now(tz=timezone.utc) - timedelta(minutes=delta)


def random_future(days: int = 14) -> datetime:
    delta = random.randint(1, days * 24 * 60)
    return datetime.now(tz=timezone.utc) + timedelta(minutes=delta)


async def seed() -> None:
    async with AsyncSessionLocal() as session:
        buildings_result = await session.execute(
            select(Building).where(
                Building.street_name.isnot(None),
                Building.house_number.isnot(None),
            ).limit(500)
        )
        buildings: list[Building] = buildings_result.scalars().all()

        streets_result = await session.execute(select(Street).limit(200))
        streets: list[Street] = streets_result.scalars().all()

        if not buildings and not streets:
            print("BŁĄD: Brak budynków i ulic w bazie. Uruchom najpierw seed importu danych.")
            return

        print(f"Pobrano {len(buildings)} budynków i {len(streets)} ulic.")

        # --- Subskrybenci ---
        subscribers_created = 0
        for _ in range(30):
            use_building = buildings and (not streets or random.random() < 0.7)
            if use_building:
                b: Building = random.choice(buildings)
                street_id = b.street_id
                street_name = b.street_name or "Nieznana"
                house_number = b.house_number or "1"
            else:
                s: Street = random.choice(streets)
                street_id = s.id
                street_name = s.name
                house_number = str(random.randint(1, 150))

            rodo = random.random() < 0.85
            night_sms = random.random() < 0.4
            notify_email = random.random() < 0.9
            notify_sms = random.random() < 0.75

            subscriber = Subscriber(
                phone=fake.phone_number()[:20],
                email=fake.unique.email(),
                rodo_consent=rodo,
                night_sms_consent=night_sms,
                notify_by_email=notify_email,
                notify_by_sms=notify_sms,
                unsubscribe_token=secrets.token_urlsafe(48)[:64],
            )
            session.add(subscriber)
            await session.flush()

            address = SubscriberAddress(
                subscriber_id=subscriber.id,
                street_id=street_id,
                street_name=street_name,
                house_number=house_number,
                flat_number=str(random.randint(1, 50)) if random.random() < 0.3 else None,
            )
            session.add(address)
            subscribers_created += 1

        print(f"Dodano {subscribers_created} subskrybentów.")

        # --- Wydarzenia ---
        now = datetime.now(tz=timezone.utc)
        time_scenarios = [
            # przeszłe usunięte
            {"start_time": random_past(20), "estimated_end": random_past(5), "status": "usunieta"},
            {"start_time": random_past(20), "estimated_end": random_past(5), "status": "usunieta"},
            {"start_time": random_past(20), "estimated_end": random_past(5), "status": "usunieta"},
            # obecne w naprawie
            {"start_time": random_past(1), "estimated_end": random_future(1), "status": "w_naprawie"},
            {"start_time": random_past(2), "estimated_end": random_future(2), "status": "w_naprawie"},
            {"start_time": random_past(3), "estimated_end": random_future(1), "status": "w_naprawie"},
            # przyszłe zgłoszone
            {"start_time": random_future(2), "estimated_end": random_future(5), "status": "zgloszona"},
            {"start_time": random_future(1), "estimated_end": random_future(3), "status": "zgloszona"},
            # usunięte starsze
            {"start_time": random_past(10), "estimated_end": random_past(8), "status": "usunieta"},
            # niedawno zgłoszona bez end
            {"start_time": now, "estimated_end": None, "status": "zgloszona"},
        ]

        events_created = 0
        for scenario in time_scenarios:
            use_building = buildings and (not streets or random.random() < 0.6)
            if use_building:
                b = random.choice(buildings)
                street_id = b.street_id
                street_name = b.street_name or "Nieznana"
                house_from = b.house_number
                house_to = None
            else:
                s = random.choice(streets)
                street_id = s.id
                street_name = s.name
                num_start = random.randint(1, 100)
                house_from = str(num_start)
                house_to = str(num_start + random.randint(2, 20))

            event = Event(
                event_type=random.choice(EVENT_TYPES),
                source="mpwik",
                street_id=street_id,
                street_name=street_name,
                house_number_from=house_from,
                house_number_to=house_to,
                description=random.choice(EVENT_DESCRIPTIONS),
                status=scenario["status"],
                start_time=scenario["start_time"],
                estimated_end=scenario["estimated_end"],
            )
            session.add(event)
            events_created += 1

        print(f"Dodano {events_created} wydarzeń.")

        await session.commit()
        print("Seed zakończony pomyślnie.")


if __name__ == "__main__":
    asyncio.run(seed())
