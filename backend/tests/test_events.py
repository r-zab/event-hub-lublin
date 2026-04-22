"""Tests for DELETE /api/v1/events/{id} — RBAC authorization."""

import pytest

LOGIN_URL = "/api/v1/auth/login"
EVENTS_URL = "/api/v1/events"
FORM_HEADERS = {"Content-Type": "application/x-www-form-urlencoded"}
NONEXISTENT_ID = 99999


async def _get_token(async_client, username: str, password: str) -> str:
    """Loguje użytkownika i zwraca access token."""
    response = await async_client.post(
        LOGIN_URL,
        data={"username": username, "password": password},
        headers=FORM_HEADERS,
    )
    assert response.status_code == 200, (
        f"Login nie powiódł się dla '{username}': HTTP {response.status_code} — "
        f"upewnij się, że konto istnieje (python -m scripts.setup_dev_users)."
    )
    return response.json()["access_token"]


@pytest.mark.asyncio
async def test_dispatcher_delete_nonexistent_event_returns_404(async_client):
    """
    Dyspozytor MA uprawnienia do usuwania zdarzeń (get_current_dispatcher_or_admin).
    Przy próbie usunięcia nieistniejącego zdarzenia serwer powinien zwrócić 404,
    co dowodzi, że warstwa autoryzacji przepuściła żądanie (nie 401 ani 403).
    """
    token = await _get_token(async_client, "dyspozytor1", "lublin123")
    response = await async_client.delete(
        f"{EVENTS_URL}/{NONEXISTENT_ID}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 404, (
        f"Oczekiwano 404 (autoryzacja OK, brak zdarzenia), "
        f"otrzymano HTTP {response.status_code}. "
        "Jeśli 403 — dyspozytor utracił uprawnienie DELETE (sprawdź get_current_dispatcher_or_admin). "
        "Jeśli 401 — token nie był przyjęty."
    )


@pytest.mark.asyncio
async def test_unauthenticated_delete_returns_401(async_client):
    """
    Żądanie DELETE bez nagłówka Authorization musi być odrzucone przez OAuth2PasswordBearer
    z kodem 401 Unauthorized, zanim serwer sprawdzi, czy zdarzenie istnieje.
    """
    response = await async_client.delete(f"{EVENTS_URL}/{NONEXISTENT_ID}")
    assert response.status_code == 401, (
        f"Oczekiwano 401 (brak tokena), otrzymano HTTP {response.status_code}."
    )
