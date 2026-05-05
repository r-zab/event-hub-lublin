"""
Router: API Keys — zarządzanie kluczami API dla systemów zewnętrznych (integratorów).

Wymaga roli admin dla wszystkich operacji.
Klucz plain-text zwracany jest tylko raz przy tworzeniu — nie jest przechowywany.
"""

import hashlib
import logging
import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_admin, get_db
from app.models.api_key import ApiKey
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api-keys", tags=["ApiKeys"])


class ApiKeyResponse(BaseModel):
    id: int
    operator_name: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ApiKeyCreateRequest(BaseModel):
    operator_name: str


class ApiKeyCreatedResponse(ApiKeyResponse):
    plain_key: str


@router.get("", response_model=list[ApiKeyResponse], summary="Lista kluczy API (admin)")
async def list_api_keys(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> list[ApiKeyResponse]:
    result = await db.execute(select(ApiKey).order_by(ApiKey.created_at.desc()))
    return [ApiKeyResponse.model_validate(k) for k in result.scalars().all()]


@router.post(
    "",
    response_model=ApiKeyCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Utwórz klucz API (admin)",
)
async def create_api_key(
    body: ApiKeyCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> ApiKeyCreatedResponse:
    """Generuje nowy klucz API. Klucz plain-text jest zwracany tylko raz."""
    existing = await db.execute(select(ApiKey).where(ApiKey.operator_name == body.operator_name))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Klucz API dla operatora '{body.operator_name}' już istnieje.",
        )

    plain_key = secrets.token_hex(32)
    key_hash = hashlib.sha256(plain_key.encode()).hexdigest()

    api_key = ApiKey(operator_name=body.operator_name, api_key_hash=key_hash)
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)

    logger.info(
        "Admin id=%d utworzył klucz API dla operatora %r (id=%d)",
        current_admin.id, api_key.operator_name, api_key.id,
    )
    return ApiKeyCreatedResponse(
        id=api_key.id,
        operator_name=api_key.operator_name,
        is_active=api_key.is_active,
        created_at=api_key.created_at,
        plain_key=plain_key,
    )


@router.patch(
    "/{key_id}",
    response_model=ApiKeyResponse,
    summary="Włącz/wyłącz klucz API (admin)",
)
async def toggle_api_key(
    key_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> ApiKeyResponse:
    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id))
    api_key = result.scalar_one_or_none()
    if api_key is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Klucz API nie istnieje.")

    api_key.is_active = not api_key.is_active
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)

    logger.info(
        "Admin id=%d zmienił status klucza API id=%d na is_active=%s",
        current_admin.id, api_key.id, api_key.is_active,
    )
    return ApiKeyResponse.model_validate(api_key)


@router.delete(
    "/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Usuń klucz API (admin)",
)
async def delete_api_key(
    key_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> None:
    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id))
    api_key = result.scalar_one_or_none()
    if api_key is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Klucz API nie istnieje.")

    await db.delete(api_key)
    await db.commit()
    logger.info(
        "Admin id=%d usunął klucz API id=%d (operator: %r)",
        current_admin.id, key_id, api_key.operator_name,
    )
