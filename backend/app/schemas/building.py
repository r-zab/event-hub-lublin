"""Schematy Pydantic dla budynków (obrysy GeoJSON)."""

import re

from pydantic import BaseModel, computed_field, field_validator

_HOUSE_NUMBER_RE = re.compile(r'^[0-9][A-Z0-9]{0,4}$')


class BuildingResponse(BaseModel):
    """Obrys budynku dla danej ulicy (używany w AdminEventForm)."""

    id: int
    house_number: str | None
    geom_type: str
    geojson_polygon: dict | None
    geojson_point: dict | None

    model_config = {"from_attributes": True}


class BuildingBboxResponse(BaseModel):
    """Pełna odpowiedź budynku dla widoku mapy (bbox query)."""

    id: int
    street_id: int | None
    street_name: str | None
    house_number: str | None
    geom_type: str
    geojson_polygon: dict | None
    geojson_point: dict | None

    @computed_field
    @property
    def has_address(self) -> bool:
        """True gdy budynek ma przypisaną ulicę i numer."""
        return bool(self.street_name and self.house_number)

    model_config = {"from_attributes": True}


class BuildingUpdate(BaseModel):
    """Pola do ręcznej aktualizacji adresu budynku przez dyspozytora/admina."""

    street_id: int | None = None
    street_name: str | None = None
    house_number: str | None = None

    @field_validator('house_number')
    @classmethod
    def validate_house_number(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if not _HOUSE_NUMBER_RE.match(v):
            raise ValueError(
                "Numer budynku musi zaczynać się od cyfry i mieć max 5 znaków"
            )
        return v
