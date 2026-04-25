"""Test dla T2.3 — przycisk "Zakończ" wywołuje PUT /events/{id} {status:'usunieta'}.

Frontend nie wywołuje już DELETE — zamiast tego soft-delete przez PUT zachowujący historię.
Ten test weryfikuje backendową ścieżkę używaną przez nowy przycisk.
"""

import pytest

from tests._auth_helpers import get_token as _token

EVENTS_URL = "/api/v1/events"
ET_URL = "/api/v1/event-types"
STREETS_URL = "/api/v1/streets"


@pytest.mark.asyncio
async def test_put_status_usunieta_soft_close_preserves_event(async_client):
    """
    Tworzymy zdarzenie → PUT status='usunieta' → GET /events/{id} powinno wciąż działać
    (zdarzenie istnieje fizycznie, tylko status zmieniony). Lista publiczna NIE pokazuje
    zamkniętych (filter status != 'usunieta').
    """
    token = await _token(async_client, "dyspozytor1", "lublin123")
    headers = {"Authorization": f"Bearer {token}"}

    # Znajdź jakąkolwiek ulicę do FK
    res = await async_client.get(STREETS_URL, params={"q": "Lip", "limit": 1})
    assert res.status_code == 200
    streets = res.json()
    if not streets:
        pytest.skip("Brak ulic w bazie pasujących do 'Lip' — pomijam test integracyjny.")
    street_id = streets[0]["id"]
    street_name = streets[0]["name"]

    # CREATE event (typ 'awaria' z seed)
    res = await async_client.post(
        EVENTS_URL,
        json={
            "event_type": "awaria",
            "street_id": street_id,
            "street_name": street_name,
            "house_number_from": "1",
            "house_number_to": "10",
            "description": "Test soft-close T2.3",
        },
        headers=headers,
    )
    assert res.status_code == 201, f"CREATE event: {res.status_code} {res.text}"
    event_id = res.json()["id"]

    try:
        # PUT status='usunieta' (akcja przycisku "Zakończ" z AdminDashboard)
        res = await async_client.put(
            f"{EVENTS_URL}/{event_id}",
            json={"status": "usunieta"},
            headers=headers,
        )
        assert res.status_code == 200, f"PUT close: {res.status_code} {res.text}"
        assert res.json()["status"] == "usunieta"

        # GET szczegółów — zdarzenie WCIĄŻ istnieje (soft-delete, nie hard)
        res = await async_client.get(f"{EVENTS_URL}/{event_id}")
        assert res.status_code == 200, "Soft-close NIE powinien fizycznie usuwać zdarzenia"
        assert res.json()["status"] == "usunieta"

        # Lista publiczna NIE zawiera zakończonych
        res = await async_client.get(EVENTS_URL, params={"limit": 200})
        assert res.status_code == 200
        ids = {ev["id"] for ev in res.json()["items"]}
        assert event_id not in ids, "Zakończone zdarzenie nie powinno być na liście aktywnych"

        # Historia zmian statusu została zapisana (event_history)
        history = res.json()["items"][0].get("history") if res.json()["items"] else None
        # Niezależny check przez GET szczegółów
        res = await async_client.get(f"{EVENTS_URL}/{event_id}")
        history_entries = res.json().get("history", [])
        assert any(
            h.get("new_status") == "usunieta" for h in history_entries
        ), f"Brak wpisu historii zmiany na 'usunieta': {history_entries}"
    finally:
        # Cleanup — DELETE działa tylko gdy zdarzenie wciąż istnieje (po soft-close jest OK)
        await async_client.delete(f"{EVENTS_URL}/{event_id}", headers=headers)
