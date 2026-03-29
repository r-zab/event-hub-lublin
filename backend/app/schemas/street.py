from pydantic import BaseModel


class StreetResponse(BaseModel):
    """Odpowiedź autocomplete dla jednej ulicy."""

    id: int
    teryt_sym_ul: str | None
    name: str
    full_name: str
    street_type: str | None
    city: str

    model_config = {"from_attributes": True}
