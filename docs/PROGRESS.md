# Progress — Event Hub Lublin

## Aktualny etap: BACKEND MVP

### ✅ Zrobione
- [x] Struktura katalogów i pliki startowe
- [x] docker-compose.yml z PostgreSQL
- [x] FastAPI starter (main.py, config.py, database.py)
- [x] Dokumentacja (CLAUDE.md, PROJECT_CONTEXT.md, TECH_SPEC.md)
- [x] Modele SQLAlchemy (user, street, event, subscriber, notification, api_key)
- [x] Alembic — konfiguracja (alembic.ini, env.py, script.py.mako) z async SQLAlchemy
- [x] Alembic — pierwsza migracja `initial tables` (20260329_937cb6bd3ab4) + upgrade head
- [x] Streets — router streets.py, schema street.py (autocomplete GET /api/v1/streets)
- [x] Events — router events.py, schema event.py (CRUD: GET list, GET detail, POST, PUT + EventHistory)
- [x] Subscribers — router subscribers.py, schema subscriber.py (POST rejestracja, GET info, DELETE fizyczny RODO)
- [x] Seed data — scripts/seed.py (dyspozytor, 5 ulic, 3 zdarzenia z historią, 2 subskrybenci z adresami)

### 📋 Do zrobienia (w tej kolejności)
1. [x] Alembic — pierwsza migracja (autogenerate + upgrade head)
2. [x] Auth — security.py, dependencies.py, router auth.py, schema auth.py
3. [x] Streets — router streets.py, schema street.py (autocomplete)
4. [x] Events — router events.py, schema event.py (CRUD)
5. [x] Subscribers — router subscribers.py, schema subscriber.py
6. [ ] Notification engine — sms_gateway, email_sender, matching, notification_engine
7. [ ] Podłączenie notification engine do events router
8. [x] Seed data — użytkownicy, ulice, zdarzenia, subskrybenci testowi
9. [ ] Import ulic TERYT z GUS API
10. [ ] Geocoding (Nominatim → GeoJSON w tabeli streets)
11. [ ] Endpoint /events/feed (tekst dla IVR 994)
12. [ ] Admin endpoints (stats, lista subskrybentów, log powiadomień)

### Changelog
- 2026-03-29: Struktura projektu, pliki startowe
- 2026-03-29: Modele SQLAlchemy
- 2026-03-29: Alembic — konfiguracja (alembic.ini, env.py, script.py.mako)
- 2026-03-29: Alembic — migracja "initial tables" (rev 937cb6bd3ab4), upgrade head — 8 tabel w bazie; bugfix Mapped[func.now]→Mapped[datetime] w user.py; dodano psycopg2-binary do requirements.txt
- 2026-03-29: Auth — security.py (hash_password, verify_password, create_access_token), schemas/auth.py (Token, TokenData, LoginRequest), dependencies.py (get_current_user + re-export get_db), routers/auth.py (POST /api/v1/auth/login), main.py — router auth zarejestrowany
- 2026-03-29: Streets — schemas/street.py (StreetResponse), routers/streets.py (GET /api/v1/streets?q=&limit=), main.py — router streets zarejestrowany
- 2026-03-29: Events — schemas/event.py (EventCreate, EventUpdate, EventResponse, EventHistoryResponse), routers/events.py (GET /api/v1/events, GET /api/v1/events/{id}, POST /api/v1/events, PUT /api/v1/events/{id} + EventHistory przy zmianie statusu), main.py — router events zarejestrowany
- 2026-03-30: Subscribers — schemas/subscriber.py (AddressCreate, AddressResponse, SubscriberCreate z walidatorem RODO, SubscriberResponse), routers/subscribers.py (POST /api/v1/subscribers rejestracja z listą adresów, GET /api/v1/subscribers/{token} podgląd, DELETE /api/v1/subscribers/{token} fizyczne usunięcie RODO), main.py — router subscribers zarejestrowany
- 2026-03-30: Seed data — scripts/seed.py + scripts/__init__.py; dodano: 1 dyspozytor (admin/admin123, bcrypt), 5 ulic Lublina (Piłsudskiego, Lipowa, Nadbystrzycka, Zana, Kraśnicka), 3 zdarzenia z wpisami EventHistory, 2 subskrybenci z adresami; uruchamianie: `python -m scripts.seed` z katalogu backend/