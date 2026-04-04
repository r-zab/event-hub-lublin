"""
Skrypt inicjalizacji kont deweloperskich.

Tworzy/aktualizuje użytkowników testowych w bazie:
  - admin       rola: admin      hasło: admin123
  - dyspozytor1 rola: dispatcher hasło: lublin123
  - dyspozytor2 rola: dispatcher hasło: lublin123

Idempotentny — bezpieczny do wielokrotnego uruchamiania.

Uruchomienie (z katalogu backend/):
    python -m scripts.setup_dev_users
"""

import asyncio
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.user import User
from app.utils.security import hash_password

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

USERS: list[dict] = [
    {
        "username": "admin",
        "password": "admin123",
        "role": "admin",
        "full_name": "Administrator",
    },
    {
        "username": "dyspozytor1",
        "password": "lublin123",
        "role": "dispatcher",
        "full_name": "Dyspozytorka Anna",
    },
    {
        "username": "dyspozytor2",
        "password": "lublin123",
        "role": "dispatcher",
        "full_name": "Dyspozytor Marek",
    },
]


async def setup_dev_users() -> None:
    async with AsyncSessionLocal() as session:
        for spec in USERS:
            result = await session.execute(
                select(User).where(User.username == spec["username"])
            )
            user = result.scalar_one_or_none()

            if user is None:
                user = User(username=spec["username"])
                session.add(user)
                action = "Utworzono"
            else:
                action = "Zaktualizowano"

            user.password_hash = hash_password(spec["password"])
            user.role = spec["role"]
            user.full_name = spec["full_name"]
            user.is_active = True

            await session.flush()
            logger.info(
                "%s użytkownika '%s' (rola: %s)", action, spec["username"], spec["role"]
            )

        await session.commit()
    logger.info("Gotowe.")


if __name__ == "__main__":
    asyncio.run(setup_dev_users())
