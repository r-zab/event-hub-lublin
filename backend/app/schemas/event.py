"""Schematy Pydantic dla zdarzeń (awarie, wyłączenia, remonty)."""

import re
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


# T2.1: typy zdarzeń są teraz dynamiczne (event_types). Walidacja istnienia kodu
# w tabeli event_types odbywa się w routerze events (FK + dodatkowy check przy create).
EventType = str
EventStatus = Literal["zgloszona", "w_naprawie", "usunieta"]

_HOUSE_NUMBER_RE = re.compile(r"^\d{1,4}[A-Za-z]?$")
_EVENT_TYPE_CODE_RE = re.compile(r"^[a-z][a-z0-9_]{0,29}$")
# Polskie litery, cyfry, spacje i znaki typowe dla nazw ulic (kropka, myślnik, apostrof)
_STREET_NAME_RE = re.compile(r"^[A-Za-zĄąĆćĘęŁłŃńÓóŚśŹźŻż0-9\s.\-']+$")


def _validate_event_type_code(v: str | None) -> str | None:
    if v is None:
        return v
    v = v.strip().lower()
    if not _EVENT_TYPE_CODE_RE.match(v):
        raise ValueError("Kod typu zdarzenia musi pasować do wzorca: małe litery, cyfry, podkreślenia.")
    return v


def _validate_house_number(v: str | None) -> str | None:
    if v is None:
        return v
    v = v.strip()
    if not _HOUSE_NUMBER_RE.match(v):
        raise ValueError("Numer budynku: max 4 cyfry z opcjonalną literą (np. '10', '10A').")
    return v


# Whitelist: polskie i łacińskie litery, cyfry, spacje, newline, podstawowa interpunkcja.
# Blokuje XSS, Template Injection i SQL-injection (OWASP A03).
_ALLOWED_TEXT_RE = re.compile(
    r"""[A-Za-zĄąĆćĘęŁłŃńÓóŚśŹźŻż0-9 \t\r\n.,!?\-()"'/%:]+"""
)


def _sanitize_text(v: str | None, field_label: str, max_len: int = 2000) -> str | None:
    """Walidacja pól tekstowych przez whitelistę dozwolonych znaków (OWASP A03)."""
    if v is None:
        return v
    v = v.strip()
    if not v:
        return v
    if len(v) > max_len:
        raise ValueError(f"{field_label} nie może przekraczać {max_len} znaków.")
    if not _ALLOWED_TEXT_RE.fullmatch(v):
        raise ValueError(
            f"{field_label} zawiera niedozwolone znaki. "
            r"Dozwolone: litery, cyfry, spacje i interpunkcja (.,!?-()\"'/%:)."
        )
    return v


def _sanitize_description(v: str | None) -> str | None:
    return _sanitize_text(v, "Opis")


def _sanitize_custom_message(v: str | None) -> str | None:
    return _sanitize_text(v, "Treść wiadomości")


def _validate_street_name_input(v: str | None) -> str | None:
    if v is None:
        return v
    v = v.strip()
    if not v:
        raise ValueError("Nazwa ulicy nie może być pusta.")
    if len(v) > 200:
        raise ValueError("Nazwa ulicy nie może przekraczać 200 znaków.")
    if not _STREET_NAME_RE.match(v):
        raise ValueError("Nazwa ulicy zawiera niedozwolone znaki.")
    return v


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
    auto_extend: bool = False
    auto_close: bool = False


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

    # estimated_end jest obowiązkowe przy tworzeniu (nadpisuje Optional z EventBase)
    estimated_end: datetime
    created_by_department: str | None = None

    @field_validator("event_type", mode="after")
    @classmethod
    def validate_event_type(cls, v: str) -> str:
        return _validate_event_type_code(v) or ""

    @field_validator("house_number_from", "house_number_to", mode="after")
    @classmethod
    def validate_house_numbers(cls, v: str | None) -> str | None:
        return _validate_house_number(v)

    @field_validator("description", mode="after")
    @classmethod
    def sanitize_description(cls, v: str | None) -> str | None:
        return _sanitize_description(v)

    @field_validator("custom_message", mode="after")
    @classmethod
    def sanitize_custom_message(cls, v: str | None) -> str | None:
        return _sanitize_custom_message(v)

    @field_validator("street_name", mode="after")
    @classmethod
    def validate_street_name(cls, v: str) -> str:
        return _validate_street_name_input(v)

    @field_validator("estimated_end", mode="after")
    @classmethod
    def estimated_end_not_in_past(cls, v: datetime) -> datetime:
        result = _validate_estimated_end(v)
        assert result is not None
        return result

    @model_validator(mode="after")
    def planned_requires_both_times(self) -> "EventCreate":
        if self.event_type == "planowane_wylaczenie" and self.start_time is None:
            raise ValueError(
                "Planowane wyłączenie wymaga podania czasu rozpoczęcia (start_time)."
            )
        return self

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
    auto_extend: bool | None = None
    auto_close: bool | None = None

    @field_validator("event_type", mode="after")
    @classmethod
    def validate_event_type(cls, v: str | None) -> str | None:
        return _validate_event_type_code(v)

    @field_validator("house_number_from", "house_number_to", mode="after")
    @classmethod
    def validate_house_numbers(cls, v: str | None) -> str | None:
        return _validate_house_number(v)

    @field_validator("description", mode="after")
    @classmethod
    def sanitize_description(cls, v: str | None) -> str | None:
        return _sanitize_description(v)

    @field_validator("custom_message", mode="after")
    @classmethod
    def sanitize_custom_message(cls, v: str | None) -> str | None:
        return _sanitize_custom_message(v)

    @field_validator("street_name", mode="after")
    @classmethod
    def validate_street_name(cls, v: str | None) -> str | None:
        return _validate_street_name_input(v)

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
    created_by_department: str | None = None
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
