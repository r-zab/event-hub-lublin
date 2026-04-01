# Event Hub Lublin

System powiadamiania mieszkancow Lublina o awariach sieci wodociagowej MPWiK.
Projekt realizowany na Festiwal Biznesu — Politechnika Lubelska.

## Stack

| Warstwa | Technologie |
|---------|-------------|
| Backend | Python 3.12 + FastAPI (async) |
| Baza danych | PostgreSQL 16 (Docker) |
| ORM / migracje | SQLAlchemy 2.0 + Alembic |
| Auth | JWT (python-jose) + bcrypt (passlib) |
| Powiadomienia | aiosmtplib (email) + MockSMSGateway |
| Frontend | React 18 + TypeScript + Vite |
| Mapa | Leaflet + React-Leaflet |
| Infra | Docker Compose |

## Quick Start

### Backend + baza danych

```bash
# 1. Skopiuj i uzupelnij zmienne srodowiskowe
cp .env.example .env

# 2. Uruchom PostgreSQL i backend
docker compose up -d

# 3. Wejdz do kontenera backendowego i wykonaj migracje
docker compose exec backend alembic upgrade head

# 4. (Opcjonalnie) Zaladuj dane testowe
docker compose exec backend python -m scripts.seed

# 5. Sprawdz
#   http://localhost:8000/health
#   http://localhost:8000/docs  (Swagger UI)
#   http://localhost:8000/redoc
```

### Frontend (dev)

```bash
cd frontend
npm install
npm run dev
# http://localhost:5173
```

Frontend komunikuje sie z backendem przez Vite proxy (`/api` → `localhost:8000`).

## Struktura projektu

```
event-hub-lublin/
├── backend/
│   ├── app/
│   │   ├── main.py               # FastAPI app, CORS, lifespan
│   │   ├── config.py             # ustawienia z .env (Pydantic Settings)
│   │   ├── database.py           # async engine + SessionLocal
│   │   ├── models/               # SQLAlchemy 2.0 ORM
│   │   │   ├── user.py
│   │   │   ├── street.py
│   │   │   ├── event.py
│   │   │   ├── subscriber.py
│   │   │   └── notification_log.py
│   │   ├── schemas/              # Pydantic v2 I/O schemas
│   │   ├── routers/              # endpointy API
│   │   │   ├── auth.py           # POST /api/v1/auth/login
│   │   │   ├── streets.py        # GET  /api/v1/streets?q=
│   │   │   ├── events.py         # CRUD /api/v1/events
│   │   │   └── subscribers.py    # POST/GET/DELETE /api/v1/subscribers
│   │   ├── services/
│   │   │   ├── gateways.py       # SMSGateway ABC + MockSMSGateway + EmailSender
│   │   │   └── notification_service.py  # matching + nocna cisza + notification_log
│   │   └── dependencies.py       # get_db, get_current_user
│   ├── alembic/                  # migracje bazy danych
│   ├── scripts/
│   │   ├── seed.py               # dane testowe (admin/admin123, ulice, zdarzenia)
│   │   └── import_streets.py     # import 1378 ulic z XML TERYT GUS
│   ├── data/
│   │   └── ULIC_*.xml            # plik TERYT (pobierz ze strony GUS)
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Index.tsx         # strona glowna z mapa i lista awarii
│   │   │   ├── Register.tsx      # formularz subskrypcji (wieloadresowy, RODO)
│   │   │   ├── Unsubscribe.tsx   # wyrejestrowanie przez token
│   │   │   ├── AdminLogin.tsx    # logowanie dyspozytora
│   │   │   ├── AdminDashboard.tsx # tabela zdarzen, historia, filtry
│   │   │   ├── AdminEventForm.tsx # tworzenie/edycja zdarzenia (autocomplete TERYT)
│   │   │   └── About.tsx
│   │   ├── components/
│   │   │   ├── EventMap.tsx      # mapa Leaflet z kolorowaniem statusow
│   │   │   ├── EventCard.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   └── ...
│   │   └── hooks/
│   │       ├── useAuth.tsx       # OAuth2 x-www-form-urlencoded
│   │       ├── useEvents.ts      # pobieranie + filtrowanie + paginacja
│   │       └── useStreets.ts     # autocomplete (min 3 znaki, AbortController)
│   └── vite.config.ts            # proxy /api → localhost:8000
├── docs/
│   ├── PROJECT_CONTEXT.md
│   ├── TECH_SPEC.md
│   ├── RULES.md
│   └── PROGRESS.md
├── docker-compose.yml
└── CLAUDE.md
```

## API — glowne endpointy

| Metoda | Endpoint | Auth | Opis |
|--------|----------|------|------|
| POST | `/api/v1/auth/login` | — | Logowanie dyspozytora (JWT) |
| GET | `/api/v1/events` | — | Lista aktywnych awarii (paginacja) |
| GET | `/api/v1/events/{id}` | — | Szczegoly zdarzenia |
| POST | `/api/v1/events` | JWT | Tworzenie zdarzenia |
| PUT | `/api/v1/events/{id}` | JWT | Aktualizacja / zmiana statusu |
| DELETE | `/api/v1/events/{id}` | JWT admin | Usuniecie zdarzenia |
| GET | `/api/v1/streets?q=pilsud` | — | Autocomplete ulic TERYT |
| POST | `/api/v1/subscribers` | — | Rejestracja subskrybenta |
| GET | `/api/v1/subscribers/{token}` | — | Podglad przed wyrejestrowaniem |
| DELETE | `/api/v1/subscribers/{token}` | — | Wyrejestrowanie (fizyczne, RODO) |
| GET | `/health` | — | Health check |

Pelna dokumentacja: `http://localhost:8000/docs`

## Statusy awarii i kolory mapy

| Status | Kolor |
|--------|-------|
| zgloszona | czerwony `#EF4444` |
| w_naprawie | pomaranczowy `#F59E0B` |
| usunieta | zielony `#10B981` |
| planowane_wylaczenie | niebieski `#3B82F6` |
| remont | fioletowy `#8B5CF6` |

## Dane testowe (po `seed.py`)

- Konto admina: `admin` / `admin123`
- 5 ulic Lublina (Pilsudskiego, Lipowa, Nadbystrzycka, Zana, Krasnicka)
- 3 zdarzenia z historia statusow
- 2 subskrybenci z adresami

## Import ulic TERYT

```bash
# Pobierz plik ULIC_*.xml ze strony GUS (TERYT)
# i umies go w backend/data/
docker compose exec backend python -m scripts.import_streets
# Importuje 1378 ulic Lublina (idempotentny)
```

## Zmienne srodowiskowe (.env)

```env
DATABASE_URL=postgresql+asyncpg://eventhub:devpassword@localhost:5432/eventhub
SECRET_KEY=zmien-na-tajny-klucz
POSTGRES_DB=eventhub
POSTGRES_USER=eventhub
POSTGRES_PASSWORD=devpassword

# Email (opcjonalne — bez tego dziala tryb mock)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=

# SMS (mockowane w dev)
SMS_GATEWAY_TYPE=mock
```

## Zespol

- Rafal Zaborek
- Jakub Zatorski
- Mateusz Duda

Politechnika Lubelska — Sztuczna Inteligencja w Biznesie
Festiwal Biznesu 2026
