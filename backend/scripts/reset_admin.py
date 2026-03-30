"""
Jednorazowy skrypt: reset/utwórz użytkownika admin z hasłem admin123.

Uruchomienie (z katalogu backend/):
    python -m scripts.reset_admin
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.user import User
from app.utils.security import hash_password


async def reset_admin() -> None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.username == "admin"))
        user = result.scalar_one_or_none()

        if user is None:
            user = User(username="admin")
            session.add(user)
            action = "Utworzono"
        else:
            action = "Zaktualizowano"

        user.password_hash = hash_password("admin123")
        user.role = "admin"
        user.is_active = True
        user.full_name = "Administrator"

        await session.commit()
        print(f"[OK] {action} użytkownika 'admin' (rola: admin, hasło: admin123)")


if __name__ == "__main__":
    asyncio.run(reset_admin())
