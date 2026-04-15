"""FastAPI dependencies shared across routers."""

import logging

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db  # re-export for single-import convenience
from app.models.user import User
from app.schemas.auth import TokenData

logger = logging.getLogger(__name__)

# tokenUrl must match the mounted prefix + path in main.py
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

__all__ = ["get_db", "get_current_user", "get_current_admin", "oauth2_scheme"]


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Validate a Bearer JWT and return the associated active User.

    Raises HTTP 401 when the token is invalid, expired, or the user is inactive.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Nieprawidłowe dane uwierzytelniające",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str | None = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except JWTError:
        logger.warning("JWT decode error")
        raise credentials_exception

    result = await db.execute(select(User).where(User.username == token_data.username))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Konto nieaktywne",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    """Zezwala tylko użytkownikom z rolą 'admin'.

    Raises HTTP 403 gdy zalogowany użytkownik ma rolę 'dispatcher' lub inną.
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Brak uprawnień administratora",
        )
    return current_user


async def get_current_dispatcher_or_admin(current_user: User = Depends(get_current_user)) -> User:
    """Zezwala użytkownikom z rolą 'admin' lub 'dispatcher'.

    Raises HTTP 403 dla nieznanych ról (przyszłe rozszerzenia systemu).
    """
    if current_user.role not in ("admin", "dispatcher"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Wymagana rola dispatcher lub admin",
        )
    return current_user
