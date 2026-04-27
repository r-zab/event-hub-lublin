"""Authentication router — login and token refresh endpoints."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_db
from app.limiter import limiter
from app.models.user import User
from app.schemas.auth import RefreshRequest, Token
from app.utils.security import create_access_token, create_refresh_token, verify_password

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/login", response_model=Token, summary="Logowanie dyspozytora")
@limiter.limit("5/minute")
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
) -> Token:
    """Zaloguj dyspozytora i zwróć JWT access token.

    Przyjmuje dane jako `application/x-www-form-urlencoded` (standard OAuth2).
    Zwraca token ważny przez czas określony w konfiguracji (domyślnie 30 minut).
    """
    result = await db.execute(select(User).where(User.username == form_data.username))
    user: User | None = result.scalar_one_or_none()

    if user is None or not verify_password(form_data.password, user.password_hash):
        logger.warning("Nieudana próba logowania dla użytkownika: %s", form_data.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nieprawidłowy login lub hasło",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Konto nieaktywne",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": user.username, "role": user.role, "dept": user.department})
    refresh_token = create_refresh_token(data={"sub": user.username, "role": user.role, "dept": user.department})
    logger.info("Zalogowano użytkownika: %s (role=%s)", user.username, user.role)
    return Token(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=Token, summary="Odświeżanie access tokena")
@limiter.limit("10/minute")
async def refresh_token(
    request: Request,
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> Token:
    """Wygeneruj nowy access token na podstawie ważnego refresh tokena.

    Przyjmuje JSON z polem `refresh_token`.
    Zwraca nowy access token ważny przez ACCESS_TOKEN_EXPIRE_MINUTES.
    """
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Nieprawidłowy lub wygasły refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(body.refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "refresh":
            raise credentials_error
        username: str | None = payload.get("sub")
        if username is None:
            raise credentials_error
    except JWTError:
        raise credentials_error

    result = await db.execute(select(User).where(User.username == username))
    user: User | None = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise credentials_error

    new_access_token = create_access_token(data={"sub": user.username, "role": user.role, "dept": user.department})
    logger.info("Odświeżono token dla użytkownika: %s", user.username)
    return Token(access_token=new_access_token)
