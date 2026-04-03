"""Schematy Pydantic dla subskrybentów powiadomień."""

from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator


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
