"""Schematy Pydantic dla słownika działów."""

import re

from pydantic import BaseModel, Field, field_validator

_CODE_RE = re.compile(r"^[A-Z][A-Z0-9]{0,4}$")


def _validate_code(v: str) -> str:
    v = v.strip().upper()
    if not _CODE_RE.match(v):
        raise ValueError("Kod działu: wielkie litery i cyfry, max 5 znaków, musi zaczynać się od litery.")
    return v


class DepartmentCreate(BaseModel):
    code: str = Field(min_length=1, max_length=5)
    name: str = Field(min_length=1, max_length=100)
    is_active: bool = True

    @field_validator("code", mode="after")
    @classmethod
    def validate_code(cls, v: str) -> str:
        return _validate_code(v)


class DepartmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    is_active: bool | None = None


class DepartmentResponse(BaseModel):
    id: int
    code: str
    name: str
    is_active: bool

    model_config = {"from_attributes": True}
