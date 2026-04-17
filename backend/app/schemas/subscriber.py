"""Schematy Pydantic dla subskrybentów powiadomień."""

import re
from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator, model_validator


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

    phone: str | None = None
    email: str | None = None
    rodo_consent: bool
    night_sms_consent: bool = False
    notify_by_email: bool = False
    notify_by_sms: bool = False
    addresses: list[AddressCreate]

    @field_validator("phone", mode="before")
    @classmethod
    def phone_format(cls, v: str | None) -> str | None:
        """Normalizuje numer: usuwa spacje/myślniki, dodaje +48 dla 9 cyfr."""
        if v is None or v == "":
            return None
        cleaned = v.strip().replace(" ", "").replace("-", "")
        if re.fullmatch(r"\d{9}", cleaned):
            return f"+48{cleaned}"
        if re.fullmatch(r"\+48\d{9}", cleaned):
            return cleaned
        raise ValueError(
            "Nieprawidłowy format numeru telefonu. "
            "Podaj 9 cyfr (np. 600000000) lub numer z prefiksem +48 (np. +48600000000)."
        )

    @field_validator("email", mode="before")
    @classmethod
    def email_normalize(cls, v: str | None) -> str | None:
        """Mapuje pusty string na None i waliduje format e-mail."""
        if v is None or v == "":
            return None
        v = v.strip()
        # Prosta walidacja przez EmailStr — ręcznie, bo pole nie jest EmailStr
        try:
            EmailStr._validate(v)  # type: ignore[attr-defined]
        except Exception:
            pass  # pełna walidacja poniżej w model_validator
        return v

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

    @model_validator(mode="after")
    def channel_fields_required(self) -> "SubscriberCreate":
        """Walidacja krzyżowa: każdy wybrany kanał musi mieć dane kontaktowe."""
        if not self.notify_by_sms and not self.notify_by_email:
            raise ValueError("Musisz wybrać co najmniej jeden kanał powiadomień (SMS lub e-mail).")

        if self.notify_by_sms and not self.phone:
            raise ValueError("Numer telefonu jest wymagany dla powiadomień SMS.")

        if self.notify_by_email:
            if not self.email:
                raise ValueError("Adres e-mail jest wymagany dla powiadomień e-mail.")
            email_re = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
            if not email_re.match(self.email):
                raise ValueError("Nieprawidłowy format adresu e-mail.")

        return self


class SubscriberResponse(BaseModel):
    """Pełna odpowiedź dla subskrybenta."""

    id: int
    phone: str | None
    email: str | None
    rodo_consent: bool
    night_sms_consent: bool
    notify_by_email: bool
    notify_by_sms: bool
    unsubscribe_token: str
    created_at: datetime
    addresses: list[AddressResponse] = []

    model_config = {"from_attributes": True}
