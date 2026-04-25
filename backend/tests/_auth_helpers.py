"""Globalny cache tokenów JWT do współdzielenia między modułami testów.

Powód: rate-limit /auth/login = 5/min. Bez wspólnego cache przy uruchomieniu kilku
plików testów per username trafiamy w 429 Too Many Requests.
"""

LOGIN_URL = "/api/v1/auth/login"
FORM_HEADERS = {"Content-Type": "application/x-www-form-urlencoded"}

_TOKEN_CACHE: dict[str, str] = {}


async def get_token(async_client, username: str, password: str) -> str:
    if username in _TOKEN_CACHE:
        return _TOKEN_CACHE[username]
    res = await async_client.post(
        LOGIN_URL,
        data={"username": username, "password": password},
        headers=FORM_HEADERS,
    )
    assert res.status_code == 200, (
        f"Login {username}: HTTP {res.status_code} — sprawdź setup_dev_users i czy nie trafiono w rate-limit."
    )
    token = res.json()["access_token"]
    _TOKEN_CACHE[username] = token
    return token
