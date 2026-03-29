"""Schematy Pydantic dla zdarzeń (awarie, wyłączenia, remonty)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


EventType = Literal["awaria", "planowane_wylaczenie", "remont"]
EventStatus = Literal["zgloszona", "w_naprawie", "usunieta", "planowane_wylaczenie", "remont"]


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


class EventResponse(EventBase):
    """Pełna odpowiedź dla zdarzenia."""

    id: int
    created_by: int | None
    created_at: datetime
    updated_at: datetime
    history: list[EventHistoryResponse] = []

    model_config = {"from_attributes": True}
