"""Schematy Pydantic dla zdarzeń (awarie, wyłączenia, remonty)."""

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, field_serializer, field_validator, model_validator


def _utc_iso(dt: datetime | None) -> str | None:
    """Serializuj datetime jako ISO z jawnym +00:00 (UTC).

    PostgreSQL zwraca naive datetime (bez tzinfo). JS parsuje string bez strefy
    jako czas LOKALNY — stąd błąd przesunięcia +2h w przeglądarce.
    Dodanie '+00:00' wymusza interpretację UTC zarówno w JS jak i narzędziach.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


EventType = Literal["awaria", "planowane_wylaczenie", "remont"]
EventStatus = Literal["zgloszona", "w_naprawie", "usunieta"]


class EventBase(BaseModel):
    """Wspólne pola zdarzenia."""

    event_type: EventType
    source: str = "mpwik"
    street_id: int | None = None
    street_name: str
    house_number_from: str | None = None
    house_number_to: str | None = None
    description: str | None = None
    status: EventStatus = "zgloszona"
    start_time: datetime | None = None
    estimated_end: datetime | None = None
    geojson_segment: dict | None = None
    custom_message: str | None = None


def _to_utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def _validate_end_after_start(start_time: datetime | None, estimated_end: datetime | None) -> None:
    """Sprawdź, że estimated_end jest późniejszy niż start_time."""
    if start_time is None or estimated_end is None:
        return
    if _to_utc(estimated_end) <= _to_utc(start_time):
        raise ValueError("Szacowany czas zakończenia nie może być wcześniejszy niż czas rozpoczęcia prac.")


def _validate_start_time_for_planned(event_type: str | None, start_time: datetime | None) -> None:
    """Blokuj start_time w przeszłości dla planowanych wyłączeń."""
    if event_type != "planowane_wylaczenie" or start_time is None:
        return
    v_utc = start_time.replace(tzinfo=timezone.utc) if start_time.tzinfo is None else start_time.astimezone(timezone.utc)
    if v_utc < datetime.now(timezone.utc):
        raise ValueError("Czas rozpoczęcia prac planowanych nie może być datą wsteczną.")


def _validate_estimated_end(v: datetime | None) -> datetime | None:
    """Sprawdź, że estimated_end nie jest datą wsteczną względem teraz (UTC)."""
    if v is None:
        return v
    # Unifikuj do aware UTC — DB wysyła naive (zakładamy UTC), frontend może wysłać aware
    if v.tzinfo is None:
        v_utc = v.replace(tzinfo=timezone.utc)
    else:
        v_utc = v.astimezone(timezone.utc)
    if v_utc < datetime.now(timezone.utc):
        raise ValueError("Czas zakończenia nie może być wcześniejszy niż aktualna godzina.")
    return v


class EventCreate(EventBase):
    """Dane wymagane do utworzenia nowego zdarzenia."""

    @field_validator("estimated_end", mode="after")
    @classmethod
    def estimated_end_not_in_past(cls, v: datetime | None) -> datetime | None:
        return _validate_estimated_end(v)

    @model_validator(mode="after")
    def start_time_not_in_past_for_planned(self) -> "EventCreate":
        _validate_start_time_for_planned(self.event_type, self.start_time)
        return self

    @model_validator(mode="after")
    def end_after_start(self) -> "EventCreate":
        _validate_end_after_start(self.start_time, self.estimated_end)
        return self


class EventUpdate(BaseModel):
    """Dane do aktualizacji zdarzenia — wszystkie pola opcjonalne."""

    event_type: EventType | None = None
    source: str | None = None
    street_id: int | None = None
    street_name: str | None = None
    house_number_from: str | None = None
    house_number_to: str | None = None
    description: str | None = None
    status: EventStatus | None = None
    start_time: datetime | None = None
    estimated_end: datetime | None = None
    geojson_segment: dict | None = None
    custom_message: str | None = None

    @field_validator("estimated_end", mode="after")
    @classmethod
    def estimated_end_not_in_past(cls, v: datetime | None) -> datetime | None:
        return _validate_estimated_end(v)

    @model_validator(mode="after")
    def start_time_not_in_past_for_planned(self) -> "EventUpdate":
        _validate_start_time_for_planned(self.event_type, self.start_time)
        return self

    @model_validator(mode="after")
    def end_after_start(self) -> "EventUpdate":
        _validate_end_after_start(self.start_time, self.estimated_end)
        return self


class EventHistoryResponse(BaseModel):
    """Wpis historii zmiany statusu zdarzenia."""

    id: int
    old_status: str | None
    new_status: str | None
    changed_by: int | None
    changed_at: datetime
    note: str | None

    model_config = {"from_attributes": True}

    @field_serializer("changed_at", when_used="json")
    def serialize_changed_at(self, v: datetime) -> str | None:
        return _utc_iso(v)


class EventResponse(EventBase):
    """Pełna odpowiedź dla zdarzenia."""

    id: int
    created_by: int | None
    created_at: datetime
    updated_at: datetime
    history: list[EventHistoryResponse] = []
    street_geojson: dict | None = None
    notified_count: int = 0

    model_config = {"from_attributes": True}

    @field_serializer("estimated_end", "start_time", when_used="json")
    def serialize_estimated_end(self, v: datetime | None) -> str | None:
        return _utc_iso(v)

    @field_serializer("created_at", "updated_at", when_used="json")
    def serialize_timestamps(self, v: datetime) -> str | None:
        return _utc_iso(v)


class PaginatedEventResponse(BaseModel):
    items: list[EventResponse]
    total_count: int
