import re

from pydantic import BaseModel, field_validator

_STREET_NAME_RE = re.compile(r"^[A-Za-zĄąĆćĘęŁłŃńÓóŚśŹźŻż0-9\s.\-']+$")


def _validate_name(v: str | None) -> str | None:
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


class StreetCreate(BaseModel):
    """Dane do utworzenia nowej ulicy przez dyspozytora/admina."""

    name: str
    street_type: str | None = None
    city: str = "Lublin"

    @field_validator("name", mode="after")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return _validate_name(v)


class StreetUpdate(BaseModel):
    """Dane do aktualizacji ulicy — wszystkie pola opcjonalne."""

    name: str | None = None
    street_type: str | None = None
    city: str | None = None

    @field_validator("name", mode="after")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        return _validate_name(v)


class StreetResponse(BaseModel):
    """Odpowiedź autocomplete dla jednej ulicy."""

    id: int
    teryt_sym_ul: str | None
    name: str
    full_name: str
    street_type: str | None
    city: str

    model_config = {"from_attributes": True}
