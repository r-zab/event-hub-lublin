"""Testy integracyjne T3.6 — RBAC: dyspozytor vs admin na endpointach /admin/users.

Pokrywa:
- dyspozytor → 403 Forbidden na GET, POST, DELETE /api/v1/admin/users
- admin → 200 OK na GET /api/v1/admin/users
- brak tokenu → 401 Unauthorized

Cały router /admin jest chroniony przez get_current_admin (rola 'admin').
Dyspozytor (rola 'dispatcher') musi dostawać 403, nie 404 ani 200.
"""

import pytest

from tests._auth_helpers import get_token as _token

USERS_URL = "/api/v1/admin/users"
NONEXISTENT_USER_ID = 99999


# ---------------------------------------------------------------------------
# Blokada dyspozytora (DELETE)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_dispatcher_cannot_delete_user(async_client):
    """DELETE /admin/users/{id} z tokenem dyspozytora → 403 Forbidden.

    To jest kluczowy test 'DELETE zablokowany dla dyspozytora' z T3.6.
    Nawet dla nieistniejącego ID autoryzacja jest sprawdzana przed logiką biznesową.
    """
    token = await _token(async_client, "dyspozytor1", "lublin123")
    res = await async_client.delete(
        f"{USERS_URL}/{NONEXISTENT_USER_ID}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403, (
        f"Dyspozytor NIE może usuwać użytkowników — oczekiwano 403, "
        f"otrzymano {res.status_code}: {res.text}"
    )


# ---------------------------------------------------------------------------
# Blokada dyspozytora (CRUD users)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_dispatcher_cannot_list_users(async_client):
    """GET /admin/users z tokenem dyspozytora → 403 Forbidden."""
    token = await _token(async_client, "dyspozytor1", "lublin123")
    res = await async_client.get(
        USERS_URL, headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 403, (
        f"Dyspozytor NIE może pobierać listy użytkowników — "
        f"oczekiwano 403, otrzymano {res.status_code}: {res.text}"
    )


@pytest.mark.asyncio
async def test_dispatcher_cannot_create_user(async_client):
    """POST /admin/users z tokenem dyspozytora → 403 Forbidden.

    Autoryzacja RBAC jest sprawdzana przed parsowaniem body → 403 nawet
    gdy body jest poprawne. Żaden krok tworzenia konta nie jest wykonywany.
    """
    token = await _token(async_client, "dyspozytor1", "lublin123")
    res = await async_client.post(
        USERS_URL,
        headers={"Authorization": f"Bearer {token}"},
        json={
            "username": "ghost_rbac_test",
            "password": "GhostPass123",
            "role": "dispatcher",
        },
    )
    assert res.status_code == 403, (
        f"Dyspozytor NIE może tworzyć użytkowników — "
        f"oczekiwano 403, otrzymano {res.status_code}: {res.text}"
    )


@pytest.mark.asyncio
async def test_dispatcher_cannot_patch_user(async_client):
    """PATCH /admin/users/{id} z tokenem dyspozytora → 403 Forbidden."""
    token = await _token(async_client, "dyspozytor1", "lublin123")
    res = await async_client.patch(
        f"{USERS_URL}/{NONEXISTENT_USER_ID}",
        headers={"Authorization": f"Bearer {token}"},
        json={"full_name": "Ghost"},
    )
    assert res.status_code == 403, (
        f"Dyspozytor NIE może edytować użytkowników — "
        f"oczekiwano 403, otrzymano {res.status_code}: {res.text}"
    )


# ---------------------------------------------------------------------------
# Admin ma dostęp
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_can_list_users(async_client):
    """GET /admin/users z tokenem admina → 200 OK, lista z polami items + total_count."""
    token = await _token(async_client, "admin", "admin123")
    res = await async_client.get(
        USERS_URL, headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200, (
        f"Admin POWINIEN mieć dostęp do listy użytkowników — "
        f"HTTP {res.status_code}: {res.text}"
    )
    body = res.json()
    assert "items" in body, "Brak klucza 'items' w odpowiedzi"
    assert isinstance(body["items"], list)
    assert "total_count" in body


# ---------------------------------------------------------------------------
# Brak tokenu
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_unauthenticated_cannot_access_admin_users(async_client):
    """GET /admin/users bez tokenu → 401 Unauthorized."""
    res = await async_client.get(USERS_URL)
    assert res.status_code == 401, (
        f"Brak tokenu powinien dawać 401 — HTTP {res.status_code}"
    )
