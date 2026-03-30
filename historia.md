# Historia i stan projektu — Event Hub Lublin

> Ostatnia aktualizacja: 2026-03-30

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
│   └── PROGRESS.md                    # Co jest zrobione, co jest następne
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
│   │       └── 20260329_937cb6bd3ab4_initial_tables.py
│   │
│   ├── app/
│   │   ├── main.py                    # FastAPI app, CORS (localhost:8080/5173), health check
│   │   ├── config.py                  # Pydantic Settings z .env
│   │   ├── database.py                # AsyncEngine, AsyncSession, get_db()
│   │   ├── dependencies.py            # get_current_user (JWT), re-export get_db
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
│   │   │   ├── auth.py                # POST /api/v1/auth/login (OAuth2 form)
│   │   │   ├── streets.py             # GET /api/v1/streets?q= (ILIKE autocomplete)
│   │   │   ├── events.py              # GET/POST/PUT /api/v1/events + notify trigger
│   │   │   └── subscribers.py         # POST/GET/DELETE /api/v1/subscribers/{token}
│   │   │
│   │   ├── schemas/
│   │   │   ├── auth.py                # Token, TokenData, LoginRequest
│   │   │   ├── street.py              # StreetResponse
│   │   │   ├── event.py               # EventCreate, EventUpdate, EventResponse, EventHistoryResponse
│   │   │   └── subscriber.py          # AddressCreate, SubscriberCreate, SubscriberResponse
│   │   │
│   │   ├── services/
│   │   │   ├── gateways.py            # SMSGateway ABC, MockSMSGateway, EmailSender
│   │   │   └── notification_service.py # match_subscribers, notify_event, nocna cisza
│   │   │
│   │   └── utils/
│   │       └── security.py            # hash_password, verify_password, create_access_token
│   │
│   ├── scripts/
│   │   ├── seed.py                    # Dane testowe (idempotentny)
│   │   └── import_streets.py          # Import TERYT z XML (1378 ulic, idempotentny)
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
│       │   ├── Unsubscribe.tsx        # Wyrejestrowanie RODO przez token
│       │   └── NotFound.tsx           # 404
│       │
│       ├── components/
│       │   ├── EventMap.tsx           # Leaflet mapa z kolorami statusów, GeoJSON/marker fallback
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
│       │   ├── api.ts                 # apiFetch — VITE_API_URL, Bearer token, JSON
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
- Seed data: admin/admin123 (bcrypt), 5 ulic, 3 zdarzenia, 2 subskrybenci
- Import TERYT: 1378 ulic Lublina z XML GUS (upsert batch=100, idempotentny)
- Notification Engine: MockSMSGateway, EmailSender (mock/real), matching alfanumeryczny, nocna cisza, notification_log
- Podłączenie powiadomień do events router (asyncio.create_task)

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
| 4 | Events — CRUD + historia statusów | ✅ zrobione |
| 5 | Subscribers — rejestracja, RODO delete | ✅ zrobione |
| 6 | Notification Engine — SMS/email, matching | ✅ zrobione |
| 7 | Podłączenie powiadomień do events router | ✅ zrobione |
| 8 | Seed data | ✅ zrobione |
| 9 | Import TERYT (1378 ulic XML) | ✅ zrobione |
| 10 | Frontend — integracja Full-Stack z Vite | ✅ zrobione |
| 11 | Admin endpoints (stats, subskrybenci, log) | ⏳ następne |
| 12 | Geocoding Nominatim → GeoJSON streets | ⏳ następne |
| 13 | Endpoint GET /events/feed (IVR 994) | ⏳ następne |
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
| MockSMSGateway | Bramka SMS MPWiK bez dokumentacji API na etapie dev |
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
alembic upgrade head          # tylko przy pierwszym uruchomieniu
python -m scripts.seed        # tylko przy pierwszym uruchomieniu
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

**Logowanie admina:** `admin` / `admin123`
