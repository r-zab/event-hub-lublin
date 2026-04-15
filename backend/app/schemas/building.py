"""Schematy Pydantic dla budynków (obrysy GeoJSON)."""

from pydantic import BaseModel, computed_field


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
