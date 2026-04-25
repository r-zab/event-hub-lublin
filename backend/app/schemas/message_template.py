"""Schematy Pydantic dla słownika szablonów komunikatów (T2.2)."""

import re

from pydantic import BaseModel, Field, field_validator

_CODE_RE = re.compile(r"^[a-z][a-z0-9_]{0,49}$")


def _validate_code(v: str) -> str:
    v = v.strip().lower()
    if not _CODE_RE.match(v):
        raise ValueError("Kod szablonu: małe litery, cyfry i podkreślenia, max 50 znaków, musi zaczynać się od litery.")
    return v


def _validate_body(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("Treść szablonu nie może być pusta.")
    if len(v) > 2000:
        raise ValueError("Treść szablonu nie może przekraczać 2000 znaków.")
    if "<" in v or ">" in v:
        raise ValueError("Treść szablonu zawiera niedozwolone znaki (< >).")
    return v


class MessageTemplateCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    body: str
    event_type_id: int | None = None
    is_active: bool = True

    @field_validator("code", mode="after")
    @classmethod
    def validate_code(cls, v: str) -> str:
        return _validate_code(v)

    @field_validator("body", mode="after")
    @classmethod
    def validate_body(cls, v: str) -> str:
        return _validate_body(v)


class MessageTemplateUpdate(BaseModel):
    code: str | None = None
    body: str | None = None
    event_type_id: int | None = None
    is_active: bool | None = None

    @field_validator("code", mode="after")
    @classmethod
    def validate_code(cls, v: str | None) -> str | None:
        return _validate_code(v) if v is not None else None

    @field_validator("body", mode="after")
    @classmethod
    def validate_body(cls, v: str | None) -> str | None:
        return _validate_body(v) if v is not None else None


class MessageTemplateResponse(BaseModel):
    id: int
    code: str
    body: str
    event_type_id: int | None
    is_active: bool

    model_config = {"from_attributes": True}
