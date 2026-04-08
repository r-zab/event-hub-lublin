# Historia i stan projektu — Event Hub Lublin

> Ostatnia aktualizacja: 2026-04-08 (Integracja przestrzenna GeoJSON → Leaflet — street_geojson w EventResponse + poprawne markery na mapie)

---

## Czym jest projekt

System powiadamiania mieszkańców Lublina o awariach i przerwach w dostawie wody,
tworzony we współpracy z MPWiK Lublin. Realizowany na Festiwal Biznesu — Politechnika Lubelska.

**Zespół:** Rafał Zaborek, Jakub Zatorski, Mateusz Duda
**Kierunek:** Sztuczna Inteligencja w Biznesie

---

## Struktura plików projektu

```
event-hub-lublin/
│
├── CLAUDE.md                          # Instrukcje dla AI — stack, zasady, co robić
├── README.md                          # Opis projektu
├── docker-compose.yml                 # PostgreSQL 16 + backend w Docker
├── .env                               # Zmienne środowiskowe (lokalne, nie w git)
├── .env.example                       # Przykładowe zmienne środowiskowe
├── .gitignore
├── historia.md                        # Ten plik — źródło prawdy o stanie projektu
│
├── docs/
│   ├── PROJECT_CONTEXT.md             # Kontekst biznesowy, rozmowy z MPWiK, decyzje
│   ├── TECH_SPEC.md                   # Specyfikacja techniczna: API, baza danych, algorytmy
│   ├── RULES.md                       # Zasady pracy: styl kodu, workflow, bezpieczeństwo
│   ├── PROGRESS.md                    # Co jest zrobione, co jest następne
│   └── lista_rzeczy_do_poprawek.md    # Audyt techniczny — kompletna lista poprawek
│
├── backend/                           # === AKTYWNY — Python/FastAPI ===
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   │
│   ├── alembic/
│   │   ├── env.py
│   │   ├── script.py.mako
│   │   └── versions/
│   │       ├── 20260329_937cb6bd3ab4_initial_tables.py
│   │       └── 20260403_add_notify_flags_to_subscribers.py
│   │
│   ├── app/
│   │   ├── main.py                    # FastAPI app, CORS (localhost:8080/5173), health check
│   │   ├── config.py                  # Pydantic Settings z .env
│   │   ├── database.py                # AsyncEngine, AsyncSession, get_db()
│   │   ├── dependencies.py            # get_current_user (JWT), get_current_admin (role check), re-export get_db
│   │   ├── limiter.py                 # Shared slowapi Limiter (key_func=get_remote_address)
│   │   │
│   │   ├── models/
│   │   │   ├── user.py                # User (dispatcher/admin, bcrypt hash)
│   │   │   ├── street.py              # Street (teryt_sym_ul, name, full_name, geojson)
│   │   │   ├── event.py               # Event + EventHistory
│   │   │   ├── subscriber.py          # Subscriber + SubscriberAddress
│   │   │   ├── notification.py        # NotificationLog (sms/email audit)
│   │   │   └── api_key.py             # ApiKey (multi-operator, future)
│   │   │
│   │   ├── routers/
│   │   │   ├── auth.py                # POST /api/v1/auth/login (OAuth2 form), POST /auth/refresh
│   │   │   ├── streets.py             # GET /api/v1/streets?q= (ILIKE autocomplete)
│   │   │   ├── events.py              # GET/POST/PUT/DELETE /api/v1/events + notify trigger
│   │   │   ├── subscribers.py         # POST/GET/DELETE /api/v1/subscribers/{token}
│   │   │   └── admin.py               # GET /api/v1/admin/stats|subscribers|notifications (JWT admin)
│   │   │
│   │   ├── schemas/
│   │   │   ├── auth.py                # Token, TokenData, LoginRequest
│   │   │   ├── street.py              # StreetResponse
│   │   │   ├── event.py               # EventCreate, EventUpdate, EventResponse, EventHistoryResponse
│   │   │   └── subscriber.py          # AddressCreate, SubscriberCreate, SubscriberResponse
│   │   │
│   │   ├── services/
│   │   │   ├── gateways.py            # SMSGateway ABC, MockSMSGateway, SMSEagleGateway, EmailSender
│   │   │   └── notification_service.py # match_subscribers, notify_event, nocna cisza, kill-switch email, process_morning_queue
│   │   │
│   │   └── utils/
│   │       └── security.py            # hash_password, verify_password, create_access_token
│   │
│   ├── scripts/
│   │   ├── import_streets.py          # Import TERYT z XML (1378 ulic, idempotentny)
│   │   ├── setup_dev_users.py         # Inicjalizacja kont dev: admin + dyspozytor1 + dyspozytor2 (idempotentny)
│   │   └── geocode_streets.py         # Geocoding ulic przez Nominatim → street.geojson (Point), delay 1.2s, --dry-run/--limit
│   │
│   └── data/
│       └── ULIC_29-03-2026.xml        # Źródłowy plik TERYT z GUS
│
├── frontend/                          # === AKTYWNY — React 18 + TypeScript (Vite) ===
│   ├── .env                           # VITE_API_URL=http://localhost:8000/api/v1
│   ├── vite.config.ts                 # Proxy /api → localhost:8000, port 8080
│   ├── package.json
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx                   # Vite entry point
│       ├── App.tsx                    # React Router setup
│       │
│       ├── pages/
│       │   ├── Index.tsx              # Strona główna — mapa + lista aktywnych awarii
│       │   ├── Register.tsx           # Rejestracja subskrybenta (multi-adres, RODO)
│       │   ├── About.tsx              # O projekcie
│       │   ├── AdminLogin.tsx         # Logowanie JWT (x-www-form-urlencoded)
│       │   ├── AdminDashboard.tsx     # Panel dyspozytora — tabela zdarzeń, filtry, historia
│       │   ├── AdminEventForm.tsx     # Formularz zdarzenia — autocomplete TERYT, status
│       │   ├── AdminSubscribers.tsx   # Lista subskrybentów (paginacja, email/tel/adresy/zgody)
│       │   ├── AdminNotifications.tsx # Log powiadomień (paginacja, kanał/status/treść)
│       │   ├── Unsubscribe.tsx        # Wyrejestrowanie RODO przez token
│       │   └── NotFound.tsx           # 404
│       │
│       ├── components/
│       │   ├── EventMap.tsx           # Leaflet mapa z kolorami statusów; Polyline > street_geojson Point > fallback centrum
│       │   ├── EventCard.tsx          # Karta zdarzenia na stronie głównej
│       │   ├── AddressRow.tsx         # Wiersz adresu w formularzu rejestracji
│       │   ├── StatusBadge.tsx        # Kolorowa etykieta statusu
│       │   ├── AdminLayout.tsx        # Wrapper panelu admina
│       │   ├── ProtectedAdminLayout.tsx # Guard JWT (redirect na login)
│       │   ├── PublicLayout.tsx       # Wrapper stron publicznych
│       │   └── ui/                    # ~60 komponentów shadcn/ui (Tailwind CSS)
│       │
│       ├── hooks/
│       │   ├── useAuth.tsx            # AuthContext, login/logout, localStorage token
│       │   ├── useEvents.ts           # Fetch + filtrowanie in-memory + paginacja
│       │   └── useStreets.ts          # Autocomplete — apiFetch /streets?q=, min 3 znaki
│       │
│       ├── lib/
│       │   ├── api.ts                 # apiFetch — VITE_API_URL, Bearer token, JSON; obsługa 401→logout+redirect
│       │   └── utils.ts               # cn() helper (Tailwind)
│       │
│       └── data/
│           └── mockData.ts            # Typy TypeScript + stałe (EVENT_TYPES, STATUS_LABELS)
│
├── nginx/                             # Konfiguracja Nginx (do zrobienia)
├── presentation/slides/               # Prezentacja na Festiwal Biznesu
├── research/ankieta/wyniki/           # Wyniki badań/ankiet
└── scripts/                           # Skrypty na poziomie projektu
```

---

## Architektura przepływu danych

```
DYSPOZYTOR (przeglądarka React)
        │
        │  1. Logowanie: POST /api/v1/auth/login
        │     form-urlencoded → JWT Bearer token (30 min)
        │
        │  2. Zgłoszenie awarii: POST /api/v1/events
        │     JSON + Authorization: Bearer <token>
        │
        ▼
FASTAPI (localhost:8000)
  ├── CORSMiddleware (localhost:8080 / 5173)
  ├── JWT verify → pobranie User z bazy
  ├── Walidacja Pydantic (EventCreate schema)
  ├── Zapis Event do PostgreSQL (ORM SQLAlchemy async)
  │
  └── asyncio.create_task(notify_event(event_id))
              │
              ▼
     NOTIFICATION ENGINE
       ├── Pobranie Event + Street z bazy
       ├── SELECT subscribers WHERE street_id = event.street_id
       ├── Filtr Pythonowy: numer domu w zakresie (alfanumeryczny)
       ├── Filtr: rodo_consent = TRUE
       │
       ├── DLA KAŻDEGO SUBSKRYBENTA:
       │   ├── Wyślij EMAIL (zawsze) — aiosmtplib / MockEmailSender
       │   └── Wyślij SMS:
       │       ├── Jeśli 22:00–06:00 i brak night_sms_consent → status: queued_morning
       │       └── W innym przypadku → MockSMSGateway (log) / prawdziwa bramka
       │
       └── Zapis do notification_log (channel, recipient, status, sent_at)
              │
              ▼
     PostgreSQL 16 (Docker, port 5432)
       Tables: events, notification_log, subscribers, subscriber_addresses,
               streets (1378 ulic TERYT), users, event_history, api_keys
              │
              ▼
MIESZKANIEC (SMS / Email)
  ← "Uwaga! Awaria sieci wodociągowej. Ul. Lipowa 1–20. Szac. czas naprawy: 18:00"
```

---

## Co zostało zrobione

### Sesja 1 (2026-03-29) — Fundament backendu
- Struktura katalogów i pliki startowe
- Docker: PostgreSQL 16 Alpine z healthcheck
- FastAPI starter: main.py, config.py, database.py
- Modele SQLAlchemy 2.0 (8 tabel z indeksami)
- Alembic konfiguracja async + migracja `initial tables` (rev 937cb6bd3ab4)
- Auth: security.py (bcrypt/12, JWT HS256), dependencies.py, routers/auth.py, schemas/auth.py
- Streets: routers/streets.py (ILIKE autocomplete), schemas/street.py
- Events: routers/events.py (GET lista/szczegóły, POST/PUT z JWT, EventHistory)

### Sesja 2 (2026-03-30) — Subskrybenci, dane, powiadomienia
- Subscribers: rejestracja wieloadresowa, podgląd tokenem, fizyczne usunięcie RODO
- Import TERYT: 1378 ulic Lublina z XML GUS (upsert batch=100, idempotentny)
- Notification Engine: MockSMSGateway, EmailSender (mock/real), matching alfanumeryczny, nocna cisza, notification_log
- Podłączenie powiadomień do events router (asyncio.create_task)
- **seed.py usunięty** (2026-04-03) — baza wyczyszczona, zawiera wyłącznie 1378 ulic TERYT

### Sesja 4 (2026-04-03) — SMSEagle + preferencje powiadomień

Na podstawie notatek ze spotkania z szefem IT MPWiK (2026-04-01) oraz dokumentacji SMSEagle API v2:

- **models/subscriber.py**: dodano pola `notify_by_email` i `notify_by_sms` (bool, domyślnie `True`)
- **schemas/subscriber.py**: pola `notify_by_email` i `notify_by_sms` w `SubscriberCreate` i `SubscriberResponse`
- **routers/subscribers.py**: nowe pola przekazywane przy tworzeniu subskrybenta
- **config.py**: dodano `ENABLE_EMAIL_NOTIFICATIONS` (kill-switch emaili), `SMSEAGLE_URL`, `SMSEAGLE_API_TOKEN`
- **gateways.py**: implementacja `SMSEagleGateway` (POST `/messages/sms`, nagłówek `access-token`); aktualizacja `get_sms_gateway` (typ `smseagle`)
- **notification_service.py**: silnik powiadomień respektuje `ENABLE_EMAIL_NOTIFICATIONS` oraz `subscriber.notify_by_email/sms`
- **alembic/versions/20260403_add_notify_flags_to_subscribers.py**: migracja dodająca kolumny do tabeli `subscribers`
- **frontend/Register.tsx**: sekcja "Kanały powiadomień" z checkboxami e-mail i SMS

### Sesja 3 (2026-03-30) — Integracja Full-Stack
- Przeniesienie frontendu z Lovable do lokalnego środowiska Vite (`frontend/`)
- Konfiguracja BASE_URL przez `import.meta.env.VITE_API_URL` (usunięcie nagłówków ngrok)
- frontend/.env: `VITE_API_URL=http://localhost:8000/api/v1`
- Vite proxy: `/api` → `localhost:8000` (bez CORS w dev przez proxy)
- CORS backend: konkretne origins (localhost:8080, localhost:5173), `allow_credentials=True`
- useAuth.tsx: logowanie przez `application/x-www-form-urlencoded` (standard OAuth2/FastAPI)
- Wszystkie hooki (useEvents, useStreets, useAuth) zintegrowane z lokalnym API

---

## Tabela zadań

| # | Zadanie | Status |
|---|---------|--------|
| 1 | Alembic — pierwsza migracja | ✅ zrobione |
| 2 | Auth — JWT, bcrypt, login endpoint | ✅ zrobione |
| 3 | Streets — autocomplete TERYT | ✅ zrobione |
| 4 | Events — CRUD (w tym DELETE admin) + historia statusów | ✅ zrobione |
| 5 | Subscribers — rejestracja, RODO delete | ✅ zrobione |
| 6 | Notification Engine — SMS/email, matching | ✅ zrobione |
| 7 | Podłączenie powiadomień do events router | ✅ zrobione |
| 8 | Seed data | ✅ zrobione |
| 9 | Import TERYT (1378 ulic XML) | ✅ zrobione |
| 10 | Frontend — integracja Full-Stack z Vite | ✅ zrobione |
| 11 | SMSEagle gateway + preferencje kanałów + kill-switch emaili | ✅ zrobione |
| 12 | Admin endpoints (stats, subskrybenci, log) | ✅ zrobione |
| 12 | Geocoding Nominatim → GeoJSON streets | ✅ zrobione |
| 13 | Wygasanie sesji JWT + strony AdminSubscribers + AdminNotifications | ✅ zrobione |
| 14 | Integracja przestrzenna GeoJSON → Leaflet (street_geojson w API + markery na mapie) | ✅ zrobione |
| 15 | Endpoint GET /events/feed (IVR 994) | ⏳ następne |
| 14 | Testy jednostkowe/integracyjne backendu | ☐ backlog |
| 15 | Nginx reverse proxy (prod) | ☐ backlog |

---

## Kluczowe decyzje techniczne

| Decyzja | Powód |
|---------|-------|
| Adresy z TERYT (słownikowane) | Wymaganie MPWiK — brak literówek, autocomplete |
| Linie ulic na mapie (nie okręgi) | Wymaganie MPWiK — precyzja, prawdziwy zasięg awarii |
| Fizyczne delete (nie soft delete) | RODO — pełne usunięcie danych subskrybenta |
| SMS nocne osobna zgoda | Wymaganie prawne — domyślnie wyłączone |
| `source` w events | Multi-operator ready (LPEC, ZDiM i inne w przyszłości) |
| MockSMSGateway / SMSEagleGateway | Dev: mock; prod: SMSEagle API v2 (POST /messages/sms, nagłówek access-token) |
| ENABLE_EMAIL_NOTIFICATIONS | Kill-switch emaili na życzenie Piotrka (szef IT) — ryzyko klasyfikacji jako spam przy dużej liczbie użytkowników |
| notify_by_email / notify_by_sms | Subskrybent wybiera kanały przy rejestracji — wymaganie z notatek spotkania 2026-04-01 |
| asyncpg + psycopg2 (Alembic) | FastAPI async wymaga asyncpg; Alembic nie obsługuje async drivera |
| x-www-form-urlencoded w login | Standard OAuth2 — FastAPI wymaga form, nie JSON |
| Vite proxy zamiast CORS wildcard | Dev: brak CORS issues; prod: nginx reverse proxy |

---

## Changelog

- **2026-03-29**: Auth — `security.py` (bcrypt cost=12, JWT HS256), `schemas/auth.py`, `dependencies.py`, `routers/auth.py` (`POST /api/v1/auth/login`), `main.py` — router auth.
- **2026-03-29**: Streets — `schemas/street.py` (StreetResponse), `routers/streets.py` (GET `/api/v1/streets?q=`, ILIKE).
- **2026-03-29**: Events — `schemas/event.py`, `routers/events.py` (GET lista/szczegóły, POST/PUT JWT + EventHistory).
- **2026-03-29**: Alembic — migracja `initial tables` (rev `937cb6bd3ab4`), 8 tabel w PostgreSQL. Bugfix: `Mapped[func.now]` → `Mapped[datetime]`. Dodano `psycopg2-binary`.
- **2026-03-30**: Subscribers — `schemas/subscriber.py`, `routers/subscribers.py` (POST rejestracja, GET token, DELETE RODO).
- **2026-03-30**: Seed data — `scripts/seed.py` (admin/admin123, 5 ulic, 3 zdarzenia, 2 subskrybenci).
- **2026-03-30**: Import TERYT — `scripts/import_streets.py`; 1378 ulic Lublina z `data/ULIC_29-03-2026.xml`; upsert, idempotentny.
- **2026-03-30**: Notification Engine — `services/gateways.py`, `services/notification_service.py`; matching alfanumeryczny, nocna cisza, `asyncio.create_task` w events router.
- **2026-03-30**: **Integracja Full-Stack** — Frontend z Lovable przeniesiony do `frontend/`; BASE_URL przez `VITE_API_URL`; usunięto nagłówki ngrok; Vite proxy `/api`→`localhost:8000`; CORS backend `localhost:8080/5173`; logowanie OAuth2 `x-www-form-urlencoded`; useStreets autocomplete z 1378 ulic TERYT.
- **2026-04-03**: **Integracja rejestracji + fix TERYT** — `AddressRow.tsx` + `Register.tsx`: `street_id` z TERYT wysyłany w payloadzie; `subscribers.py`: helper `_normalize_street_name()` (iteracyjne stripowanie "ul.", "Ulica" itp.) + `_resolve_street_id()` z `or_(full_name, full_name_stripped, name_normalized)` — obsługuje "ul. Ulica Lipowa" → poprawny `street_id`.
- **2026-04-03**: **SMSEagle + preferencje powiadomień** — implementacja `SMSEagleGateway` (POST `/messages/sms`, nagłówek `access-token`) na podstawie docs/openapi.yaml; dodanie `notify_by_email` i `notify_by_sms` do modelu i schematu Subscriber; migracja Alembic (rev `b1c2d3e4f5a6`); kill-switch `ENABLE_EMAIL_NOTIFICATIONS` w config; silnik powiadomień respektuje preferencje subskrybenta i kill-switch; checkboxy kanałów w formularzu rejestracji frontendu.
- **2026-04-03**: **Audyt techniczny** — `docs/lista_rzeczy_do_poprawek.md`: kompleksowy przegląd kodu (backend + frontend + baza), analiza zgodności z TECH_SPEC i notatkami ze spotkania z szefem IT. Zidentyfikowano 8 błędów krytycznych (m.in. zepsuty Unsubscribe, brak unique email, nocna cisza w UTC), 8 brakujących funkcji, 10 problemów UX, 13 pozycji długu technicznego. Priorytetyzacja napraw w 3 kategoriach.
- **2026-04-04**: **Naprawa Unsubscribe.tsx** — przepisano stronę wyrejestrowania: token zamiast e-mail, auto-load z `?token=` w URL, 2-etapowy flow (GET weryfikacja → podgląd danych subskrybenta → DELETE potwierdzenie), toast na 404, stan ładowania, redirect na `/` po sukcesie.
- **2026-04-04**: **Unikalność subskrybentów (pkt 1.2 + 1.3 audytu)** — `unique=True` na `email` i `phone` w modelu `Subscriber`; endpoint `POST /subscribers` zwraca HTTP 409 gdy e-mail lub telefon już istnieje w bazie; migracja Alembic rev `c2d3e4f5a6b7` (`uq_subscribers_email`, `uq_subscribers_phone`).
- **2026-04-04**: **Skrypt setup_dev_users.py** — zastąpił `reset_admin.py`; idempotentny skrypt tworzący/aktualizujący 3 konta deweloperskie: `admin` (rola admin, hasło admin123), `dyspozytor1` i `dyspozytor2` (rola dispatcher, hasło lublin123); poprawia też błędną rolę admina gdy jest w bazie z domyślnym `dispatcher`; stary `reset_admin.py` usunięty.
- **2026-04-04**: **Konfiguracja logowania + wyciszenie SQLAlchemy (pkt 4.1 + 4.13 audytu)** — `logging.basicConfig` z formatem `%(asctime)s [%(levelname)s] %(name)s: %(message)s` w `main.py`; poziom `DEBUG` gdy `settings.DEBUG=True`, `INFO` produkcyjnie; `sqlalchemy.engine`/`sqlalchemy.pool` wyciszone do `WARNING` (błędy DB nadal widoczne, surowy SQL ukryty); `print()` zastąpione `logger.info()` w lifespan.
- **2026-04-04**: **Obsługa błędów w tle — error handling powiadomień (pkt 1.8 audytu)** — `notify_event()` owinięto zewnętrznym `try/except Exception` z `logger.exception()` (pełny traceback); pętla per-subskrybent izolowana w `_send_notifications_for_subscriber()` z własnym `try/except` — błąd dla jednej osoby nie blokuje pozostałych; log podsumowujący `sent_count`/`error_count`; `events.py`: `task.add_done_callback(_log_task_exception)` jako druga linia obrony.
- **2026-04-04**: **Refresh token + naprawa strefy czasowej nocnej ciszy (pkt 1.5 + 1.6 audytu)** — `security.py`: `create_refresh_token()` generuje JWT z claim `type=refresh`, ważność 7 dni (`REFRESH_TOKEN_EXPIRE_DAYS`); `schemas/auth.py`: nowy model `RefreshRequest`, pole `refresh_token` opcjonalne w `Token`; `routers/auth.py`: endpoint `POST /api/v1/auth/refresh` — weryfikuje claim `type=refresh`, zwraca nowy access token; login zwraca teraz też `refresh_token`; `notification_service.py`: `_is_night_hours()` używa `ZoneInfo("Europe/Warsaw")` zamiast UTC — eliminuje błąd 1–2 godziny przy CET/CEST.
- **2026-04-04**: **DELETE zdarzenia + pełny cykl edycji (pkt 1.4 + 1.7 audytu)** — Backend: `DELETE /api/v1/events/{id}` z weryfikacją `user.role == 'admin'` (HTTP 403 dla dispatchera), fizyczne usunięcie rekordu + cascade history, HTTP 204. Frontend: `api.ts` obsługuje 204 No Content; `useEvents.ts` eksportuje `getEvent`/`updateEvent`/`deleteEvent`; trasa `/admin/events/edit/:id` w `App.tsx`; `AdminDashboard` — ikona Edytuj z dynamicznym id + AlertDialog z potwierdzeniem usunięcia i `refetch()` bez przeładowania strony; `AdminEventForm` — `useParams`, ładowanie danych zdarzenia przy montowaniu, PUT przy edycji / POST przy tworzeniu, spinner ładowania, różne tytuły i toasty.
- **2026-04-08**: **Admin endpoints + weryfikacja roli (pkt 2.1 + 2.4 audytu)** — `dependencies.py`: nowa funkcja `get_current_admin` sprawdzająca `user.role == "admin"`, rzuca HTTP 403 dla dyspozytora; eksportowana w `__all__`. Nowy plik `routers/admin.py`: router z dependency `get_current_admin` dla całego prefiksu `/api/v1/admin`; endpoint `GET /admin/stats` (total_subscribers, active_events, notifications_sent); `GET /admin/subscribers` (paginacja skip/limit, sort created_at DESC, eager-load adresów, total_count); `GET /admin/notifications` (paginacja skip/limit, sort sent_at DESC, total_count). Lokalne schematy Pydantic: StatsResponse, AdminSubscriberItem/List, AdminNotificationItem/List. `main.py`: import `admin` + `app.include_router` pod `/api/v1/admin`. Bugfix: `selectinload(Subscriber.addresses)` zamiast ręcznego mapowania (eliminuje MissingGreenlet).
- **2026-04-08**: **Rate limiting + walidacja telefonu + scheduler SMS (pkt 2.6 + 2.7 + 2.8 audytu)** — nowy `app/limiter.py` (współdzielona instancja `Limiter(key_func=get_remote_address)`); `main.py`: `app.state.limiter`, `add_exception_handler(RateLimitExceeded)`, `AsyncIOScheduler` z jobem `process_morning_queue` cron 06:00 Europe/Warsaw (start/shutdown w lifespan); `routers/auth.py`: `@limiter.limit("5/minute")` na login (brute-force guard); `routers/subscribers.py`: `@limiter.limit("3/minute")` na rejestrację (anty-spam); `schemas/subscriber.py`: `phone_format` validator — regex `^\+48\d{9}$|^\d{9}$`, strip spacji i myślników, ValueError z komunikatem; `frontend/Register.tsx`: `pattern="^(\+48)?\d{9}$"` + `title` na inpucie telefonu (HTML5 walidacja przeglądarki); `services/notification_service.py`: `process_morning_queue()` — otwiera własną sesję DB, SELECT `queued_morning`, wysyła SMS przez bramkę, aktualizuje status `sent`/`failed`, loguje podsumowanie; `requirements.txt`: `apscheduler==3.10.4`.
- **2026-04-08**: **Wygasanie sesji JWT + strony admin (pkt 3.3 + 3.5 + 3.6 audytu)** — `frontend/src/lib/api.ts`: blok `if (res.status === 401)` usuwa `mpwik_token` i `mpwik_refresh_token` z localStorage, a następnie przekierowuje na `/admin/login` — działa dla dowolnego endpointu admina. Nowa strona `AdminSubscribers.tsx`: tabela subskrybentów z react-query (`GET /admin/subscribers`), paginacja 20/strona, kolumny: e-mail, telefon, kanały (badge), zgody RODO/nocne, lista adresów, data rejestracji, spinner i obsługa błędu. Nowa strona `AdminNotifications.tsx`: log powiadomień (`GET /admin/notifications`), paginacja 20/strona, kolumny: data, kanał (badge), odbiorca, status (badge kolorowy), zdarzenie #id, treść (truncate + title tooltip), spinner. `App.tsx`: trasy `/admin/subscribers` i `/admin/notifications` pod `ProtectedAdminLayout`. `AdminLayout.tsx`: 2 nowe pozycje w sidebarze — "Subskrybenci" (ikona `Users`) i "Logi powiadomień" (ikona `MessageSquare`) z `lucide-react`.
- **2026-04-08**: **Geocoding ulic — Nominatim → GeoJSON (pkt 2.5 audytu)** — nowy `scripts/geocode_streets.py`: async, otwiera sesję DB, SELECT ulic z `geojson IS NULL`, zapytanie GET `{NOMINATIM_URL}/search?q=ul. {name}, Lublin, Poland&format=json&limit=1`, nagłówek `User-Agent` z `settings.NOMINATIM_USER_AGENT`, zapis `{"type":"Point","coordinates":[lon,lat]}` do `street.geojson` + commit, `await asyncio.sleep(delay)` między zapytaniami (domyślnie 1.2 s — Nominatim Usage Policy); obsługa błędów HTTP i połączenia per-ulica; flagi CLI `--delay`, `--dry-run`, `--limit`; idempotentny (pomija ulice z istniejącym geojson). Rozwiązuje też pkt 3.7 (fallback marker w centrum mapy).

---

## Zmienne środowiskowe

### Backend (`.env` w katalogu głównym)
```env
DATABASE_URL=postgresql+asyncpg://eventhub:devpassword@localhost:5432/eventhub
SECRET_KEY=your-secret-key-here
SMS_GATEWAY_TYPE=mock
SMTP_HOST=localhost
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
CORS_ORIGINS=http://localhost:8080,http://localhost:5173
```

### Frontend (`frontend/.env`)
```env
VITE_API_URL=http://localhost:8000/api/v1
```

---

## Jak uruchomić lokalnie

```bash
# Terminal 1 — baza danych
docker compose up db -d

# Terminal 2 — backend (z katalogu backend/)
cd backend
alembic upgrade head                # tylko przy pierwszym uruchomieniu
python -m scripts.import_streets    # tylko przy pierwszym uruchomieniu (1378 ulic TERYT)
python -m scripts.setup_dev_users   # tylko przy pierwszym uruchomieniu (admin + dyspozytor1 + dyspozytor2)
uvicorn app.main:app --reload --port 8000

# Terminal 3 — frontend (z katalogu frontend/)
cd frontend
npm install                   # tylko przy pierwszym uruchomieniu
npm run dev
```

**Dostęp:**
- Frontend: http://localhost:8080
- API docs: http://localhost:8000/docs
- Health: http://localhost:8000/health

**Konta deweloperskie** (po uruchomieniu `setup_dev_users.py`):
- Admin: `admin` / `admin123`
- Dyspozytor: `dyspozytor1` / `lublin123`, `dyspozytor2` / `lublin123`
