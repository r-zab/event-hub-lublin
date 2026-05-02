"""Admin router — endpointy wymagające roli admin.

Prefix: /api/v1/admin
Auth:   Bearer JWT + rola 'admin' (get_current_admin)
"""

import csv
import io
import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_admin
from app.models.audit import BuildingAuditLog, StreetAuditLog
from app.models.department import Department
from app.models.event import Event, EventHistory
from app.models.notification import NotificationLog
from app.models.subscriber import Subscriber, SubscriberAddress
from app.models.user import User
from app.utils.masking import mask_recipient
from app.utils.security import hash_password

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(get_current_admin)])


# ---------------------------------------------------------------------------
# Schematy odpowiedzi (lokalne — nie dublują schemas/)
# ---------------------------------------------------------------------------


class StatsResponse(BaseModel):
    """Statystyki systemu dla panelu admina."""

    total_subscribers: int
    active_events: int
    notifications_sent: int


class AdminAddressItem(BaseModel):
    """Uproszczony adres w widoku admina."""

    id: int
    street_name: str
    house_number: str
    flat_number: str | None

    model_config = {"from_attributes": True}


class AdminSubscriberItem(BaseModel):
    """Uproszczony subskrybent w widoku admina."""

    id: int
    phone: str | None
    email: str | None
    rodo_consent: bool
    night_sms_consent: bool
    notify_by_email: bool
    notify_by_sms: bool
    created_at: datetime
    addresses: list[AdminAddressItem] = []

    model_config = {"from_attributes": True}

    @field_validator("phone", "email", mode="after")
    @classmethod
    def mask_pii(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return mask_recipient(v)


class AdminSubscriberList(BaseModel):
    """Paginowana lista subskrybentów."""

    items: list[AdminSubscriberItem]
    total_count: int


class AdminNotificationItem(BaseModel):
    """Wpis logu powiadomień w widoku admina."""

    id: int
    event_id: int | None
    subscriber_id: int | None
    channel: str
    recipient: str
    message_text: str | None
    status: str
    sent_at: datetime
    error_message: str | None

    model_config = {"from_attributes": True}


class AdminNotificationList(BaseModel):
    """Paginowana lista powiadomień."""

    items: list[AdminNotificationItem]
    total_count: int


class UserItem(BaseModel):
    """Dane użytkownika w widoku admina."""

    id: int
    username: str
    full_name: str | None
    role: str
    department: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserListResponse(BaseModel):
    """Paginowana lista użytkowników."""

    items: list[UserItem]
    total_count: int


_DEPT_CODE_RE = re.compile(r"^[A-Z][A-Z0-9]{0,4}$")


def _validate_dept_format(v: str | None) -> str | None:
    if v is None:
        return v
    v = v.strip().upper()
    if not _DEPT_CODE_RE.match(v):
        raise ValueError("Kod działu: wielkie litery i cyfry, max 5 znaków, musi zaczynać się od litery.")
    return v


class CreateUserBody(BaseModel):
    """Dane do tworzenia nowego konta użytkownika."""

    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=12, max_length=128)
    full_name: str | None = None
    role: Literal["admin", "dispatcher"] = "dispatcher"
    department: str | None = Field(default=None, max_length=5)

    @field_validator("department", mode="after")
    @classmethod
    def validate_dept_format(cls, v: str | None) -> str | None:
        return _validate_dept_format(v)

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Hasło musi zawierać co najmniej jedną wielką literę (A-Z)")
        if not re.search(r"[a-z]", v):
            raise ValueError("Hasło musi zawierać co najmniej jedną małą literę (a-z)")
        if not re.search(r"\d", v):
            raise ValueError("Hasło musi zawierać co najmniej jedną cyfrę (0-9)")
        return v


class UpdateUserBody(BaseModel):
    """Pola do aktualizacji konta (rola, status, imię lub reset hasła)."""

    role: Literal["admin", "dispatcher"] | None = None
    is_active: bool | None = None
    full_name: str | None = None
    department: str | None = Field(default=None, max_length=5)
    new_password: str | None = None

    @field_validator("department", mode="after")
    @classmethod
    def validate_dept_format(cls, v: str | None) -> str | None:
        return _validate_dept_format(v)

    @field_validator("new_password")
    @classmethod
    def new_password_complexity(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if len(v) < 12:
            raise ValueError("Hasło musi mieć co najmniej 12 znaków")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Hasło musi zawierać co najmniej jedną wielką literę (A-Z)")
        if not re.search(r"[a-z]", v):
            raise ValueError("Hasło musi zawierać co najmniej jedną małą literę (a-z)")
        if not re.search(r"\d", v):
            raise ValueError("Hasło musi zawierać co najmniej jedną cyfrę (0-9)")
        return v


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _resolve_department(code: str | None, db: AsyncSession) -> str | None:
    """Zwraca code jeśli dział istnieje w DB, rzuca 422 gdy nie."""
    if code is None:
        return None
    result = await db.execute(select(Department).where(Department.code == code))
    dept = result.scalar_one_or_none()
    if dept is None:
        logger.error("Nieznany kod działu: %r — brak w tabeli departments", code)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Dział o kodzie '{code}' nie istnieje. Dodaj go najpierw w zakładce Działy.",
        )
    return code


# ---------------------------------------------------------------------------
# Endpointy — statystyki, subskrybenci, powiadomienia
# ---------------------------------------------------------------------------


@router.get("/stats", response_model=StatsResponse)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> StatsResponse:
    """Zwraca podstawowe statystyki systemu."""
    total_subscribers_result = await db.execute(select(func.count()).select_from(Subscriber))
    total_subscribers: int = total_subscribers_result.scalar_one()

    active_events_result = await db.execute(
        select(func.count())
        .select_from(Event)
        .where(or_(Event.status == "zgloszona", Event.status == "w_naprawie"))
    )
    active_events: int = active_events_result.scalar_one()

    notifications_sent_result = await db.execute(
        select(func.count())
        .select_from(NotificationLog)
        .where(NotificationLog.status == "sent")
    )
    notifications_sent: int = notifications_sent_result.scalar_one()

    logger.debug(
        "Admin stats: subscribers=%d active_events=%d notifications_sent=%d",
        total_subscribers,
        active_events,
        notifications_sent,
    )

    return StatsResponse(
        total_subscribers=total_subscribers,
        active_events=active_events,
        notifications_sent=notifications_sent,
    )


@router.get("/subscribers", response_model=AdminSubscriberList)
async def list_subscribers(
    skip: int = 0,
    limit: int = 20,
    search: str | None = None,
    channel: str | None = Query(None, pattern="^(sms|email)$"),
    night_only: bool = False,
    street_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> AdminSubscriberList:
    """Zwraca paginowaną listę subskrybentów (posortowanych od najnowszych)."""
    filters = []
    if search:
        escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        filters.append(
            or_(
                Subscriber.email.ilike(pattern, escape="\\"),
                Subscriber.phone.ilike(pattern, escape="\\"),
            )
        )
    if channel == "sms":
        filters.append(Subscriber.notify_by_sms.is_(True))
    elif channel == "email":
        filters.append(Subscriber.notify_by_email.is_(True))
    if night_only:
        filters.append(Subscriber.night_sms_consent.is_(True))
    if street_filter:
        subq = select(SubscriberAddress.subscriber_id).where(
            SubscriberAddress.street_name == street_filter
        )
        filters.append(Subscriber.id.in_(subq))

    count_stmt = select(func.count()).select_from(Subscriber)
    data_stmt = (
        select(Subscriber)
        .options(selectinload(Subscriber.addresses))
        .order_by(Subscriber.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    if filters:
        count_stmt = count_stmt.where(*filters)
        data_stmt = data_stmt.where(*filters)

    total_count: int = (await db.execute(count_stmt)).scalar_one()
    subscribers = list((await db.execute(data_stmt)).scalars().all())

    items = [AdminSubscriberItem.model_validate(s) for s in subscribers]
    return AdminSubscriberList(items=items, total_count=total_count)


@router.get("/notifications", response_model=AdminNotificationList)
async def list_notifications(
    skip: int = 0,
    limit: int = 20,
    search: str | None = None,
    channel: str | None = Query(None, pattern="^(sms|email)$"),
    status_filter: str | None = None,
    period: str | None = Query(None, pattern="^(today|last7)$"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> AdminNotificationList:
    """Zwraca paginowany log powiadomień (posortowanych malejąco po sent_at)."""
    filters = []
    if channel:
        filters.append(NotificationLog.channel == channel)
    if status_filter:
        filters.append(NotificationLog.status == status_filter)
    if search:
        escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        filters.append(
            or_(
                NotificationLog.recipient.ilike(pattern, escape="\\"),
                NotificationLog.message_text.ilike(pattern, escape="\\"),
            )
        )
    if period == "today":
        tz = ZoneInfo("Europe/Warsaw")
        today_date = datetime.now(tz).date()
        day_start = datetime(today_date.year, today_date.month, today_date.day, tzinfo=tz)
        filters.append(NotificationLog.sent_at >= day_start.astimezone(timezone.utc).replace(tzinfo=None))
    elif period == "last7":
        filters.append(NotificationLog.sent_at >= datetime.utcnow() - timedelta(days=7))

    count_stmt = select(func.count()).select_from(NotificationLog)
    data_stmt = select(NotificationLog).order_by(NotificationLog.sent_at.desc()).offset(skip).limit(limit)
    if filters:
        count_stmt = count_stmt.where(*filters)
        data_stmt = data_stmt.where(*filters)

    total_count: int = (await db.execute(count_stmt)).scalar_one()
    notifications = list((await db.execute(data_stmt)).scalars().all())

    items = [AdminNotificationItem.model_validate(n) for n in notifications]
    return AdminNotificationList(items=items, total_count=total_count)


# ---------------------------------------------------------------------------
# Endpointy — zarządzanie użytkownikami
# ---------------------------------------------------------------------------


@router.get("/users", response_model=UserListResponse)
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> UserListResponse:
    """Zwraca listę wszystkich kont użytkowników (login, rola, data utworzenia)."""
    total_result = await db.execute(select(func.count()).select_from(User))
    total_count: int = total_result.scalar_one()

    users_result = await db.execute(
        select(User).order_by(User.created_at.desc())
    )
    users = list(users_result.scalars().all())

    items = [UserItem.model_validate(u) for u in users]
    return UserListResponse(items=items, total_count=total_count)


@router.post("/users", response_model=UserItem, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: CreateUserBody,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> UserItem:
    """Tworzy nowe konto użytkownika (admin lub dyspozytor)."""
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Użytkownik o tej nazwie już istnieje",
        )

    dept_code = await _resolve_department(body.department, db)

    new_user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
        department=dept_code,
        is_active=True,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    logger.info("Utworzono nowego użytkownika: %s (rola=%s, dział=%s)", new_user.username, new_user.role, new_user.department)
    return UserItem.model_validate(new_user)


@router.patch("/users/{user_id}", response_model=UserItem)
async def update_user(
    user_id: int,
    body: UpdateUserBody,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> UserItem:
    """Zmienia rolę lub status aktywności konta użytkownika."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Użytkownik nie istnieje")

    if body.role is not None:
        # Chroń przed degradacją ostatniego admina
        if user.role == "admin" and body.role != "admin":
            admin_count_result = await db.execute(
                select(func.count()).select_from(User).where(User.role == "admin", User.is_active == True)  # noqa: E712
            )
            if admin_count_result.scalar_one() <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Nie można zmienić roli ostatniego aktywnego administratora",
                )
        user.role = body.role

    if body.is_active is not None:
        # Chroń przed dezaktywacją ostatniego admina
        if user.role == "admin" and not body.is_active:
            admin_count_result = await db.execute(
                select(func.count()).select_from(User).where(User.role == "admin", User.is_active == True)  # noqa: E712
            )
            if admin_count_result.scalar_one() <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Nie można dezaktywować ostatniego aktywnego administratora",
                )
        user.is_active = body.is_active

    if "full_name" in body.model_fields_set:
        user.full_name = body.full_name or None

    if "department" in body.model_fields_set:
        user.department = await _resolve_department(body.department, db)

    if body.new_password is not None:
        user.password_hash = hash_password(body.new_password)

    db.add(user)
    await db.commit()
    await db.refresh(user)

    logger.info(
        "Admin id=%d zaktualizował konto id=%d (username=%s): rola=%s, aktywny=%s",
        current_admin.id, user.id, user.username, user.role, user.is_active,
    )
    return UserItem.model_validate(user)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> None:
    """Usuwa konto użytkownika. Nie można usunąć własnego konta ani ostatniego admina."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Użytkownik nie istnieje")

    if user.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nie można usunąć własnego konta",
        )

    if user.role == "admin":
        admin_count_result = await db.execute(
            select(func.count()).select_from(User).where(User.role == "admin")
        )
        if admin_count_result.scalar_one() <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nie można usunąć ostatniego konta administratora",
            )

    await db.delete(user)
    await db.commit()

    logger.info("Admin id=%d usunął konto id=%d (username=%s)", current_admin.id, user_id, user.username)


# ---------------------------------------------------------------------------
# Audit log — połączenie BuildingAuditLog + StreetAuditLog + EventHistory
# ---------------------------------------------------------------------------

_MAX_AUDIT_PER_SOURCE = 2000


class AuditLogItem(BaseModel):
    """Pojedynczy wpis ujednoliconego logu operacji."""

    id: int
    source: str  # 'building' | 'street' | 'event'
    entity_id: int
    action: str
    user_id: int | None
    username: str | None
    full_name: str | None
    timestamp: datetime
    old_data: dict | None
    new_data: dict | None
    note: str | None = None

    model_config = {"from_attributes": True}


class AuditLogList(BaseModel):
    items: list[AuditLogItem]
    total_count: int


@router.get("/audit-logs", response_model=AuditLogList)
async def list_audit_logs(
    skip: int = 0,
    limit: int = 20,
    source: str | None = Query(None, pattern="^(building|street|event)$"),
    user_filter: str | None = None,
    action_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> AuditLogList:
    """Ujednolicony log audytowy: operacje na budynkach, ulicach i zmiany statusów zdarzeń. TYLKO admin."""
    items: list[AuditLogItem] = []

    # Wstępna filtracja user_id z username, jeśli podany
    filtered_user_ids: set[int] | None = None
    if user_filter:
        uf_escaped = user_filter.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        ur = await db.execute(
            select(User.id).where(User.username.ilike(f"%{uf_escaped}%", escape="\\"))
        )
        filtered_user_ids = {row[0] for row in ur.all()}

    # --- Building audit log ---
    if source in (None, "building"):
        stmt = (
            select(BuildingAuditLog, User.username, User.full_name)
            .outerjoin(User, BuildingAuditLog.user_id == User.id)
            .order_by(BuildingAuditLog.timestamp.desc())
            .limit(_MAX_AUDIT_PER_SOURCE)
        )
        if action_filter:
            stmt = stmt.where(BuildingAuditLog.action == action_filter)
        if filtered_user_ids is not None:
            stmt = stmt.where(BuildingAuditLog.user_id.in_(filtered_user_ids))
        result = await db.execute(stmt)
        for log, username, full_name in result.all():
            items.append(AuditLogItem(
                id=log.id,
                source="building",
                entity_id=log.building_id,
                action=log.action,
                user_id=log.user_id,
                username=username,
                full_name=full_name,
                timestamp=log.timestamp,
                old_data=log.old_data,
                new_data=log.new_data,
            ))

    # --- Street audit log ---
    if source in (None, "street"):
        stmt = (
            select(StreetAuditLog, User.username, User.full_name)
            .outerjoin(User, StreetAuditLog.user_id == User.id)
            .order_by(StreetAuditLog.timestamp.desc())
            .limit(_MAX_AUDIT_PER_SOURCE)
        )
        if action_filter:
            stmt = stmt.where(StreetAuditLog.action == action_filter)
        if filtered_user_ids is not None:
            stmt = stmt.where(StreetAuditLog.user_id.in_(filtered_user_ids))
        result = await db.execute(stmt)
        for log, username, full_name in result.all():
            items.append(AuditLogItem(
                id=log.id,
                source="street",
                entity_id=log.street_id,
                action=log.action,
                user_id=log.user_id,
                username=username,
                full_name=full_name,
                timestamp=log.timestamp,
                old_data=log.old_data,
                new_data=log.new_data,
            ))

    # --- Event history (zmiany statusów) ---
    if source in (None, "event"):
        if action_filter is None or action_filter == "status_change":
            stmt = (
                select(EventHistory, User.username, User.full_name)
                .outerjoin(User, EventHistory.changed_by == User.id)
                .order_by(EventHistory.changed_at.desc())
                .limit(_MAX_AUDIT_PER_SOURCE)
            )
            if filtered_user_ids is not None:
                stmt = stmt.where(EventHistory.changed_by.in_(filtered_user_ids))
            result = await db.execute(stmt)
            for log, username, full_name in result.all():
                items.append(AuditLogItem(
                    id=log.id,
                    source="event",
                    entity_id=log.event_id,
                    action="status_change",
                    user_id=log.changed_by,
                    username=username,
                    full_name=full_name,
                    timestamp=log.changed_at,
                    old_data={"status": log.old_status} if log.old_status else None,
                    new_data={"status": log.new_status} if log.new_status else None,
                    note=log.note,
                ))

    items.sort(key=lambda x: x.timestamp, reverse=True)
    total_count = len(items)

    logger.debug("Audit log: %d wpisów łącznie (source=%s, user_filter=%s)", total_count, source, user_filter)
    return AuditLogList(items=items[skip: skip + limit], total_count=total_count)


# ---------------------------------------------------------------------------
# Eksport CSV
# ---------------------------------------------------------------------------


def _fmt_admin_dt(dt: datetime | None) -> str:
    """Formatuj datetime jako czas warszawski (YYYY-MM-DD HH:MM)."""
    if dt is None:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(ZoneInfo("Europe/Warsaw")).strftime("%Y-%m-%d %H:%M")


@router.get("/subscribers/export.csv", summary="Eksport CSV subskrybentów")
async def export_subscribers_csv(
    search: str | None = None,
    channel: str | None = Query(None, pattern="^(sms|email)$"),
    night_only: bool = False,
    street_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> StreamingResponse:
    """Eksportuj subskrybentów do CSV z aktywnymi filtrami (maks. 10 000). TYLKO admin."""
    filters = []
    if search:
        escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        filters.append(
            or_(
                Subscriber.email.ilike(pattern, escape="\\"),
                Subscriber.phone.ilike(pattern, escape="\\"),
            )
        )
    if channel == "sms":
        filters.append(Subscriber.notify_by_sms.is_(True))
    elif channel == "email":
        filters.append(Subscriber.notify_by_email.is_(True))
    if night_only:
        filters.append(Subscriber.night_sms_consent.is_(True))
    if street_filter:
        subq = select(SubscriberAddress.subscriber_id).where(
            SubscriberAddress.street_name == street_filter
        )
        filters.append(Subscriber.id.in_(subq))

    stmt = (
        select(Subscriber)
        .options(selectinload(Subscriber.addresses))
        .order_by(Subscriber.created_at.desc())
        .limit(10000)
    )
    if filters:
        stmt = stmt.where(*filters)
    result = await db.execute(stmt)
    subscribers = list(result.scalars().all())

    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_ALL)
    writer.writerow(["ID", "E-mail", "Telefon", "E-mail", "SMS", "RODO", "SMS nocny", "Adresy", "Data rejestracji"])
    for s in subscribers:
        addresses = "; ".join(
            f"{a.street_name} {a.house_number}" + (f"/{a.flat_number}" if a.flat_number else "")
            for a in s.addresses
        )
        writer.writerow([
            s.id,
            mask_recipient(s.email) if s.email else "",
            mask_recipient(s.phone) if s.phone else "",
            "Tak" if s.notify_by_email else "Nie",
            "Tak" if s.notify_by_sms else "Nie",
            "Tak" if s.rodo_consent else "Nie",
            "Tak" if s.night_sms_consent else "Nie",
            addresses,
            _fmt_admin_dt(s.created_at),
        ])

    csv_bytes = output.getvalue().encode("utf-8-sig")
    output.close()
    filename = f"subskrybenci_eksport_{date.today().strftime('%Y-%m-%d')}.csv"
    logger.info("Eksport CSV subskrybentów: %d rekordów", len(subscribers))
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/notifications/export.csv", summary="Eksport CSV logów powiadomień")
async def export_notifications_csv(
    search: str | None = None,
    channel: str | None = Query(None, pattern="^(sms|email)$"),
    status_filter: str | None = None,
    period: str | None = Query(None, pattern="^(today|last7)$"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> StreamingResponse:
    """Eksportuj log powiadomień do CSV z aktywnymi filtrami (maks. 10 000). TYLKO admin."""
    filters = []
    if channel:
        filters.append(NotificationLog.channel == channel)
    if status_filter:
        filters.append(NotificationLog.status == status_filter)
    if search:
        escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        filters.append(
            or_(
                NotificationLog.recipient.ilike(pattern, escape="\\"),
                NotificationLog.message_text.ilike(pattern, escape="\\"),
            )
        )
    if period == "today":
        tz = ZoneInfo("Europe/Warsaw")
        today_date = datetime.now(tz).date()
        day_start = datetime(today_date.year, today_date.month, today_date.day, tzinfo=tz)
        filters.append(NotificationLog.sent_at >= day_start.astimezone(timezone.utc).replace(tzinfo=None))
    elif period == "last7":
        filters.append(NotificationLog.sent_at >= datetime.utcnow() - timedelta(days=7))

    stmt = select(NotificationLog).order_by(NotificationLog.sent_at.desc()).limit(10000)
    if filters:
        stmt = stmt.where(*filters)
    result = await db.execute(stmt)
    notifications = list(result.scalars().all())

    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_ALL)
    writer.writerow(["ID", "Data wysyłki", "Kanał", "Odbiorca", "Status", "Zdarzenie ID", "Subskrybent ID", "Treść", "Błąd"])
    for n in notifications:
        writer.writerow([
            n.id,
            _fmt_admin_dt(n.sent_at),
            n.channel,
            n.recipient,
            n.status,
            n.event_id if n.event_id is not None else "",
            n.subscriber_id if n.subscriber_id is not None else "",
            n.message_text or "",
            n.error_message or "",
        ])

    csv_bytes = output.getvalue().encode("utf-8-sig")
    output.close()
    filename = f"powiadomienia_eksport_{date.today().strftime('%Y-%m-%d')}.csv"
    logger.info("Eksport CSV powiadomień: %d rekordów", len(notifications))
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/audit-logs/export.csv", summary="Eksport CSV logów audytowych")
async def export_audit_logs_csv(
    source: str | None = Query(None, pattern="^(building|street|event)$"),
    action_filter: str | None = None,
    user_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> StreamingResponse:
    """Eksportuj logi audytowe do CSV z aktywnymi filtrami (maks. 2000 na źródło). TYLKO admin."""
    items: list[AuditLogItem] = []

    filtered_user_ids: set[int] | None = None
    if user_filter:
        uf_escaped = user_filter.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        ur = await db.execute(
            select(User.id).where(User.username.ilike(f"%{uf_escaped}%", escape="\\"))
        )
        filtered_user_ids = {row[0] for row in ur.all()}

    if source in (None, "building"):
        stmt = (
            select(BuildingAuditLog, User.username, User.full_name)
            .outerjoin(User, BuildingAuditLog.user_id == User.id)
            .order_by(BuildingAuditLog.timestamp.desc())
            .limit(_MAX_AUDIT_PER_SOURCE)
        )
        if action_filter:
            stmt = stmt.where(BuildingAuditLog.action == action_filter)
        if filtered_user_ids is not None:
            stmt = stmt.where(BuildingAuditLog.user_id.in_(filtered_user_ids))
        result = await db.execute(stmt)
        for log, username, full_name in result.all():
            items.append(AuditLogItem(
                id=log.id, source="building", entity_id=log.building_id,
                action=log.action, user_id=log.user_id, username=username, full_name=full_name,
                timestamp=log.timestamp, old_data=log.old_data, new_data=log.new_data,
            ))

    if source in (None, "street"):
        stmt = (
            select(StreetAuditLog, User.username, User.full_name)
            .outerjoin(User, StreetAuditLog.user_id == User.id)
            .order_by(StreetAuditLog.timestamp.desc())
            .limit(_MAX_AUDIT_PER_SOURCE)
        )
        if action_filter:
            stmt = stmt.where(StreetAuditLog.action == action_filter)
        if filtered_user_ids is not None:
            stmt = stmt.where(StreetAuditLog.user_id.in_(filtered_user_ids))
        result = await db.execute(stmt)
        for log, username, full_name in result.all():
            items.append(AuditLogItem(
                id=log.id, source="street", entity_id=log.street_id,
                action=log.action, user_id=log.user_id, username=username, full_name=full_name,
                timestamp=log.timestamp, old_data=log.old_data, new_data=log.new_data,
            ))

    if source in (None, "event"):
        if action_filter is None or action_filter == "status_change":
            stmt = (
                select(EventHistory, User.username, User.full_name)
                .outerjoin(User, EventHistory.changed_by == User.id)
                .order_by(EventHistory.changed_at.desc())
                .limit(_MAX_AUDIT_PER_SOURCE)
            )
            if filtered_user_ids is not None:
                stmt = stmt.where(EventHistory.changed_by.in_(filtered_user_ids))
            result = await db.execute(stmt)
            for log, username, full_name in result.all():
                items.append(AuditLogItem(
                    id=log.id, source="event", entity_id=log.event_id,
                    action="status_change", user_id=log.changed_by, username=username, full_name=full_name,
                    timestamp=log.changed_at,
                    old_data={"status": log.old_status} if log.old_status else None,
                    new_data={"status": log.new_status} if log.new_status else None,
                    note=log.note,
                ))

    items.sort(key=lambda x: x.timestamp, reverse=True)

    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_ALL)
    writer.writerow(["ID", "Data", "Źródło", "Akcja", "ID obiektu", "Użytkownik", "Imię i nazwisko", "Notatka"])
    for item in items:
        writer.writerow([
            item.id,
            _fmt_admin_dt(item.timestamp),
            item.source,
            item.action,
            item.entity_id,
            item.username or "",
            item.full_name or "",
            item.note or "",
        ])

    csv_bytes = output.getvalue().encode("utf-8-sig")
    output.close()
    filename = f"logi_audytowe_eksport_{date.today().strftime('%Y-%m-%d')}.csv"
    logger.info("Eksport CSV logów audytowych: %d rekordów (source=%s)", len(items), source)
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
