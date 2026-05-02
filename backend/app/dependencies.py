"""FastAPI dependencies shared across routers."""

import hashlib
import logging

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db  # re-export for single-import convenience
from app.models.api_key import ApiKey
from app.models.user import User
from app.schemas.auth import TokenData

logger = logging.getLogger(__name__)

# tokenUrl must match the mounted prefix + path in main.py
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
_oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

__all__ = [
    "get_db",
    "get_current_user",
    "get_current_admin",
    "get_current_user_or_api_key",
    "oauth2_scheme",
]


async def _validate_jwt(token: str, db: AsyncSession) -> User:
    """Validate a Bearer JWT and return the associated active User.

    Raises HTTP 401 when the token is invalid, expired, session is stale, or user is inactive.
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
        token_session_id: str | None = payload.get("sid")
    except JWTError:
        logger.warning("JWT decode error")
        raise credentials_exception

    result = await db.execute(select(User).where(User.username == token_data.username))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception
    logger.debug("JWT Sub: %s | DB User: %s (ID: %d)", username, user.username, user.id)
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Konto nieaktywne",
            headers={"WWW-Authenticate": "Bearer"},
        )

    logger.info(
        "Session-ID check — user=%s token_sid=%r db_sid=%r",
        user.username, token_session_id, user.session_id,
    )
    if not token_session_id or not user.session_id or str(token_session_id) != str(user.session_id):
        logger.warning(
            "Odrzucono sesję user=%s: token_sid=%r db_sid=%r",
            user.username, token_session_id, user.session_id,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesja wygasła. Wykryto logowanie na innym urządzeniu.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    return await _validate_jwt(token, db)


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


async def get_current_user_or_api_key(
    request: Request,
    token: str | None = Depends(_oauth2_scheme_optional),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Dual-auth: akceptuje zarówno Bearer JWT jak i nagłówek X-API-Key.

    Zwraca User gdy autoryzacja przez JWT, None gdy przez aktywny klucz API.
    Raises HTTP 401 gdy brak obu lub dane są nieprawidłowe.
    """
    api_key_header = request.headers.get("X-API-Key")
    if api_key_header:
        key_hash = hashlib.sha256(api_key_header.encode()).hexdigest()
        result = await db.execute(
            select(ApiKey).where(
                ApiKey.api_key_hash == key_hash,
                ApiKey.is_active.is_(True),
            )
        )
        api_key = result.scalar_one_or_none()
        if api_key is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Nieprawidłowy lub nieaktywny klucz API",
            )
        logger.info("Autoryzacja przez klucz API operatora: %s", api_key.operator_name)
        return None

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Brak danych uwierzytelniających",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return await _validate_jwt(token, db)
