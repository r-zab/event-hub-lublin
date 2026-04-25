"""Testy dla T2.1 — słownik typów zdarzeń (/api/v1/event-types).

Pokrywa:
- GET publiczny zwraca 3 zaseedowane typy.
- Walidatory: kod (regex), kolor (#RRGGBB).
- POST/PATCH/DELETE wymagają roli admin (dispatcher → 403).
- Pełen happy-path CRUD: utworzenie unikalnego typu, edycja, usunięcie.
- Konflikt 409 dla duplikatu kodu.
- Walidacja w POST /events/{} → odrzucenie nieznanego kodu typu (400).
"""

import uuid

import pytest

from tests._auth_helpers import get_token as _token

ET_URL = "/api/v1/event-types"
EVENTS_URL = "/api/v1/events"


def _unique_code(prefix: str = "test") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


@pytest.mark.asyncio
async def test_seeded_event_types_present(async_client):
    """Po migracji 20260425b w słowniku muszą być 3 obecne kody."""
    res = await async_client.get(ET_URL)
    assert res.status_code == 200
    items = res.json()
    codes = {it["code"] for it in items}
    assert {"awaria", "planowane_wylaczenie", "remont"}.issubset(codes), (
        f"Seed event_types niekompletny: znalezione kody={codes}"
    )


@pytest.mark.asyncio
async def test_create_requires_admin_role(async_client):
    """Dispatcher nie może tworzyć typów — oczekiwane 403."""
    token = await _token(async_client, "dyspozytor1", "lublin123")
    res = await async_client.post(
        ET_URL,
        json={
            "code": _unique_code(),
            "name_pl": "Test",
            "default_color_rgb": "#123456",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403, f"Oczekiwano 403, otrzymano {res.status_code}: {res.text}"


@pytest.mark.asyncio
async def test_create_unauthenticated_returns_401(async_client):
    res = await async_client.post(
        ET_URL,
        json={"code": _unique_code(), "name_pl": "X", "default_color_rgb": "#000000"},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_invalid_code_format_rejected(async_client):
    """Kod nie może zawierać wielkich liter / spacji / myślników."""
    token = await _token(async_client, "admin", "admin123")
    res = await async_client.post(
        ET_URL,
        json={"code": "Bad-Code With Space", "name_pl": "X", "default_color_rgb": "#000000"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 422, f"Oczekiwano 422, otrzymano {res.status_code}: {res.text}"


@pytest.mark.asyncio
async def test_invalid_color_format_rejected(async_client):
    token = await _token(async_client, "admin", "admin123")
    res = await async_client.post(
        ET_URL,
        json={"code": _unique_code(), "name_pl": "X", "default_color_rgb": "rgb(0,0,0)"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 422, f"Oczekiwano 422, otrzymano {res.status_code}: {res.text}"


@pytest.mark.asyncio
async def test_full_crud_happy_path(async_client):
    """End-to-end: create → list → patch → delete."""
    token = await _token(async_client, "admin", "admin123")
    headers = {"Authorization": f"Bearer {token}"}
    code = _unique_code("crud")

    # CREATE
    res = await async_client.post(
        ET_URL,
        json={
            "code": code,
            "name_pl": "Test CRUD",
            "default_color_rgb": "#abcdef",
            "is_active": True,
            "sort_order": 99,
        },
        headers=headers,
    )
    assert res.status_code == 201, f"CREATE: {res.status_code} {res.text}"
    created = res.json()
    type_id = created["id"]
    assert created["code"] == code
    assert created["default_color_rgb"] == "#ABCDEF"  # walidator upper()

    # PATCH
    res = await async_client.patch(
        f"{ET_URL}/{type_id}",
        json={"name_pl": "Updated", "is_active": False},
        headers=headers,
    )
    assert res.status_code == 200, f"PATCH: {res.status_code} {res.text}"
    assert res.json()["name_pl"] == "Updated"
    assert res.json()["is_active"] is False

    # GET only_active=false widzi nieaktywne
    res = await async_client.get(f"{ET_URL}?only_active=false", headers=headers)
    assert any(it["id"] == type_id for it in res.json())

    # GET only_active=true (domyślne) NIE pokazuje nieaktywnych
    res = await async_client.get(ET_URL)
    assert all(it["id"] != type_id for it in res.json())

    # DELETE
    res = await async_client.delete(f"{ET_URL}/{type_id}", headers=headers)
    assert res.status_code == 204, f"DELETE: {res.status_code} {res.text}"


@pytest.mark.asyncio
async def test_duplicate_code_returns_409(async_client):
    """Drugi POST z tym samym kodem → 409 Conflict."""
    token = await _token(async_client, "admin", "admin123")
    headers = {"Authorization": f"Bearer {token}"}
    code = _unique_code("dup")

    res = await async_client.post(
        ET_URL,
        json={"code": code, "name_pl": "First", "default_color_rgb": "#111111"},
        headers=headers,
    )
    assert res.status_code == 201
    type_id = res.json()["id"]

    try:
        res = await async_client.post(
            ET_URL,
            json={"code": code, "name_pl": "Second", "default_color_rgb": "#222222"},
            headers=headers,
        )
        assert res.status_code == 409, f"Oczekiwano 409, otrzymano {res.status_code}"
    finally:
        await async_client.delete(f"{ET_URL}/{type_id}", headers=headers)


@pytest.mark.asyncio
async def test_event_create_rejects_unknown_event_type(async_client):
    """T2.1 integration: POST /events z nieistniejącym kodem typu → 400."""
    token = await _token(async_client, "dyspozytor1", "lublin123")
    res = await async_client.post(
        EVENTS_URL,
        json={
            "event_type": "nieistniejacy_kod_typu",
            "street_name": "Lipowa",
            "house_number_from": "1",
            "house_number_to": "10",
            "description": "Test",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    # 400 = walidacja w routerze, 422 = pydantic odrzucił wcześniej (acceptable both)
    assert res.status_code in (400, 422), (
        f"Oczekiwano 400/422 dla nieznanego event_type, otrzymano {res.status_code}: {res.text}"
    )
