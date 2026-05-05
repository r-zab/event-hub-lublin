from datetime import datetime

from pydantic import BaseModel


class ApiKeyCreate(BaseModel):
    operator_name: str


class ApiKeyResponse(BaseModel):
    id: int
    operator_name: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ApiKeyCreateResponse(ApiKeyResponse):
    raw_key: str
