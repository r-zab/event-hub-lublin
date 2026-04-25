"""
Router: MessageTemplates — słownik szablonów komunikatów (T2.2).

GET dostępny dla zalogowanych (dispatcher/admin) — używany w AdminEventForm jako dropdown "Wstaw szablon".
POST/PATCH/DELETE wymagają roli admin.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_admin, get_current_dispatcher_or_admin, get_db
from app.models.event_type import EventType
from app.models.message_template import MessageTemplate
from app.models.user import User
from app.schemas.message_template import (
    MessageTemplateCreate,
    MessageTemplateResponse,
    MessageTemplateUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "",
    response_model=list[MessageTemplateResponse],
    summary="Lista szablonów komunikatów",
)
async def list_message_templates(
    event_type_id: int | None = None,
    only_active: bool = True,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_dispatcher_or_admin),
) -> list[MessageTemplateResponse]:
    """Zwróć szablony — opcjonalnie przefiltrowane po typie zdarzenia. Wymaga roli dispatcher lub admin."""
    stmt = select(MessageTemplate)
    if only_active:
        stmt = stmt.where(MessageTemplate.is_active.is_(True))
    if event_type_id is not None:
        stmt = stmt.where(
            (MessageTemplate.event_type_id == event_type_id)
            | (MessageTemplate.event_type_id.is_(None))
        )
    stmt = stmt.order_by(MessageTemplate.code)
    result = await db.execute(stmt)
    items = result.scalars().all()
    return [MessageTemplateResponse.model_validate(t) for t in items]


async def _ensure_event_type_exists(db: AsyncSession, event_type_id: int | None) -> None:
    if event_type_id is None:
        return
    result = await db.execute(select(EventType).where(EventType.id == event_type_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Typ zdarzenia id={event_type_id} nie istnieje.",
        )


@router.post(
    "",
    response_model=MessageTemplateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Dodaj szablon komunikatu (admin)",
)
async def create_message_template(
    body: MessageTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> MessageTemplateResponse:
    """Utwórz szablon. Kod musi być unikalny."""
    existing = await db.execute(select(MessageTemplate).where(MessageTemplate.code == body.code))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Szablon o kodzie '{body.code}' już istnieje.",
        )
    await _ensure_event_type_exists(db, body.event_type_id)

    tpl = MessageTemplate(
        code=body.code,
        body=body.body,
        event_type_id=body.event_type_id,
        is_active=body.is_active,
    )
    db.add(tpl)
    await db.commit()
    await db.refresh(tpl)
    logger.info("Admin id=%d utworzył szablon %r", current_admin.id, tpl.code)
    return MessageTemplateResponse.model_validate(tpl)


@router.patch(
    "/{tpl_id}",
    response_model=MessageTemplateResponse,
    summary="Aktualizuj szablon komunikatu (admin)",
)
async def update_message_template(
    tpl_id: int,
    body: MessageTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> MessageTemplateResponse:
    """Aktualizuj treść/typ/aktywność szablonu."""
    result = await db.execute(select(MessageTemplate).where(MessageTemplate.id == tpl_id))
    tpl = result.scalar_one_or_none()
    if tpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Szablon nie istnieje.")

    update_data = body.model_dump(exclude_unset=True)
    if "code" in update_data and update_data["code"] != tpl.code:
        clash = await db.execute(
            select(MessageTemplate).where(MessageTemplate.code == update_data["code"])
        )
        if clash.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Szablon o kodzie '{update_data['code']}' już istnieje.",
            )
    if "event_type_id" in update_data:
        await _ensure_event_type_exists(db, update_data["event_type_id"])

    for field, value in update_data.items():
        setattr(tpl, field, value)
    db.add(tpl)
    await db.commit()
    await db.refresh(tpl)
    logger.info("Admin id=%d zaktualizował szablon id=%d", current_admin.id, tpl.id)
    return MessageTemplateResponse.model_validate(tpl)


@router.delete(
    "/{tpl_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Usuń szablon komunikatu (admin)",
)
async def delete_message_template(
    tpl_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> None:
    """Usuń szablon komunikatu (twardo)."""
    result = await db.execute(select(MessageTemplate).where(MessageTemplate.id == tpl_id))
    tpl = result.scalar_one_or_none()
    if tpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Szablon nie istnieje.")
    await db.delete(tpl)
    await db.commit()
    logger.info("Admin id=%d usunął szablon id=%d (%s)", current_admin.id, tpl_id, tpl.code)
