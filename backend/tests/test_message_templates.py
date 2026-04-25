"""Testy dla T2.2 — słownik szablonów komunikatów (/api/v1/message-templates).

Pokrywa:
- GET wymaga roli dispatcher lub admin (anon → 401).
- Filtr po event_type_id (zwraca powiązane + uniwersalne event_type_id=NULL).
- POST/PATCH/DELETE wymagają admina.
- Walidatory: kod (regex), body (sanity, brak <>).
- 409 dla duplikatu kodu.
- 400 dla event_type_id wskazującego nieistniejący typ.
"""

import uuid

import pytest

from tests._auth_helpers import get_token as _token

MT_URL = "/api/v1/message-templates"
ET_URL = "/api/v1/event-types"


def _unique_code(prefix: str = "mt_test") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


@pytest.mark.asyncio
async def test_get_requires_authentication(async_client):
    """Anonim nie ma dostępu do listy szablonów."""
    res = await async_client.get(MT_URL)
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_get_allowed_for_dispatcher(async_client):
    token = await _token(async_client, "dyspozytor1", "lublin123")
    res = await async_client.get(MT_URL, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert isinstance(res.json(), list)


@pytest.mark.asyncio
async def test_create_requires_admin(async_client):
    token = await _token(async_client, "dyspozytor1", "lublin123")
    res = await async_client.post(
        MT_URL,
        json={"code": _unique_code(), "body": "Test."},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_invalid_code_rejected(async_client):
    token = await _token(async_client, "admin", "admin123")
    res = await async_client.post(
        MT_URL,
        json={"code": "BadCode With Space", "body": "X"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_body_rejects_html_chars(async_client):
    """Sanityzacja — body z < > odrzucone (XSS prevention)."""
    token = await _token(async_client, "admin", "admin123")
    res = await async_client.post(
        MT_URL,
        json={"code": _unique_code(), "body": "Treść z <script>"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_full_crud_with_event_type_filter(async_client):
    """Create universal + create typed → GET ?event_type_id zwraca oba."""
    admin_token = await _token(async_client, "admin", "admin123")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Pobierz id 'awaria' z seed
    et = await async_client.get(ET_URL)
    awaria_id = next(t["id"] for t in et.json() if t["code"] == "awaria")

    code_universal = _unique_code("uni")
    code_typed = _unique_code("typed")

    # CREATE universal (event_type_id=null)
    res = await async_client.post(
        MT_URL,
        json={"code": code_universal, "body": "Uniwersalna informacja."},
        headers=admin_headers,
    )
    assert res.status_code == 201, res.text
    universal_id = res.json()["id"]
    assert res.json()["event_type_id"] is None

    # CREATE typed (event_type_id=awaria)
    res = await async_client.post(
        MT_URL,
        json={"code": code_typed, "body": "Treść awarii.", "event_type_id": awaria_id},
        headers=admin_headers,
    )
    assert res.status_code == 201, res.text
    typed_id = res.json()["id"]

    try:
        # GET ?event_type_id=awaria → musi zawierać oba (typed AND universal)
        res = await async_client.get(
            f"{MT_URL}?event_type_id={awaria_id}",
            headers=admin_headers,
        )
        ids = {it["id"] for it in res.json()}
        assert universal_id in ids, "Filtr powinien zwracać szablony uniwersalne (NULL)"
        assert typed_id in ids, "Filtr powinien zwracać szablony powiązane z typem"

        # PATCH treści
        res = await async_client.patch(
            f"{MT_URL}/{typed_id}",
            json={"body": "Zaktualizowana treść."},
            headers=admin_headers,
        )
        assert res.status_code == 200
        assert res.json()["body"] == "Zaktualizowana treść."

        # 409 na duplikat kodu
        res = await async_client.post(
            MT_URL,
            json={"code": code_typed, "body": "Inna treść."},
            headers=admin_headers,
        )
        assert res.status_code == 409
    finally:
        await async_client.delete(f"{MT_URL}/{universal_id}", headers=admin_headers)
        await async_client.delete(f"{MT_URL}/{typed_id}", headers=admin_headers)


@pytest.mark.asyncio
async def test_create_with_unknown_event_type_id_returns_400(async_client):
    token = await _token(async_client, "admin", "admin123")
    res = await async_client.post(
        MT_URL,
        json={"code": _unique_code(), "body": "X", "event_type_id": 999999},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 400
