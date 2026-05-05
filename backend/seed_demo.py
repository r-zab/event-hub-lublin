"""Demo data seed — T3.5.

Usage:
    python seed_demo.py           # load demo data
    python seed_demo.py --reset   # delete demo data and reload
    python seed_demo.py --clean   # delete demo data only (no reload)
"""

import asyncio
import secrets
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.models.event import Event, EventHistory
from app.models.street import Street
from app.models.subscriber import Subscriber, SubscriberAddress

DEMO_SOURCE = "demo"
DEMO_EMAIL_SUFFIX = "@demo.mpwik.seed"

NOW = datetime.now(tz=timezone.utc)

# ---------------------------------------------------------------------------
# Demo fixtures
# ---------------------------------------------------------------------------

_STREETS = [
    "Nadbystrzycka",
    "Lipowa",
    "Narutowicza",
    "Chopina",
    "Zana",
]

_EVENTS = [
    # 3 active events
    {
        "event_type_key": "awaria",
        "street_name": "Nadbystrzycka",
        "house_number_from": "10",
        "house_number_to": "40",
        "description": "[DEMO] Pekniecie rury DN200 - brak wody dla ok. 300 lokali.",
        "status": "w_naprawie",
        "start_time": NOW - timedelta(hours=4),
        "estimated_end": NOW + timedelta(hours=2),
        "auto_extend": True,
        "created_by_department": "TSK",
    },
    {
        "event_type_key": "planowane_wylaczenie",
        "street_name": "Lipowa",
        "house_number_from": "1",
        "house_number_to": "15",
        "description": "[DEMO] Planowane wylaczenie wody - wymiana zasuw.",
        "status": "zgloszona",
        "start_time": NOW + timedelta(hours=2),
        "estimated_end": NOW + timedelta(hours=6),
        "auto_extend": False,
        "created_by_department": "TSW",
    },
    {
        "event_type_key": "remont",
        "street_name": "Narutowicza",
        "house_number_from": "2",
        "house_number_to": "8",
        "description": "[DEMO] Remont sieci wodociagowej - przerwa 22:00-06:00.",
        "status": "zgloszona",
        "start_time": NOW + timedelta(hours=12),
        "estimated_end": NOW + timedelta(hours=20),
        "auto_extend": False,
        "created_by_department": "TP",
    },
    # 2 closed events with history
    {
        "event_type_key": "awaria",
        "street_name": "Chopina",
        "house_number_from": "50",
        "house_number_to": "60",
        "description": "[DEMO] Usunieta awaria hydrantu - zakonczona.",
        "status": "usunieta",
        "start_time": NOW - timedelta(days=3),
        "estimated_end": NOW - timedelta(days=3, hours=-6),
        "auto_extend": False,
        "created_by_department": "TSK",
        "_history": [
            ("zgloszona", "w_naprawie", NOW - timedelta(days=3, hours=-1)),
            ("w_naprawie", "usunieta", NOW - timedelta(days=3, hours=-5)),
        ],
    },
    {
        "event_type_key": "planowane_wylaczenie",
        "street_name": "Zana",
        "house_number_from": "3",
        "house_number_to": "11",
        "description": "[DEMO] Zamkniete wylaczenie - konserwacja przylacza.",
        "status": "usunieta",
        "start_time": NOW - timedelta(days=7),
        "estimated_end": NOW - timedelta(days=7, hours=-4),
        "auto_extend": False,
        "created_by_department": "TSW",
        "_history": [
            ("zgloszona", "w_naprawie", NOW - timedelta(days=7, hours=-1)),
            ("w_naprawie", "usunieta", NOW - timedelta(days=6, hours=-20)),
        ],
    },
]

_SUBSCRIBERS = [
    ("+48111222001", "jan.kowalski", "Nadbystrzycka", "12"),
    ("+48111222002", "anna.nowak", "Nadbystrzycka", "28"),
    ("+48111222003", "marek.wisniewski", "Lipowa", "3"),
    ("+48111222004", "karolina.wojcik", "Lipowa", "7"),
    ("+48111222005", "tomasz.krawczyk", "Narutowicza", "4"),
    ("+48111222006", "zofia.kaminska", "Narutowicza", "6"),
    ("+48111222007", "piotr.lewandowski", "Chopina", "55"),
    ("+48111222008", "marta.zielinska", "Chopina", "5"),
    ("+48111222009", "krzysztof.szymanski", "Zana", "9"),
    ("+48111222010", "ewa.wozniak", "Zana", "22"),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _resolve_street(session: AsyncSession, name: str) -> int | None:
    row = await session.execute(select(Street.id).where(Street.name == name).limit(1))
    result = row.scalar_one_or_none()
    return result


async def _clean(session: AsyncSession) -> int:
    """Delete all demo events (cascade removes history) and demo subscribers."""
    # EventHistory is cascade-deleted with events
    res_e = await session.execute(delete(Event).where(Event.source == DEMO_SOURCE))
    # Subscribers: delete by email suffix (SQLAlchemy text LIKE)
    res_s = await session.execute(
        delete(Subscriber).where(Subscriber.email.like(f"%{DEMO_EMAIL_SUFFIX}"))
    )
    await session.commit()
    return res_e.rowcount + res_s.rowcount


async def _seed(session: AsyncSession) -> None:
    # Pre-resolve streets
    street_ids: dict[str, int | None] = {}
    for name in _STREETS:
        street_ids[name] = await _resolve_street(session, name)

    # Resolve event type codes from DB (handles renamed/missing types gracefully)
    from app.models.event_type import EventType
    et_rows = await session.execute(select(EventType.code).where(EventType.is_active == True))
    available_codes = {r[0] for r in et_rows}
    fallback_code = next(iter(available_codes), "awaria")

    def _resolve_type(key: str) -> str:
        return key if key in available_codes else fallback_code

    # Create events
    for spec in _EVENTS:
        history_specs = spec.pop("_history", [])
        event = Event(
            source=DEMO_SOURCE,
            event_type=_resolve_type(spec.pop("event_type_key")),
            street_id=street_ids.get(spec["street_name"]),
            street_name=spec["street_name"],
            house_number_from=spec.get("house_number_from"),
            house_number_to=spec.get("house_number_to"),
            description=spec.get("description"),
            status=spec["status"],
            start_time=spec.get("start_time"),
            estimated_end=spec.get("estimated_end"),
            auto_extend=spec.get("auto_extend", False),
            created_by_department=spec.get("created_by_department"),
        )
        session.add(event)
        await session.flush()  # get event.id

        # Initial zgloszona history entry
        initial = EventHistory(
            event_id=event.id,
            old_status=None,
            new_status="zgloszona",
            changed_at=spec.get("start_time", NOW),
            note="Zgłoszenie demo",
        )
        session.add(initial)

        for old_st, new_st, changed_at in history_specs:
            session.add(EventHistory(
                event_id=event.id,
                old_status=old_st,
                new_status=new_st,
                changed_at=changed_at,
                note="Zmiana statusu demo",
            ))

    # Create subscribers
    for phone, email_prefix, street_name, house_no in _SUBSCRIBERS:
        email = f"{email_prefix}{DEMO_EMAIL_SUFFIX}"
        token = secrets.token_hex(32)
        sub = Subscriber(
            phone=phone,
            email=email,
            rodo_consent=True,
            night_sms_consent=False,
            notify_by_email=True,
            notify_by_sms=True,
            unsubscribe_token=token,
        )
        session.add(sub)
        await session.flush()

        session.add(SubscriberAddress(
            subscriber_id=sub.id,
            street_id=street_ids.get(street_name),
            street_name=street_name,
            house_number=house_no,
        ))

    await session.commit()
    print(f"Seeded {len(_EVENTS)} events and {len(_SUBSCRIBERS)} subscribers.")
    unresolved = [n for n, sid in street_ids.items() if sid is None]
    if unresolved:
        print(f"  NOTE: streets not found in DB (no street_id FK): {unresolved}")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

async def main() -> None:
    args = sys.argv[1:]
    reset = "--reset" in args
    clean_only = "--clean" in args

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as session:
        if reset or clean_only:
            removed = await _clean(session)
            print(f"Cleaned {removed} demo records.")
        if not clean_only:
            await _seed(session)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
