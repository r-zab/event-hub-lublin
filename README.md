System Powiadomień MPWiK Lublin

System powiadamiania mieszkańców Lublina o awariach i przerwach w dostawie wody, tworzony we współpracy z MPWiK Lublin.

Projekt realizowany na **Festiwal Biznesu — Politechnika Lubelska**.
Kierunek: Sztuczna Inteligencja w Biznesie | Zespół: Rafał Zaborek, Jakub Zatorski, Mateusz Duda

---

## Stack technologiczny

| Warstwa | Technologie |
|---------|-------------|
| Backend | Python 3.12 + FastAPI (async) |
| Baza danych | PostgreSQL 16 + PostGIS 16-3.4 (Docker) |
| ORM / migracje | SQLAlchemy 2.0 async + Alembic |
| Auth | JWT HS256 (python-jose) + bcrypt cost=12 (passlib) |
| Powiadomienia | aiosmtplib (email) + SMSEagle / MockSMSGateway |
| Harmonogram | APScheduler (poranna kolejka SMS 06:00 Warsaw) |
| Frontend | React 18 + TypeScript + Vite + shadcn/ui + Tailwind CSS |
| Mapa | Leaflet + React-Leaflet (obrysy budynków, FeatureCollection) |
| Infra | Docker Compose |

---

## Uruchomienie projektu od zera

### Wymagania

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Docker Engine + Compose v2)
- [Node.js 20+](https://nodejs.org/) (dla frontendu)
- Git

### Krok 1 — Pobierz repozytorium

```bash
git clone <url-repozytorium>
cd event-hub-lublin
```

### Krok 2 — Konfiguracja zmiennych środowiskowych

Skopiuj przykładowy plik i uzupełnij wartości:

```bash
cp .env.example .env
```

Minimalna zawartość `.env` do uruchomienia lokalnego:

```env
DATABASE_URL=postgresql+asyncpg://eventhub:devpassword@db:5433/eventhub
POSTGRES_DB=eventhub
POSTGRES_USER=eventhub
POSTGRES_PASSWORD=devpassword
SECRET_KEY=zmien-na-tajny-klucz-minimum-32-znaki
CORS_ORIGINS=http://localhost:8080,http://localhost:5173
ENABLE_EMAIL_NOTIFICATIONS=false
SMS_GATEWAY_TYPE=mock
DEBUG=true
```

### Krok 3 — Uruchom bazę danych i backend

```bash
docker compose up -d
```

Uruchamia:
- `db` — PostGIS 16-3.4 na porcie `5433`
- `backend` — FastAPI na porcie `8000`

Health check: `curl http://localhost:8000/health`
Swagger UI: http://localhost:8000/docs

### Krok 4 — Migracje bazy danych

```bash
docker compose exec backend alembic upgrade head
```

### Krok 5 — Zasilanie bazy danych

```bash
# Import 1378 ulic z TERYT (wymagany)
docker compose exec backend python -m scripts.import_streets

# Import obrysów budynków (zalecany)
docker compose exec backend python -m scripts.import_buildings

# Konta deweloperskie
docker compose exec backend python -m scripts.setup_dev_users
```

Konta deweloperskie:

| Login | Hasło | Rola |
|-------|-------|------|
| `admin` | `Admin123secure` | admin |
| `dyspozytor1` | `Lublin123secure` | dispatcher |

### Krok 6 — Uruchom frontend

```bash
cd frontend && npm install && npm run dev
# http://localhost:8080
```

Panel admina: http://localhost:8080/sys-panel/login

---

## Struktura projektu

```
event-hub-lublin/
├── backend/
│   ├── app/
│   │   ├── main.py               # FastAPI app, CORS, scheduler, lifespan
│   │   ├── config.py             # Pydantic Settings z .env
│   │   ├── database.py           # AsyncEngine + AsyncSession
│   │   ├── dependencies.py       # get_db, get_current_user, get_current_admin
│   │   ├── models/               # SQLAlchemy 2.0 ORM
│   │   ├── schemas/              # Pydantic v2 I/O schemas
│   │   ├── routers/              # endpointy API (auth, events, streets, subscribers, admin...)
│   │   └── services/
│   │       ├── gateways.py       # SMSGateway ABC, MockSMSGateway, SMSEagleGateway, EmailSender
│   │       └── notification_service.py  # matching, nocna cisza, queued_morning
│   ├── alembic/                  # migracje bazy danych
│   ├── scripts/                  # import_streets, import_buildings, setup_dev_users, seed_demo
│   ├── tests/                    # pytest: 2FA, RBAC, walidacja, event_close
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/                # Index, Register, Unsubscribe, AdminDashboard, AdminEventForm...
│   │   ├── components/           # EventMap, EventCard, StatusBadge, AdminLayout...
│   │   ├── hooks/                # useAuth, useEvents, useStreets, useDepartments, useEventTypes...
│   │   └── lib/
│   │       ├── api.ts            # apiFetch (Bearer, obsługa 401→refresh→logout)
│   │       └── utils.ts          # parseUTC, formatDateTime, formatEventNumbers, streetLabel...
│   └── vite.config.ts            # proxy /api → localhost:8000
├── docs/
│   ├── roadmap_finalna_maj.md    # Aktualny plan sprint — 14 maja 2026
│   ├── stan_projektu.md          # Status zadań + co naprawione
│   ├── PROJECT_CONTEXT.md        # Kontekst biznesowy, decyzje projektowe
│   ├── TECH_SPEC.md              # Specyfikacja API, schemat bazy, algorytmy
│   └── RULES.md                  # Zasady pracy i styl kodu
├── docker-compose.yml
└── CLAUDE.md                     # Instrukcje dla Claude Code
```

---

## Główne endpointy API

| Metoda | Endpoint | Auth | Opis |
|--------|----------|------|------|
| POST | `/api/v1/auth/login` | — | Logowanie (JWT 30 min + refresh 7 dni) |
| POST | `/api/v1/auth/refresh` | — | Odświeżenie access tokenu |
| GET | `/api/v1/events` | — | Lista zdarzeń (paginacja, filtry) |
| GET | `/api/v1/events/export.csv` | JWT disp/admin | Eksport CSV z filtrami |
| GET | `/api/v1/events/{id}` | — | Szczegóły zdarzenia |
| POST | `/api/v1/events` | JWT disp/admin | Tworzenie zdarzenia + powiadomienia |
| PUT | `/api/v1/events/{id}` | JWT disp/admin | Aktualizacja + powiadomienia |
| GET | `/api/v1/streets?q=lipow` | — | Autocomplete ulic TERYT |
| POST | `/api/v1/subscribers/init` | — | Inicjacja 2FA rejestracji |
| POST | `/api/v1/subscribers/verify` | — | Weryfikacja tokenu + finalziacja |
| DELETE | `/api/v1/subscribers/{token}` | — | Hard delete RODO |
| GET | `/api/v1/admin/subscribers` | JWT admin | Lista subskrybentów |
| GET | `/api/v1/admin/subscribers/export.csv` | JWT admin | Eksport CSV subskrybentów |
| GET | `/api/v1/admin/notifications` | JWT admin | Log powiadomień |
| GET | `/api/v1/admin/notifications/export.csv` | JWT admin | Eksport CSV powiadomień |
| GET | `/api/v1/admin/audit-logs` | JWT admin | Ujednolicony log audytowy |
| GET | `/api/v1/admin/audit-logs/export.csv` | JWT admin | Eksport CSV logów audytowych |
| GET | `/api/v1/admin/users` | JWT admin | Lista kont użytkowników |
| GET | `/api/v1/event-types` | — | Słownik typów zdarzeń |
| GET | `/api/v1/departments` | — | Słownik działów (TSK/TSW/TP...) |
| GET | `/health` | — | Health check |

Pełna dokumentacja (Swagger): http://localhost:8000/docs

---

## Statusy zdarzeń

| Status | Opis |
|--------|------|
| `zgloszona` | Nowe zgłoszenie, oczekuje potwierdzenia |
| `w_naprawie` | Trwają prace serwisowe |
| `usunieta` | Zamknięte / zakończone (soft-delete) |

---

## Kluczowe zasady biznesowe

1. **Adresy słownikowane z TERYT** — 1378 ulic Lublina, autocomplete z DB
2. **GIS realny** — 51 000+ budynków z BDOT10k/PRG/OSM, indeks GIST PostGIS
3. **Multi-select budynków** — dyspozytor klika konkretne budynki na mapie
4. **2FA rejestracji** — token SMS/email weryfikowany przed aktywacją
5. **Cisza nocna SMS** — 22:00–06:00 (Europe/Warsaw), osobna zgoda RODO
6. **Hard delete RODO** — DELETE zamiast soft-delete dla danych osobowych
7. **Defense in Depth** — Pydantic v2 whitelist + slowapi + JWT + RBAC + audit log
8. **sessionStorage** — tokeny izolowane per karta przeglądarki (brak wycieku między sesjami)

---

## Wdrożenie produkcyjne (Oracle Linux — planowane)

```bash
openssl rand -hex 32  # -> SECRET_KEY
docker compose -f docker-compose.prod.yml up -d
docker compose exec backend alembic upgrade head
docker compose exec backend python -m scripts.import_streets
docker compose exec backend python -m scripts.setup_dev_users
```

Docelowy OS: Oracle Linux 9 (zgodnie z wymaganiami MPWiK IT)
