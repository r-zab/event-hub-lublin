"""Pydantic schemas for authentication."""

from pydantic import BaseModel


class LoginRequest(BaseModel):
    """Payload for JSON-based login (used in tests / non-form clients)."""

    username: str
    password: str


class Token(BaseModel):
    """Response returned after successful authentication."""

    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """Claims extracted from a decoded JWT."""

    username: str | None = None
