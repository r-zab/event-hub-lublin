# Progress — Event Hub Lublin

## Aktualny etap: INTEGRACJA FULL-STACK

### ✅ Zrobione — Backend
- [x] Struktura katalogów i pliki startowe
- [x] docker-compose.yml z PostgreSQL 16
- [x] FastAPI starter (main.py, config.py, database.py)
- [x] Dokumentacja (CLAUDE.md, PROJECT_CONTEXT.md, TECH_SPEC.md)
- [x] Modele SQLAlchemy 2.0 (user, street, event, event_history, subscriber, subscriber_addresses, notification_log, api_key)
- [x] Alembic — konfiguracja async + pierwsza migracja `initial tables` (rev 937cb6bd3ab4) + upgrade head
- [x] Auth — security.py (bcrypt cost=12, JWT HS256), dependencies.py, router auth.py (OAuth2 form), schema auth.py
- [x] Streets — router streets.py, schema street.py (autocomplete ILIKE, GET /api/v1/streets?q=)
- [x] Events — router events.py, schema event.py (GET lista paginowana, GET szczegóły, POST tworzenie JWT, PUT aktualizacja JWT + EventHistory)
- [x] Subscribers — router subscribers.py, schema subscriber.py (POST rejestracja wieloadresowa, GET podgląd tokenem, DELETE fizyczny RODO)
- [x] Seed data — scripts/seed.py (usunięty — dane testowe wyczyszczone z bazy; baza zawiera wyłącznie 1378 ulic z TERYT)
- [x] Import TERYT — scripts/import_streets.py (XML GUS, upsert batch=100, 1378 ulic Lublina, idempotentny)
- [x] Notification Engine — gateways.py (SMSGateway ABC, MockSMSGateway, EmailSender aiosmtplib+mock), notification_service.py (matching alfanumeryczny, nocna cisza 22-06 → queued_morning, zapis notification_log)
- [x] Podłączenie notification engine do events router (asyncio.create_task w create_event i update_event)

### ✅ Zrobione — Frontend (integracja z Lovable)
- [x] Przeniesienie frontendu z Lovable do lokalnego środowiska Vite (frontend/)
- [x] Konfiguracja komunikacji z backendem: BASE_URL z VITE_API_URL, usunięcie nagłówków ngrok
- [x] Vite proxy: /api → localhost:8000 (vite.config.ts)
- [x] frontend/.env z VITE_API_URL=http://localhost:8000/api/v1
- [x] CORS backend: localhost:8080 i localhost:5173 z allow_credentials=True
- [x] useAuth.tsx — logowanie OAuth2 x-www-form-urlencoded (zgodne z FastAPI)
- [x] useStreets.ts — autocomplete GET /streets?q= (min 3 znaki, anulowanie żądań)
- [x] useEvents.ts — pobieranie, filtrowanie in-memory, paginacja (10/strona)
- [x] AdminDashboard — tabela zdarzeń, historia statusów, filtry, wyszukiwanie
- [x] AdminEventForm — formularz tworzenia/edycji z autocomplete ulic TERYT
- [x] Register.tsx — pełna integracja z API: street_id z TERYT przez autocomplete, kanały powiadomień, async handleSubmit → POST /subscribers, ekran sukcesu z tokenem wyrejestrowania
- [x] EventMap.tsx — mapa Leaflet z kolorowaniem statusów, obsługa GeoJSON/fallback marker
- [x] Unsubscribe.tsx — wyrejestrowanie RODO przez token

### ✅ Zrobione — Sesja 4 (2026-04-03) — SMSEagle + preferencje powiadomień
- [x] Model Subscriber: pola `notify_by_email` i `notify_by_sms` (bool, default True)
- [x] Schematy Pydantic: `notify_by_email/sms` w `SubscriberCreate` i `SubscriberResponse`
- [x] Router subscribers: nowe pola przekazywane przy tworzeniu subskrybenta
- [x] config.py: `ENABLE_EMAIL_NOTIFICATIONS`, `SMSEAGLE_URL`, `SMSEAGLE_API_TOKEN`
- [x] gateways.py: `SMSEagleGateway` (POST `/messages/sms`, nagłówek `access-token`), aktualizacja `get_sms_gateway`
- [x] notification_service.py: kill-switch emaili + respektowanie preferencji subskrybenta
- [x] Migracja Alembic: rev `b1c2d3e4f5a6` — kolumny `notify_by_email`, `notify_by_sms`
- [x] Frontend Register.tsx: sekcja "Kanały powiadomień" (checkboxy e-mail / SMS)

### 📋 Do zrobienia — kolejne 3 priorytety

| # | Zadanie | Priorytet | Opis |
|---|---------|-----------|------|
| 1 | **Admin endpoints** — GET /admin/subscribers, GET /admin/notifications, GET /admin/stats | WYSOKI | Panel admina potrzebuje danych o subskrybentach i logu powiadomień; bez tego dashboard jest niekompletny |
| 2 | **Geocoding ulic** — Nominatim → GeoJSON w tabeli streets | ŚREDNI | Mapa Leaflet wyświetla fallback marker dla zdarzeń bez geojson_segment; geocoding wypełni tę lukę dla 1378 ulic |
| 3 | **Endpoint GET /api/v1/events/feed** — plain text dla IVR 994 | ŚREDNI | Wymaganie biznesowe MPWiK: dyspozytor dzwoni na 994, system odczytuje aktywne awarie głosowo |

### Backlog (po powyższych)
- [ ] Testy jednostkowe i integracyjne backendu (pytest + httpx)
- [ ] Migracja Alembic dla ewentualnych zmian schematu
- [ ] Prawdziwa bramka SMS (dokumentacja API od MPWiK oczekiwana)
- [ ] Konfiguracja nginx jako reverse proxy (frontend + backend)
- [ ] Wdrożenie na Oracle Linux (docelowy OS MPWiK)
- [ ] WCAG — audyt dostępności frontendu
.
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
- 2026-03-30: Import TERYT — scripts/import_streets.py; parsowanie XML (xml.etree.ElementTree), mapowanie SYM_UL→teryt_sym_ul, CECHA→street_type, NAZWA_1→name, NAZWA_2+" "+NAZWA_1→full_name; upsert przez pg INSERT ON CONFLICT (teryt_sym_ul) DO UPDATE; batch=100; zaimportowano 1378 ulic Lublina z pliku data/ULIC_29-03-2026.xml; idempotentny (drugie uruchomienie nie duplikuje rekordów)
- 2026-03-30: Notification Engine — services/gateways.py (SMSGateway ABC, MockSMSGateway loguje do logging, EmailSender via aiosmtplib z trybem mock gdy brak SMTP_USER), services/notification_service.py (parse_house_number + is_in_range obsługa alfanumeryczna, match_subscribers ORM + filtr Pythonowy, build_sms/email message, notify_event z logiką nocnej ciszy 22-06 → status queued_morning, zapis wszystkich prób do notification_log); routers/events.py — asyncio.create_task(notify_event) w create_event i update_event
- 2026-03-30: Integracja Full-Stack — przeniesienie frontendu z Lovable do frontend/; konfiguracja VITE_API_URL + proxy Vite; naprawa BASE_URL (ngrok→localhost); CORS backend (localhost:8080/5173, allow_credentials=True); useAuth z x-www-form-urlencoded; wszystkie hooki (useEvents, useStreets, useAuth) zintegrowane z lokalnym API
- 2026-04-03: SMSEagle + preferencje powiadomień — SMSEagleGateway (openapi.yaml), pola notify_by_email/sms w modelu + schemach + routerze, migracja Alembic (rev b1c2d3e4f5a6), kill-switch ENABLE_EMAIL_NOTIFICATIONS w config, logika nocnej ciszy + preferencje w notification_service, checkboxy kanałów w Register.tsx
- 2026-04-03: Bugfix kill-switch emaili — wczesny guard email_globally_enabled przed loopem, EmailSender=None gdy wyłączony, log diagnostyczny przy starcie modułu; bcrypt downgrade do 4.0.1 (konflikt z passlib 1.7.4); street_id fallback po ILIKE name w subscribers router
- 2026-04-03: Integracja rejestracji — AddressRow przekazuje street_id z TERYT przy wyborze z autocomplete; Register.tsx: async handleSubmit → POST /subscribers z pełnym payloadem (street_id, notify_by_email/sms, flat_number); ekran sukcesu z tokenem wyrejestrowania; walidacja min. 1 kanału powiadomień
- 2026-04-03: Naprawiono fallback TERYT w subscribers.py — helper _normalize_street_name() iteracyjnie usuwa prefiksy (ul., al., Ulica itp.); _resolve_street_id() szuka or_(full_name ILIKE raw, full_name ILIKE once_stripped, name ILIKE normalized); obsługa "ul. Ulica Lipowa" → street_id=622
- 2026-04-03: Audyt techniczny — docs/lista_rzeczy_do_poprawek.md: 8 błędów krytycznych, 8 brakujących funkcji, 10 problemów UX, 13 pozycji długu technicznego
