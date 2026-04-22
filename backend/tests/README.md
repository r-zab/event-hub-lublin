# Testy backendu — instrukcja dla zespołu

## Wymagania wstępne

- Uruchomiona baza danych (Docker): `docker-compose up -d db`
- Zainstalowane zależności: `pip install -r requirements.txt`
- Plik `backend/.env` z ustawioną zmienną `SECRET_KEY`
- Konta deweloperskie w bazie (tworzy je `python -m scripts.setup_dev_users`):
  - `admin` / `admin123` (rola: admin)
  - `dyspozytor1` / `lublin123` (rola: dispatcher)

## Uruchamianie testów

```bash
# Z katalogu backend/
cd backend

# Wszystkie testy
pytest

# Z widocznym wynikiem każdego testu
pytest -v

# Wybrane pliki
pytest tests/test_streets.py tests/test_events.py -v

# Konkretny test
pytest tests/test_auth.py::test_login_success -v
```

## Zasady pisania kolejnych testów

1. **Nie mockuj bazy danych** — testy uruchamiają się na lokalnej bazie dev (Docker PostGIS).
   Mockowanie maskuje błędy walidacji Pydantic vs. rzeczywiste typy kolumn PostgreSQL.

2. **Używaj `async_client` z conftest.py** — fixture zwraca `httpx.AsyncClient` z ASGI transport.
   Nie twórz własnych klientów HTTP w testach — to tworzy redundantny boilerplate.
   Fixture używa `NullPool` (każde żądanie dostaje świeże połączenie DB) — rozwiązuje problem
   asyncpg connection pool vs. function-scoped event loopy na Windows.

3. **Oznaczaj testy jako `@pytest.mark.asyncio`** — mimo `asyncio_mode = auto` w pytest.ini,
   jawna adnotacja dokumentuje intencję i jest wymagana przez zadanie CI.

4. **Izoluj dane testowe** — jeśli test tworzy rekordy w bazie (np. subskrybenci), usuń je po teście
   przez fixture z `yield` i `DELETE` lub użyj oddzielnej bazy testowej.

## Zrealizowane testy API

| Plik | Co sprawdza | Wynik |
|------|-------------|-------|
| `test_auth.py` | Login happy path (200 + `access_token`); błędne hasło → 401 | ✅ 2/2 PASS |
| `test_streets.py` | `%%%` i `___` jako zapytania ILIKE nie zwracają rekordów (escaping działa); `\\\` nie powoduje błędu SQL 500 | ✅ 3/3 PASS |
| `test_events.py` | Dyspozytor DELETE → 404 (autoryzacja OK, brak zdarzenia); brak tokena → 401 | ✅ 2/2 PASS |

## Co testować następnie (priorytet)

| Plik | Co sprawdzić |
|------|-------------|
| `test_auth.py` (rozszerzenie) | Rate limit 5/min na `/auth/login` — 6. żądanie powinno zwrócić 429 |
| `test_subscribers.py` | Flow RODO end-to-end: rejestracja → token wyrejestrowania w SMS/e-mail → `GET /subscribers/{token}` → `DELETE` — weryfikacja fizycznego usunięcia z bazy (CASCADE na adresy) |
| `test_events.py` (rozszerzenie) | Rola `admin` próbuje `DELETE /events/{id}` → 404 (tak samo jak dyspozytor); niezalogowany `POST /events` → 401; dyspozytor `GET /events` (publiczny) → 200 |
| `test_notification_service.py` | `parse_house_number()` dla numerów alfanumerycznych (10A, 10B, 10C); cisza nocna (22–06 Europe/Warsaw) kieruje SMS do kolejki porannej; dopasowanie subskrybentów po `street_id` + zakres numerów |
| `test_masking.py` | `mask_recipient()` dla e-mail i telefonu; `mask_token()` dla 64-znakowych tokenów hex RODO |
