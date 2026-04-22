"""Tests for POST /api/v1/auth/login."""

import pytest

LOGIN_URL = "/api/v1/auth/login"
FORM_HEADERS = {"Content-Type": "application/x-www-form-urlencoded"}


@pytest.mark.asyncio
async def test_login_success(async_client):
    response = await async_client.post(
        LOGIN_URL,
        data={"username": "admin", "password": "admin123"},
        headers=FORM_HEADERS,
    )
    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(async_client):
    response = await async_client.post(
        LOGIN_URL,
        data={"username": "admin", "password": "blednehaslo"},
        headers=FORM_HEADERS,
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Nieprawidłowy login lub hasło"
