# Event Hub Lublin

System powiadamiania mieszkańców Lublina o awariach i przerwach w dostawie wody, tworzony we współpracy z MPWiK Lublin.

Projekt realizowany na **Festiwal Biznesu — Politechnika Lubelska**.
Kierunek: Sztuczna Inteligencja w Biznesie | Zespół: Rafał Zaborek, Jakub Zatorski, Mateusz Duda

---

## Stack technologiczny

| Warstwa | Technologie |
|---------|-------------|
| Backend | Python 3.12 + FastAPI (async) |
| Baza danych | PostgreSQL 16 (Docker) |
| ORM / migracje | SQLAlchemy 2.0 async + Alembic |
| Auth | JWT HS256 (python-jose) + bcrypt cost=12 (passlib) |
| Powiadomienia | aiosmtplib (email) + SMSEagle / MockSMSGateway |
| Harmonogram | APScheduler (poranna kolejka SMS 06:00 Warsaw) |
| Frontend | React 18 + TypeScript + Vite |
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
# Baza danych
DATABASE_URL=postgresql+asyncpg://eventhub:devpassword@db:5432/eventhub
POSTGRES_DB=eventhub
POSTGRES_USER=eventhub
POSTGRES_PASSWORD=devpassword

# JWT — zmień na losowy string min. 32 znaki!
SECRET_KEY=zmien-na-tajny-klucz-minimum-32-znaki

# CORS — adresy frontendu (przecinkami)
CORS_ORIGINS=http://localhost:8080,http://localhost:5173

# Email (opcjonalne — bez tego działa tryb mock)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
ENABLE_EMAIL_NOTIFICATIONS=false

# SMS
SMS_GATEWAY_TYPE=mock
# Dla produkcji z SMSEagle:
# SMS_GATEWAY_TYPE=smseagle
# SMSEAGLE_URL=http://192.168.1.100
# SMSEAGLE_API_TOKEN=twoj-token

# Geocoding (dla skryptu geocode_streets.py)
NOMINATIM_USER_AGENT=eventhub-lublin/1.0

# Debug
DEBUG=true
```

### Krok 3 — Uruchom bazę danych i backend

```bash
docker compose up -d
```

To polecenie uruchamia:
- `db` — PostgreSQL 16 na porcie `5432`
- `backend` — FastAPI na porcie `8000`

Sprawdź czy backend działa:

```bash
curl http://localhost:8000/health
# {"status": "ok"}
```

Dokumentacja API (Swagger): http://localhost:8000/docs

### Krok 4 — Wykonaj migracje bazy danych

```bash
docker compose exec backend alembic upgrade head
```

Tworzy wszystkie tabele: `users`, `streets`, `events`, `event_history`, `subscribers`, `subscriber_addresses`, `notification_log`, `api_keys`, `buildings`.

### Krok 5 — Zasilanie bazy danych

#### a) Import ulic z TERYT (wymagany)

Pobierz plik `ULIC_*.xml` ze strony GUS (TERYT) i umieść go w `backend/data/`.
Plik `ULIC_29-03-2026.xml` jest już dołączony do repozytorium.

```bash
docker compose exec backend python -m scripts.import_streets
# Importuje 1378 ulic Lublina — idempotentny (bezpieczne wielokrotne uruchomienie)
```

#### b) Geocoding ulic (opcjonalne, ale zalecane)

Uzupełnia kolumnę `geojson` w tabeli `streets` — poprawia wyświetlanie zdarzeń na mapie:

```bash
docker compose exec backend python -m scripts.geocode_streets
# Odpytuje Nominatim, opóźnienie 1.2s/ulicę — ok. 30 min dla wszystkich ulic
# Flagi: --limit 50 --dry-run --delay 1.5
```

#### c) Import obrysów budynków (opcjonalne)

Wymaga pliku `lublin_budynki_final.geojson` (jest w repozytorium):

```bash
docker compose exec backend python -m scripts.import_buildings
# Importuje poligony budynków dla funkcji zaznaczania na mapie w panelu admina
```

#### d) Konta deweloperskie

```bash
docker compose exec backend python -m scripts.setup_dev_users
```

Tworzy konta (idempotentne):

| Login | Hasło | Rola |
|-------|-------|------|
| `admin` | `admin123` | admin |
| `dyspozytor1` | `lublin123` | dispatcher |
| `dyspozytor2` | `lublin123` | dispatcher |

### Krok 6 — Uruchom frontend

```bash
cd frontend
npm install
npm run dev
# http://localhost:8080
```

Frontend komunikuje się z backendem przez proxy Vite (`/api` → `localhost:8000`).

Panel admina: http://localhost:8080/admin/login

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
│   │   ├── limiter.py            # Shared slowapi Limiter (rate limiting)
│   │   ├── models/               # SQLAlchemy 2.0 ORM
│   │   ├── schemas/              # Pydantic v2 I/O schemas
│   │   ├── routers/              # endpointy API (auth, events, streets, subscribers, admin)
│   │   └── services/
│   │       ├── gateways.py       # SMSGateway ABC, MockSMSGateway, SMSEagleGateway, EmailSender
│   │       └── notification_service.py  # matching, nocna cisza, queued_morning, powiadomienia retroaktywne
│   ├── alembic/                  # migracje bazy danych
│   ├── scripts/
│   │   ├── import_streets.py     # import 1378 ulic z XML TERYT GUS
│   │   ├── geocode_streets.py    # geocoding Nominatim → street.geojson
│   │   ├── import_buildings.py   # import obrysów budynków z GeoJSON OSM
│   │   └── setup_dev_users.py    # konta deweloperskie (admin + dyspozytorzy)
│   ├── data/
│   │   └── ULIC_29-03-2026.xml   # plik TERYT z GUS
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/                # Index, Register, Unsubscribe, AdminDashboard, AdminEventForm, ...
│   │   ├── components/           # EventMap, EventCard, StatusBadge, AdminLayout, ...
│   │   ├── hooks/                # useAuth, useEvents, useStreets
│   │   └── lib/
│   │       ├── api.ts            # apiFetch (Bearer, obsługa 401→logout)
│   │       └── utils.ts          # SSoT konwersji dat (parseUTC, formatDateTime, ...)
│   └── vite.config.ts            # proxy /api → localhost:8000
├── docs/
│   ├── PROJECT_CONTEXT.md        # Kontekst biznesowy, decyzje projektowe
│   ├── TECH_SPEC.md              # Specyfikacja API, schemat bazy, algorytmy
│   ├── RULES.md                  # Zasady pracy i styl kodu
│   ├── PROGRESS.md               # Co jest zrobione, backlog
│   └── lista_rzeczy_do_poprawek.md  # Audyt techniczny
├── docker-compose.yml
├── historia.md                   # Pełna historia sesji deweloperskich
└── CLAUDE.md                     # Instrukcje dla Claude Code
```

---

## Główne endpointy API

| Metoda | Endpoint | Auth | Opis |
|--------|----------|------|------|
| POST | `/api/v1/auth/login` | — | Logowanie (JWT 30 min) |
| POST | `/api/v1/auth/refresh` | — | Odświeżenie tokenu (7 dni) |
| GET | `/api/v1/events` | — | Lista aktywnych awarii (paginacja) |
| GET | `/api/v1/events/{id}` | — | Szczegóły zdarzenia |
| POST | `/api/v1/events` | JWT | Tworzenie zdarzenia + powiadomienia |
| PUT | `/api/v1/events/{id}` | JWT | Zmiana statusu + powiadomienia o zmianie |
| DELETE | `/api/v1/events/{id}` | JWT admin | Usunięcie zdarzenia |
| GET | `/api/v1/streets?q=pilsud` | — | Autocomplete ulic TERYT |
| GET | `/api/v1/streets/{id}/buildings` | — | Obrysy budynków dla ulicy |
| POST | `/api/v1/subscribers` | — | Rejestracja subskrybenta (wieloadresowa, RODO) |
| GET | `/api/v1/subscribers/{token}` | — | Podgląd danych przed wyrejestrowaniem |
| DELETE | `/api/v1/subscribers/{token}` | — | Fizyczne usunięcie danych (RODO) |
| GET | `/api/v1/admin/stats` | JWT admin | Statystyki systemu |
| GET | `/api/v1/admin/subscribers` | JWT admin | Lista subskrybentów |
| GET | `/api/v1/admin/notifications` | JWT admin | Log wysłanych powiadomień |
| GET | `/health` | — | Health check |

Pełna dokumentacja (Swagger): http://localhost:8000/docs

---

## Statusy zdarzeń i kolory mapy

| Status | Kolor | Hex |
|--------|-------|-----|
| `zgloszona` | czerwony | `#EF4444` |
| `w_naprawie` | pomarańczowy | `#F59E0B` |
| `usunieta` | zielony | `#10B981` |
| `planowane_wylaczenie` | niebieski | `#3B82F6` |
| `remont` | fioletowy | `#8B5CF6` |

---

## Kluczowe zasady biznesowe

1. **Adresy słownikowane z TERYT** — autocomplete, brak wpisywania ręcznego
2. **Mapa: linie i poligony budynków** — NIE okręgi/promienie; zasięg = konkretne numery posesji
3. **Wiele adresów na subskrybenta** — mieszkaniec może monitorować kilka lokalizacji
4. **Fizyczne usunięcie danych** — RODO: DELETE zamiast soft-delete
5. **Zgoda na SMS nocne** — osobna zgoda, domyślnie wyłączona; cisza 22:00–06:00 (Europe/Warsaw)
6. **Multi-operator ready** — pole `source` w zdarzeniach; architektura gotowa na LPEC, zarząd dróg
7. **100% open source** — zero kosztów licencyjnych

---

## Wdrożenie produkcyjne (Oracle Linux — planowane)

```bash
# 1. Ustaw SECRET_KEY na losowy string (min. 32 znaki)
openssl rand -hex 32

# 2. Ustaw SMS_GATEWAY_TYPE=smseagle + dane SMSEagle MPWiK
# 3. Skonfiguruj SMTP dla emaili
# 4. Ustaw ENABLE_EMAIL_NOTIFICATIONS=true
# 5. Skonfiguruj nginx jako reverse proxy

docker compose -f docker-compose.prod.yml up -d
docker compose exec backend alembic upgrade head
docker compose exec backend python -m scripts.import_streets
docker compose exec backend python -m scripts.setup_dev_users
```

> Docelowy OS: Oracle Linux (zgodnie z wymaganiami MPWiK IT)
