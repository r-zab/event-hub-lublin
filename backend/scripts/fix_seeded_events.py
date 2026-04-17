"""Fix incorrectly seeded event_type and status values in the database.

Run once after the bad seed to correct existing records:
    cd backend
    python scripts/fix_seeded_events.py
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import update
from app.database import AsyncSessionLocal
from app.models.event import Event

EVENT_TYPE_MAP = {
    "awaria_wodociagu": "awaria",
    "awaria_kanalizacji": "awaria",
    "awaria_pompowni": "awaria",
    "prace_na_sieci": "remont",
    "planowana_przerwa": "planowane_wylaczenie",
}

STATUS_MAP = {
    "w_trakcie": "w_naprawie",
    "zakonczona": "usunieta",
    "anulowana": "usunieta",
}


async def fix() -> None:
    async with AsyncSessionLocal() as session:
        fixed = 0

        for bad, good in EVENT_TYPE_MAP.items():
            result = await session.execute(
                update(Event)
                .where(Event.event_type == bad)
                .values(event_type=good)
            )
            fixed += result.rowcount

        for bad, good in STATUS_MAP.items():
            result = await session.execute(
                update(Event)
                .where(Event.status == bad)
                .values(status=good)
            )
            fixed += result.rowcount

        await session.commit()
        print(f"Naprawiono {fixed} pól w tabeli events.")


if __name__ == "__main__":
    asyncio.run(fix())
