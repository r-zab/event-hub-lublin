"""Schematy Pydantic dla słownika typów zdarzeń (T2.1)."""

import re

from pydantic import BaseModel, Field, field_validator

_CODE_RE = re.compile(r"^[a-z][a-z0-9_]{0,29}$")
_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _validate_code(v: str) -> str:
    v = v.strip().lower()
    if not _CODE_RE.match(v):
        raise ValueError("Kod typu: małe litery, cyfry i podkreślenia, max 30 znaków, musi zaczynać się od litery.")
    return v


def _validate_color(v: str) -> str:
    v = v.strip()
    if not _COLOR_RE.match(v):
        raise ValueError("Kolor musi być w formacie #RRGGBB (np. #DC2626).")
    return v.upper()


class EventTypeCreate(BaseModel):
    code: str = Field(min_length=1, max_length=30)
    name_pl: str = Field(min_length=1, max_length=100)
    default_color_rgb: str
    icon_key: str | None = Field(default="alert_triangle", max_length=50)
    is_active: bool = True
    sort_order: int = 0

    @field_validator("code", mode="after")
    @classmethod
    def validate_code(cls, v: str) -> str:
        return _validate_code(v)

    @field_validator("default_color_rgb", mode="after")
    @classmethod
    def validate_color(cls, v: str) -> str:
        return _validate_color(v)


class EventTypeUpdate(BaseModel):
    name_pl: str | None = Field(default=None, min_length=1, max_length=100)
    default_color_rgb: str | None = None
    icon_key: str | None = Field(default=None, max_length=50)
    is_active: bool | None = None
    sort_order: int | None = None

    @field_validator("default_color_rgb", mode="after")
    @classmethod
    def validate_color(cls, v: str | None) -> str | None:
        return _validate_color(v) if v is not None else None


class EventTypeResponse(BaseModel):
    id: int
    code: str
    name_pl: str
    default_color_rgb: str
    icon_key: str | None = "alert_triangle"
    is_active: bool
    sort_order: int

    model_config = {"from_attributes": True}
