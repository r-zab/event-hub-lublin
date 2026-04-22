"""Tests for GET /api/v1/streets — SQL LIKE injection protection (P11)."""

import pytest

STREETS_URL = "/api/v1/streets"


@pytest.mark.asyncio
async def test_percent_wildcard_is_escaped(async_client):
    """
    '%%%' bez escapowania pasuje do WSZYSTKICH rekordów w SQL ILIKE.
    Po naprawie (streets.py: replace('%', '\\%')) żaden wynik nie powinien wrócić,
    bo żadna ulica nie zawiera dosłownie trzech znaków procentu.
    """
    response = await async_client.get(STREETS_URL, params={"q": "%%%"})
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert len(body) == 0, (
        f"Escaping '%' nie działa — zapytanie zwróciło {len(body)} ulic zamiast 0. "
        "Możliwe, że '%' jest traktowany jako wildcard SQL."
    )


@pytest.mark.asyncio
async def test_underscore_wildcard_is_escaped(async_client):
    """
    '___' bez escapowania pasuje do każdej 3-znakowej nazwy w SQL ILIKE.
    Po naprawie (replace('_', '\\_')) lista powinna być pusta — brak ulic
    z dosłownie trzema podkreśleniami w nazwie.
    """
    response = await async_client.get(STREETS_URL, params={"q": "___"})
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert len(body) == 0, (
        f"Escaping '_' nie działa — zapytanie zwróciło {len(body)} ulic zamiast 0. "
        "Możliwe, że '_' jest traktowany jako wildcard SQL."
    )


@pytest.mark.asyncio
async def test_backslash_does_not_cause_server_error(async_client):
    """
    Trzy znaki backslash (domyślny znak escape w PostgreSQL) nie mogą powodować
    błędu składni SQL (HTTP 500). Oczekiwany wynik to 200 z pustą listą.
    """
    response = await async_client.get(STREETS_URL, params={"q": "\\" * 3})
    assert response.status_code == 200, (
        f"Backslash w zapytaniu spowodował błąd serwera: HTTP {response.status_code}"
    )
    body = response.json()
    assert isinstance(body, list)
