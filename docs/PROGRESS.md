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

### 📋 Do zrobienia (w tej kolejności)
1. [x] Alembic — pierwsza migracja (autogenerate + upgrade head)
2. [ ] Auth — security.py, dependencies.py, router auth.py, schema auth.py
3. [ ] Streets — router streets.py, schema street.py (autocomplete)
4. [ ] Events — router events.py, schema event.py (CRUD)
5. [ ] Subscribers — router subscribers.py, schema subscriber.py
6. [ ] Notification engine — sms_gateway, email_sender, matching, notification_engine
7. [ ] Podłączenie notification engine do events router
8. [ ] Seed data — użytkownicy, ulice, zdarzenia, subskrybenci testowi
9. [ ] Import ulic TERYT z GUS API
10. [ ] Geocoding (Nominatim → GeoJSON w tabeli streets)
11. [ ] Endpoint /events/feed (tekst dla IVR 994)
12. [ ] Admin endpoints (stats, lista subskrybentów, log powiadomień)

### Changelog
- 2026-03-29: Struktura projektu, pliki startowe
- 2026-03-29: Modele SQLAlchemy
- 2026-03-29: Alembic — konfiguracja (alembic.ini, env.py, script.py.mako)
- 2026-03-29: Alembic — migracja "initial tables" (rev 937cb6bd3ab4), upgrade head — 8 tabel w bazie; bugfix Mapped[func.now]→Mapped[datetime] w user.py; dodano psycopg2-binary do requirements.txt