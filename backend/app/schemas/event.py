"""Schematy Pydantic dla zdarzeń (awarie, wyłączenia, remonty)."""

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, field_serializer


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


class EventCreate(EventBase):
    """Dane wymagane do utworzenia nowego zdarzenia."""


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
