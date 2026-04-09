"""Schematy Pydantic dla budynków (obrysy GeoJSON)."""

from pydantic import BaseModel


class BuildingResponse(BaseModel):
    """Obrys budynku dla danej ulicy."""

    id: int
    house_number: str | None
    geojson_polygon: dict | None

    model_config = {"from_attributes": True}
