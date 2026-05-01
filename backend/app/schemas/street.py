import re

from pydantic import BaseModel, field_validator

# Polskie litery, cyfry, spacje i typowe znaki w nazwach ulic (., -, ', /)
_STREET_NAME_RE = re.compile(r"^[A-Za-zĄąĆćĘęŁłŃńÓóŚśŹźŻż0-9\s.\-'/]+$")

# Numer budynku: max 5 znaków, zaczyna się od cyfry, tylko cyfry/WIELKIE litery/slash
_HOUSE_NUM_RE = re.compile(r"^\d[A-Z0-9/]*$")


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


def _validate_house_number(v: str | None) -> str | None:
    """Walidacja numeru budynku — Zero Trust, używane w endpointach przyjmujących nr domu."""
    if v is None:
        return v
    v = v.strip()
    if not v:
        return v
    if len(v) > 5:
        raise ValueError("Numer budynku nie może przekraczać 5 znaków.")
    if not _HOUSE_NUM_RE.match(v):
        raise ValueError(
            "Numer budynku musi zaczynać się od cyfry i zawierać tylko cyfry, "
            "wielkie litery oraz ukośnik '/'."
        )
    return v


class StreetCreate(BaseModel):
    """Dane do utworzenia nowej ulicy przez dyspozytora/admina."""

    name: str
    street_type: str | None = None
    city: str = "Lublin"

    @field_validator("name", mode="after")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return _validate_name(v)  # type: ignore[return-value]


class StreetUpdate(BaseModel):
    """Dane do aktualizacji ulicy — wszystkie pola opcjonalne."""

    name: str | None = None
    street_type: str | None = None
    city: str | None = None
    teryt_sym_ul: str | None = None

    @field_validator("name", mode="after")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        return _validate_name(v)

    @field_validator("teryt_sym_ul", mode="after")
    @classmethod
    def validate_teryt(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) > 20:
            raise ValueError("Kod TERYT nie może przekraczać 20 znaków.")
        return v


class StreetResponse(BaseModel):
    """Odpowiedź autocomplete dla jednej ulicy."""

    id: int
    teryt_sym_ul: str | None
    name: str
    full_name: str
    street_type: str | None
    city: str

    model_config = {"from_attributes": True}


class StreetAdminItem(BaseModel):
    """Rozszerzony widok ulicy dla panelu zarządzania (admin/dyspozytor)."""

    id: int
    teryt_sym_ul: str | None
    name: str
    full_name: str
    street_type: str | None
    city: str
    geocoded: bool  # True gdy geojson IS NOT NULL (trasa z OSM)

    model_config = {"from_attributes": True}


class StreetPageResponse(BaseModel):
    """Paginowana lista ulic dla panelu admin/dyspozytor."""

    items: list[StreetAdminItem]
    total_count: int
