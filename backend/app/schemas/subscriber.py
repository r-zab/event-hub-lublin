"""Schematy Pydantic dla subskrybentów powiadomień."""

import re
from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator

_PHONE_RE = re.compile(r"^\+48\d{9}$|^\d{9}$")


class AddressCreate(BaseModel):
    """Adres subskrybenta przy rejestracji."""

    street_id: int | None = None
    street_name: str
    house_number: str
    flat_number: str | None = None


class AddressResponse(BaseModel):
    """Adres subskrybenta w odpowiedzi API."""

    id: int
    street_id: int | None
    street_name: str
    house_number: str
    flat_number: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SubscriberCreate(BaseModel):
    """Dane wymagane do rejestracji subskrybenta."""

    phone: str
    email: EmailStr
    rodo_consent: bool
    night_sms_consent: bool = False
    notify_by_email: bool = True
    notify_by_sms: bool = True
    addresses: list[AddressCreate]

    @field_validator("phone")
    @classmethod
    def phone_format(cls, v: str) -> str:
        """Akceptuje 9 cyfr (123456789) lub +48 i 9 cyfr (+48123456789)."""
        cleaned = v.strip().replace(" ", "").replace("-", "")
        if not _PHONE_RE.match(cleaned):
            raise ValueError(
                "Nieprawidłowy format numeru telefonu. "
                "Podaj 9 cyfr (np. 600000000) lub numer z prefiksem +48 (np. +48600000000)."
            )
        return cleaned

    @field_validator("rodo_consent")
    @classmethod
    def rodo_must_be_true(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Zgoda RODO jest wymagana do rejestracji.")
        return v

    @field_validator("addresses")
    @classmethod
    def addresses_not_empty(cls, v: list[AddressCreate]) -> list[AddressCreate]:
        if not v:
            raise ValueError("Musisz podać co najmniej jeden adres.")
        return v


class SubscriberResponse(BaseModel):
    """Pełna odpowiedź dla subskrybenta."""

    id: int
    phone: str
    email: str
    rodo_consent: bool
    night_sms_consent: bool
    notify_by_email: bool
    notify_by_sms: bool
    unsubscribe_token: str
    created_at: datetime
    addresses: list[AddressResponse] = []

    model_config = {"from_attributes": True}
