# Progress — System Powiadomień MPWiK Lublin

## Aktualny etap: INTEGRACJA FULL-STACK

### ✅ Zrobione — Backend
- [x] Struktura katalogów i pliki startowe
- [x] docker-compose.yml z PostgreSQL 16 (2026-04-13: migracja obrazu na `postgis/postgis:16-3.4-alpine` — natywne wsparcie PostGIS 3.4; po re-imporcie i geokodowaniu w bazie: **1378 ulic** pełne pokrycie TERYT (6 bez geom — niemapowane w Nominatim), **46 596 budynków** (9918 bez `street_id` = bezadresowe PRG))
- [x] FastAPI starter (main.py, config.py, database.py)
- [x] Dokumentacja (CLAUDE.md, PROJECT_CONTEXT.md, TECH_SPEC.md)
- [x] Modele SQLAlchemy 2.0 (user, street, event, event_history, subscriber, subscriber_addresses, notification_log, api_key, **building**)
- [x] Alembic — konfiguracja async + pierwsza migracja `initial tables` (rev 937cb6bd3ab4) + upgrade head
- [x] Auth — security.py (bcrypt cost=12, JWT HS256), dependencies.py, router auth.py (OAuth2 form), schema auth.py
- [x] Streets — router streets.py, schema street.py (autocomplete ILIKE, GET /api/v1/streets?q=, GET /api/v1/streets/{street_id}/buildings)
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
- [x] Unsubscribe.tsx — wyrejestrowanie RODO: 2-etapowy flow (weryfikacja tokenu → podgląd danych → potwierdzenie → DELETE), auto-load z URL `?token=`, obsługa błędu 404, stany ładowania, redirect do `/` po sukcesie

### ✅ Zrobione — Sesja 4 (2026-04-03) — SMSEagle + preferencje powiadomień
- [x] Model Subscriber: pola `notify_by_email` i `notify_by_sms` (bool, default True)
- [x] Schematy Pydantic: `notify_by_email/sms` w `SubscriberCreate` i `SubscriberResponse`
- [x] Router subscribers: nowe pola przekazywane przy tworzeniu subskrybenta
- [x] config.py: `ENABLE_EMAIL_NOTIFICATIONS`, `SMSEAGLE_URL`, `SMSEAGLE_API_TOKEN`
- [x] gateways.py: `SMSEagleGateway` (POST `/messages/sms`, nagłówek `access-token`), aktualizacja `get_sms_gateway`
- [x] notification_service.py: kill-switch emaili + respektowanie preferencji subskrybenta
- [x] Migracja Alembic: rev `b1c2d3e4f5a6` — kolumny `notify_by_email`, `notify_by_sms`
- [x] Frontend Register.tsx: sekcja "Kanały powiadomień" (checkboxy e-mail / SMS)

### ✅ Zrobione — Sesja 11 (2026-04-08) — Integracja przestrzenna GeoJSON → Leaflet
- [x] `backend/app/schemas/event.py`: pole `street_geojson: dict | None = None` w `EventResponse`
- [x] `backend/app/routers/events.py`: `list_events` i `get_event` ładują `selectinload(Event.street)` i ustawiają `event.street_geojson = event.street.geojson`
- [x] `frontend/src/data/mockData.ts`: `street_geojson?: { type: string; coordinates: [number, number] } | null` w interfejsie `EventItem`
- [x] `frontend/src/components/EventMap.tsx`: priorytet renderowania: Polyline (geojson_segment) > Marker w rzeczywistych koordynatach (street_geojson Point, odwrócone [lon, lat] → [lat, lon] dla Leaflet) > fallback centrum Lublina

### ✅ Zrobione — Sesja 10 (2026-04-08) — Wygasanie sesji + strony admin (subskrybenci, logi)
- [x] `frontend/src/lib/api.ts`: obsługa HTTP 401 → `localStorage.removeItem('mpwik_token' + 'mpwik_refresh_token')` + `window.location.href = '/admin/login'` (pkt 3.3 audytu)
- [x] `frontend/src/pages/AdminSubscribers.tsx` (nowy): tabela subskrybentów — e-mail, telefon, kanały, zgody RODO/nocne, adresy, data rejestracji; paginacja 20/strona; dane z `GET /api/v1/admin/subscribers` (pkt 3.5 audytu)
- [x] `frontend/src/pages/AdminNotifications.tsx` (nowy): log powiadomień — data, kanał (badge), odbiorca, status (badge z kolorami), zdarzenie #id, treść (truncate); paginacja 20/strona; dane z `GET /api/v1/admin/notifications` (pkt 3.6 audytu)
- [x] `frontend/src/App.tsx`: trasy `/admin/subscribers` i `/admin/notifications` pod `ProtectedAdminLayout`
- [x] `frontend/src/components/AdminLayout.tsx`: nowe pozycje w sidebarze: "Subskrybenci" (ikona `Users`) i "Logi powiadomień" (ikona `MessageSquare`)

### ✅ Zrobione — Sesja 9 (2026-04-08) — Geocoding ulic (Nominatim → GeoJSON)
- [x] `scripts/geocode_streets.py`: async skrypt geokodowania ulic z `geojson IS NULL`
  - Nominatim `/search` z User-Agent z `settings.NOMINATIM_USER_AGENT`
  - Zapis `{"type": "Point", "coordinates": [lon, lat]}` do `street.geojson`
  - Przerwa 1.2 s między zapytaniami (Nominatim Usage Policy)
  - Flagi CLI: `--delay`, `--dry-run`, `--limit`
  - Idempotentny: pomija ulice, które już mają geojson

### ✅ Zrobione — Sesja 8 (2026-04-08) — Rate limiting, walidacja telefonu, scheduler SMS
- [x] `requirements.txt`: dodano `apscheduler==3.10.4`
- [x] `app/limiter.py`: współdzielona instancja `Limiter(key_func=get_remote_address)` z slowapi
- [x] `main.py`: `app.state.limiter`, `add_exception_handler(RateLimitExceeded)`, `AsyncIOScheduler` z jobem `process_morning_queue` cron 06:00 Europe/Warsaw
- [x] `routers/auth.py`: `@limiter.limit("5/minute")` na `POST /auth/login` (brute-force)
- [x] `routers/subscribers.py`: `@limiter.limit("3/minute")` na `POST /subscribers` (anty-spam)
- [x] `schemas/subscriber.py`: `phone_format` validator — regex `^\+48\d{9}$|^\d{9}$`, strip spacji i myślników
- [x] `frontend/Register.tsx`: `pattern="^(\+48)?\d{9}$"` + `title` na inpucie telefonu (HTML5)
- [x] `services/notification_service.py`: `process_morning_queue()` — async, własna sesja DB, SELECT queued_morning, send SMS, UPDATE status sent/failed

### ✅ Zrobione — Sesja 7 (2026-04-08) — Admin endpoints + weryfikacja roli
- [x] `dependencies.py`: funkcja `get_current_admin` — sprawdza `user.role == "admin"`, rzuca HTTP 403 dla dyspozytora
- [x] `routers/admin.py`: nowy router z dependency `get_current_admin` dla całego routera
  - `GET /api/v1/admin/stats` — total_subscribers, active_events, notifications_sent
  - `GET /api/v1/admin/subscribers` — paginowana lista (skip/limit), sortowanie od najnowszych, total_count
  - `GET /api/v1/admin/notifications` — paginowany log (skip/limit), sortowanie malejąco po sent_at, total_count
- [x] `main.py`: import i rejestracja routera admin (`/api/v1/admin`)

### ✅ Zrobione — Sesja 6 (2026-04-04) — Refresh token + strefa czasowa nocnej ciszy
- [x] `security.py`: `create_refresh_token()` — JWT z claim `type=refresh`, ważność 7 dni (`REFRESH_TOKEN_EXPIRE_DAYS`)
- [x] `schemas/auth.py`: `RefreshRequest` (pole `refresh_token`); `Token.refresh_token` opcjonalne
- [x] `routers/auth.py`: endpoint `POST /api/v1/auth/refresh` — weryfikacja claim `type=refresh`, zwraca nowy access token; login zwraca teraz też `refresh_token`
- [x] `notification_service.py`: `_is_night_hours()` używa `ZoneInfo("Europe/Warsaw")` zamiast UTC (naprawia błąd 1–2h dla CET/CEST)

### ✅ Zrobione — Sesja 5 (2026-04-04) — DELETE zdarzenia + pełny cykl edycji
- [x] Backend: `DELETE /api/v1/events/{id}` — weryfikacja roli `admin` (HTTP 403 dla dispatchera), HTTP 204 No Content
- [x] Frontend `api.ts`: obsługa HTTP 204 No Content w `apiFetch`
- [x] Frontend `useEvents.ts`: eksport `getEvent`, `updateEvent`, `deleteEvent`
- [x] Frontend `App.tsx`: trasa `/admin/events/edit/:id`
- [x] Frontend `AdminDashboard.tsx`: ikona Edytuj → `/admin/events/edit/{id}`, przycisk Usuń + AlertDialog potwierdzenia z `refetch()`
- [x] Frontend `AdminEventForm.tsx`: `useParams`, ładowanie danych przy edycji, PUT/POST, spinner, różne tytuły

### 📋 Do zrobienia — kolejne 3 priorytety

| # | Zadanie | Priorytet | Opis |
|---|---------|-----------|------|
| ~~1~~ | ~~**Admin endpoints** — GET /admin/subscribers, GET /admin/notifications, GET /admin/stats~~ | ~~WYSOKI~~ | ✅ Zrobione (sesja 7, 2026-04-08) |
| ~~2~~ | ~~**Geocoding ulic** — Nominatim → GeoJSON w tabeli streets~~ | ~~ŚREDNI~~ | ✅ Zrobione (sesja 9, 2026-04-08) — `scripts/geocode_streets.py` |
| 3 | **Endpoint GET /api/v1/events/feed** — plain text dla IVR 994 | ŚREDNI | Wymaganie biznesowe MPWiK: dyspozytor dzwoni na 994, system odczytuje aktywne awarie głosowo |

### ✅ Zrobione — Sesja 14 (changelog skrócony — patrz sekcja wyżej)
- [x] Retroaktywne powiadomienia dla nowych subskrybentów [4.14]
- [x] Eliminacja duplikatów powiadomień przy update_event [4.12]
- [x] Globalne strefy czasowe UTC+serializer+utils.ts [3.11]
- [x] Interaktywność mapy + flyToBounds [4.15]
- [x] Stylizacja poligonów + popup z numerem domu [4.16]
- [x] CORS z settings.CORS_ORIGINS [4.3]
- [x] Naprawa update_event selectinload [7.4]

### Backlog (po powyższych)
- [x] **[7.4] Naprawa update_event** — `selectinload(Event.street)` dodany w obu query + `event.street_geojson` ustawiany po zapisie (2026-04-10)
- [ ] **[7.6] Import danych buildings** — skrypt importu obrysów budynków z OSM/BDOT dla Lublina (bez danych zakładka mapy pusta, ale zakres/lista działają)
- [ ] **[7.5] Walidacja schematu FeatureCollection** — Pydantic validator na `geojson_segment` (nice-to-have)
- [ ] Testy jednostkowe i integracyjne backendu (pytest + httpx)
- [ ] Migracja Alembic dla ewentualnych zmian schematu
- [ ] Prawdziwa bramka SMS (dokumentacja API od MPWiK oczekiwana)
- [ ] Konfiguracja nginx jako reverse proxy (frontend + backend)
- [ ] Wdrożenie na Oracle Linux (docelowy OS MPWiK)
- [ ] WCAG — audyt dostępności frontendu

### ✅ Zrobione — Sesja 13 (2026-04-09) — Bulk zgłaszanie + synchronizacja GIS
- [x] `frontend/src/pages/AdminEventForm.tsx` — kompletna przebudowa:
  - **3-zakładkowy wybór zakresu** (`Tabs` shadcn/ui): „Zaznacz na mapie" / „Zakres numerów" / „Lista numerów"
  - **Wspólny stan** `selectedBuildingIds` dla wszystkich zakładek — synchronizacja przez `selectionSourceRef`
  - **Helpery JS**: `parseHouseNumber`, `isInRange`, `sortHouseNumbers` (alfanumeryczne, odpowiedniki backendowe)
  - **Zakładka „Zakres numerów"**: pola od/do + przycisk „Zastosuj zakres" (`applyRange`) → auto-filtruje buildings → podświetla na mapie
  - **Zakładka „Lista numerów"**: input z numerami oddzielonymi przecinkiem → auto-match do buildings → podświetlenie na mapie
  - **Sync mapie → lista/zakres**: zaznaczenie na mapie auto-aktualizuje houseFrom/houseTo i listInput
  - **Bulk submit (koszyk)**: `eventsQueue` state — lista zgłoszeń do wysłania; przycisk „Dodaj ulicę do zgłoszenia" (secondary) dodaje current do kolejki i resetuje pola ulicy/budynków; sekcja „Zgłoszenia oczekujące" z kartami (`QueueCard`) i przyciskiem usunięcia X; submit używa `Promise.all` dla równoległych POST; przycisk „Zapisz i powiadom (N ulic)"
  - **Tryb edycji**: bulk ukryty, single record; `pendingRestoreIdsRef` przywraca zaznaczenie budynków z `geojson_segment` (naprawa [7.2])
  - **Naprawiono [7.1]**: houseFrom/houseTo zawsze zsynchronizowane z zaznaczeniem → spójne dane dla Notification Engine
  - **Naprawiono [7.3]**: pola zakresu opcjonalne, w zakładce, nie blokują submit gdy budynki zaznaczone na mapie

### ✅ Zrobione — Sesja 12 (2026-04-09) — Obrysy budynków na mapie (zaznaczanie przez dyspozytora)
- [x] `backend/app/models/building.py` (nowy): model SQLAlchemy dla tabeli `buildings` (id, street_id, street_name, house_number, geojson_polygon JSONB)
- [x] `backend/app/schemas/building.py` (nowy): `BuildingResponse` (id, house_number, geojson_polygon)
- [x] `backend/app/models/__init__.py`: rejestracja modelu `Building`
- [x] `backend/app/routers/streets.py`: nowy endpoint `GET /api/v1/streets/{street_id}/buildings` — lista obrysów dla ulicy
- [x] `frontend/src/data/mockData.ts`: nowy interface `GeoJsonFeatureCollection`; typ `geojson_segment` rozszerzony o `| GeoJsonFeatureCollection`
- [x] `frontend/src/pages/AdminEventForm.tsx`: pierwotna implementacja mapy Leaflet z budynkami (zastąpiona w Sesji 13)
- [x] `frontend/src/components/EventMap.tsx`: obsługa FeatureCollection w `geojson_segment` → renderowanie `<GeoJSON>` na mapie publicznej
### ✅ Zrobione — Sesja 14 (2026-04-10) — Poprawki jakości: strefy czasowe, mapa, powiadomienia
- [x] **[3.11] Globalna naprawa stref czasowych** — `_utc_iso()` + `@field_serializer` w `schemas/event.py`; wszystkie timestampy z `+00:00`; `utils.ts` SSoT (`parseUTC`, `toLocalISO`, `toUTCISO`, `formatDate`, `formatDateTime`); zastosowane w AdminEventForm, EventCard, AdminDashboard, AdminSubscribers, AdminNotifications
- [x] **[4.12] Eliminacja duplikatów powiadomień** — `update_event` sprawdza `update_data["status"] != old_status`; powiadomienia wysyłane tylko przy faktycznej zmianie statusu; stary status przekazany do `notify_event(old_status=)`; nowe szablony SMS/email dla zmiany statusu i zamknięcia awarii; etykiety po polsku
- [x] **[4.14] Powiadomienia retroaktywne** — `notify_new_subscriber_about_active_events()` w notification_service; dla każdej aktywnej awarii (`zgloszona`/`w_naprawie`) sprawdza dopasowanie adresu nowego subskrybenta; deduplikacja po `event_id`; wywołanie przez `asyncio.create_task` w `POST /subscribers`
- [x] **[4.15] Interaktywność mapy** — `focusedEventId` state w Index.tsx; `EventCard.onClick` ustawia fokus; `EventMap` reaguje `flyToBounds` (FeatureCollection) lub `flyTo` (punkt/Polyline); kliknięcie pinezki synchronizuje stan
- [x] **[4.16] Stylizacja poligonów** — `fillOpacity` 0.5→0.6; popup każdego budynku pokazuje konkretny numer domu z `feature.properties.house_number`
- [x] **[7.4] Naprawa update_event** — oba `select` ładują `selectinload(Event.street)`; `event.street_geojson` ustawiane po zapisie; fix MissingGreenlet
- [x] **[4.3] CORS z config** — `main.py` używa `settings.CORS_ORIGINS.split(",")` zamiast hardkodowanych origins
- [x] **Migracja TIMESTAMPTZ** — przygotowana jako `backend/alembic/versions/20260410_timestamp_with_timezone.py` (nie uruchomiona — opcjonalna, Pydantic serializer już gwarantuje poprawne Z w JSON)

### ✅ Zrobione — Sesja 15 (2026-04-10) — Poprawki logiki powiadomień: statusy retroaktywne + DELETE notify + FK fix

- [x] **[4.17] Statusy w powiadomieniach retroaktywnych** — `build_sms_retroactive_message(event)` i `build_email_retroactive_body(event)` w `notification_service.py`; SMS zawiera "Aktualny status: w naprawie/zgłoszona"; email zaczyna od "trwa" zamiast "wystąpiła" + dodaje linię statusu; `notify_new_subscriber_about_active_events` używa nowych szablonów
- [x] **[4.18] Powiadomienie przy DELETE zdarzenia** — `DELETE /events/{id}` ustawia `status="usunieta"`, commituje, wywołuje `await notify_event(event_id, old_status=...)` synchronicznie (SMS/email "awaria usunięta"), następnie re-fetch + delete; FK `notification_log.event_id` naprawiona: `ondelete="SET NULL"` w modelu + `passive_deletes=True` + migracja `20260410_notif_fk`

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
- 2026-04-04: Naprawa Unsubscribe.tsx — dwuetapowy flow RODO: pole na token (auto-load z ?token=), GET /subscribers/{token} → podgląd danych, DELETE /subscribers/{token} → redirect do /; toast na 404; stany ładowania z Loader2
- 2026-04-04: Unikalność subskrybentów (pkt 1.2+1.3 audytu) — unique=True na email i phone w modelu Subscriber; walidacja HTTP 409 w register_subscriber przed INSERT; migracja Alembic rev c2d3e4f5a6b7
- 2026-04-04: DELETE zdarzenia + pełny cykl edycji (pkt 1.4+1.7 audytu) — backend: DELETE /api/v1/events/{id} (admin only, HTTP 204); api.ts: obsługa 204 No Content; useEvents.ts: getEvent/updateEvent/deleteEvent; App.tsx: trasa /admin/events/edit/:id; AdminDashboard: ikona Edytuj z id + AlertDialog usuwania; AdminEventForm: useParams + ładowanie danych + PUT vs POST
- 2026-04-04: Skrypt setup_dev_users.py — zastąpił reset_admin.py; tworzy/aktualizuje 3 konta: admin (admin, admin123), dyspozytor1 i dyspozytor2 (dispatcher, lublin123); idempotentny; stary reset_admin.py usunięty
- 2026-04-04: Konfiguracja logowania + wyciszenie SQLAlchemy (pkt 4.1+4.13 audytu) — logging.basicConfig z formatem timestamp/level/modul w main.py; poziom DEBUG/INFO zależny od settings.DEBUG; sqlalchemy.engine i sqlalchemy.pool na WARNING; print() zastąpione logger.info() w lifespan
- 2026-04-04: Refresh token + naprawa strefy czasowej (pkt 1.5+1.6 audytu) — create_refresh_token() w security.py (JWT 7 dni, claim type=refresh); POST /auth/refresh w routers/auth.py (weryfikacja, zwrot nowego access tokena); login zwraca refresh_token; _is_night_hours() używa ZoneInfo("Europe/Warsaw") zamiast UTC
- 2026-04-08: Admin endpoints + weryfikacja roli (pkt 2.1+2.4 audytu) — get_current_admin() w dependencies.py (HTTP 403 dla non-admin); nowy routers/admin.py z GET /admin/stats, GET /admin/subscribers (paginacja+total_count), GET /admin/notifications (paginacja+total_count); router zarejestrowany w main.py
- 2026-04-08: Rate limiting + walidacja telefonu + scheduler SMS (pkt 2.6+2.7+2.8 audytu) — apscheduler 3.10.4; app/limiter.py (shared Limiter); login 5/min, rejestracja 3/min; phone_format validator Pydantic + HTML5 pattern; process_morning_queue() cron 06:00 Warsaw
- 2026-04-08: Geocoding ulic (pkt 2.5 audytu) — scripts/geocode_streets.py: async Nominatim /search, delay 1.2s, zapis GeoJSON Point, flagi --dry-run/--limit/--delay, idempotentny
- 2026-04-08: Wygasanie sesji + strony admin (pkt 3.3+3.5+3.6 audytu) — api.ts: obsługa 401 → clear localStorage + redirect /admin/login; nowe strony AdminSubscribers.tsx (tabela subskrybentów, paginacja) i AdminNotifications.tsx (log powiadomień, paginacja); trasy w App.tsx; linki Users/MessageSquare w AdminLayout.tsx sidebarze
- 2026-04-08: Integracja przestrzenna GeoJSON → Leaflet — EventResponse.street_geojson (backend selectinload Street + atrybut Python); EventMap.tsx: Polyline > Marker w koordynatach ulicy (odwrócenie lon/lat → lat/lon) > fallback centrum; typ street_geojson w mockData.ts
- 2026-04-09: Obrysy budynków na mapie — Building model+schema, GET /streets/{id}/buildings, AdminEventForm z mapą + zaznaczaniem poligonów (FeatureCollection → geojson_segment), EventMap obsługuje FeatureCollection
- 2026-04-09: Bulk zgłaszanie + synchronizacja GIS (Sesja 13) — AdminEventForm kompletna przebudowa: 3-zakładkowy wybór zakresu (mapa/zakres/lista), wspólny stan selectedBuildingIds, helpery parseHouseNumber/isInRange/sortHouseNumbers, mechanizm koszyka eventsQueue z Promise.all, QueueCard komponent, naprawiono [7.1]/[7.2]/[7.3] z listy poprawek GIS
- 2026-04-10: Naprawa [7.4] + [4.12] — `update_event`: oba selecty ładują `selectinload(Event.street)`, `event.street_geojson` ustawiane po zapisie; powiadomienia wysyłane tylko przy faktycznej zmianie statusu (`update_data["status"] != old_status`); stary status przekazywany do `notify_event(old_status=)` → nowy szablon SMS/email "status zmienił się z X na Y" z etykietami po polsku
- 2026-04-10: Globalna naprawa stref czasowych [3.11] — Backend: `_utc_iso()` + `@field_serializer` w `schemas/event.py` (wszystkie timestampy z `+00:00`). Frontend: `utils.ts` SSoT (`parseUTC`, `toLocalISO`, `toUTCISO`, `formatDate`, `formatDateTime`) zastosowane w AdminEventForm/EventCard/AdminDashboard/AdminSubscribers/AdminNotifications. Migracja TIMESTAMPTZ przygotowana (nie uruchomiona).
- 2026-04-10: Poprawki logiki powiadomień [4.17+4.18] — szablony retroaktywne z aktualnym statusem (`build_sms_retroactive_message`, `build_email_retroactive_body`); DELETE /events/{id} wysyła powiadomienie zamykające (`await notify_event` synchronicznie) przed fizycznym usunięciem; FK `notification_log.event_id` naprawiona ON DELETE SET NULL + migracja `20260410_notif_fk` + `passive_deletes=True`
- 2026-04-10: Zaawansowana interaktywność mapy [4.15+4.16] — `EventMap.Props`: `setFocusedEventId`; markery z `eventHandlers.click`. `MapController`: `flyToBounds` dla FeatureCollection (L.geoJSON().getBounds(), padding 50px, maxZoom 18), `flyTo` dla punktów/Polyline. Poligony: `fillOpacity` 0.5→0.6. `Index.tsx` przekazuje `setFocusedEventId` do `EventMap`.
