# ==========================================
# Event Hub Lublin — Tworzenie struktury projektu
# Uruchom w PowerShell: 
# Right-click na plik → "Uruchom z PowerShell"
# LUB w terminalu PyCharm: .\create-structure.ps1
# ==========================================

$ROOT = "C:\Users\rafal\PycharmProjects\event-hub-lublin"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Event Hub Lublin — Setup struktury" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $ROOT
Write-Host "Katalog: $ROOT" -ForegroundColor Yellow
Write-Host ""

# ==========================================
# KATALOGI
# ==========================================
Write-Host "Tworzenie katalogow..." -ForegroundColor Green

$dirs = @(
    "docs",
    "backend\app\models",
    "backend\app\schemas",
    "backend\app\routers",
    "backend\app\services",
    "backend\app\utils",
    "backend\alembic\versions",
    "backend\scripts",
    "backend\tests",
    "frontend\src\pages",
    "frontend\src\components\Map",
    "frontend\src\hooks",
    "frontend\src\api",
    "frontend\src\types",
    "frontend\src\styles",
    "frontend\public",
    "nginx",
    "scripts",
    "presentation\slides",
    "research\ankieta\wyniki",
    "research"
)

foreach ($dir in $dirs) {
    $fullPath = Join-Path $ROOT $dir
    if (-not (Test-Path $fullPath)) {
        New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
        Write-Host "   + $dir" -ForegroundColor Gray
    } else {
        Write-Host "   = $dir (istnieje)" -ForegroundColor DarkGray
    }
}

# ==========================================
# PYTHON __init__.py
# ==========================================
Write-Host ""
Write-Host "Tworzenie __init__.py..." -ForegroundColor Green

$pyPackages = @(
    "backend\app",
    "backend\app\models",
    "backend\app\schemas",
    "backend\app\routers",
    "backend\app\services",
    "backend\app\utils",
    "backend\tests"
)

foreach ($pkg in $pyPackages) {
    $initFile = Join-Path $ROOT "$pkg\__init__.py"
    if (-not (Test-Path $initFile)) {
        New-Item -ItemType File -Path $initFile -Force | Out-Null
        Write-Host "   + $pkg\__init__.py" -ForegroundColor Gray
    }
}

# ==========================================
# GIT INIT
# ==========================================
Write-Host ""
Write-Host "Git..." -ForegroundColor Green

$gitDir = Join-Path $ROOT ".git"
if (-not (Test-Path $gitDir)) {
    Set-Location $ROOT
    git init
    Write-Host "   + Git zainicjalizowany" -ForegroundColor Gray
} else {
    Write-Host "   = Git juz istnieje" -ForegroundColor DarkGray
}

# ==========================================
# .gitignore
# ==========================================
Write-Host ""
Write-Host "Tworzenie plikow konfiguracyjnych..." -ForegroundColor Green

$gitignoreContent = @'
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
.venv/
venv/
env/
*.egg-info/
dist/
build/

# Node
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment
.env
.env.local
.env.production

# IDE
.vscode/settings.json
.idea/
*.swp
*.swo
*~

# Docker
docker-compose.override.yml

# OS
.DS_Store
Thumbs.db

# Build
frontend/build/
frontend/dist/
admin/build/
admin/dist/

# Database
*.sqlite3
pgdata/

# Logs
*.log
logs/

# Coverage
htmlcov/
.coverage
coverage.xml

# Misc
*.bak
*.tmp
'@

$gitignorePath = Join-Path $ROOT ".gitignore"
if (-not (Test-Path $gitignorePath)) {
    $gitignoreContent | Out-File -FilePath $gitignorePath -Encoding utf8NoBOM
    Write-Host "   + .gitignore" -ForegroundColor Gray
} else {
    Write-Host "   = .gitignore (istnieje)" -ForegroundColor DarkGray
}

# ==========================================
# .env.example
# ==========================================

$envExampleContent = @'
# ============================================
# Database
# ============================================
DATABASE_URL=postgresql+asyncpg://eventhub:devpassword@db:5432/eventhub

POSTGRES_DB=eventhub
POSTGRES_USER=eventhub
POSTGRES_PASSWORD=devpassword

# ============================================
# Security
# ============================================
SECRET_KEY=change-this-to-a-random-string-minimum-32-characters-long
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# ============================================
# SMS Gateway (MPWiK)
# ============================================
SMS_GATEWAY_TYPE=mock
SMS_GATEWAY_URL=http://mock
SMS_GATEWAY_API_KEY=mock-key

# ============================================
# Email (SMTP)
# ============================================
SMTP_HOST=localhost
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=awarie@eventhub.lublin.pl
SMTP_USE_TLS=true

# ============================================
# CORS
# ============================================
CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:5173

# ============================================
# Geocoding
# ============================================
NOMINATIM_URL=https://nominatim.openstreetmap.org
NOMINATIM_USER_AGENT=EventHubLublin/1.0 (student-project)

# ============================================
# App
# ============================================
APP_NAME=Event Hub Lublin
APP_VERSION=0.1.0
DEBUG=true
'@

$envExamplePath = Join-Path $ROOT ".env.example"
if (-not (Test-Path $envExamplePath)) {
    $envExampleContent | Out-File -FilePath $envExamplePath -Encoding utf8NoBOM
    Write-Host "   + .env.example" -ForegroundColor Gray
}

$envPath = Join-Path $ROOT ".env"
if (-not (Test-Path $envPath)) {
    $envExampleContent | Out-File -FilePath $envPath -Encoding utf8NoBOM
    Write-Host "   + .env (kopia z .env.example)" -ForegroundColor Gray
}

# ==========================================
# docker-compose.yml
# ==========================================

$dockerComposeContent = @'
version: '3.8'

services:
  db:
    image: postgres:16-alpine
    container_name: eventhub-db
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-eventhub}
      POSTGRES_USER: ${POSTGRES_USER:-eventhub}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-devpassword}
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-eventhub}"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: eventhub-backend
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    volumes:
      - ./backend/app:/code/app
    ports:
      - "8000:8000"
    env_file:
      - .env
    environment:
      - DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER:-eventhub}:${POSTGRES_PASSWORD:-devpassword}@db:5432/${POSTGRES_DB:-eventhub}
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

volumes:
  pgdata:
    driver: local
'@

$dockerComposePath = Join-Path $ROOT "docker-compose.yml"
if (-not (Test-Path $dockerComposePath)) {
    $dockerComposeContent | Out-File -FilePath $dockerComposePath -Encoding utf8NoBOM
    Write-Host "   + docker-compose.yml" -ForegroundColor Gray
}

# ==========================================
# backend/Dockerfile
# ==========================================

$dockerfileContent = @'
FROM python:3.12-slim

WORKDIR /code

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
'@

$dockerfilePath = Join-Path $ROOT "backend\Dockerfile"
if (-not (Test-Path $dockerfilePath)) {
    $dockerfileContent | Out-File -FilePath $dockerfilePath -Encoding utf8NoBOM
    Write-Host "   + backend/Dockerfile" -ForegroundColor Gray
}

# ==========================================
# backend/requirements.txt
# ==========================================

$requirementsContent = @'
# Web framework
fastapi==0.115.0
uvicorn[standard]==0.30.0
python-multipart==0.0.9

# Database
sqlalchemy[asyncio]==2.0.35
asyncpg==0.29.0
alembic==1.13.2
greenlet==3.0.3

# Validation & Settings
pydantic[email]==2.9.0
pydantic-settings==2.5.0

# Authentication
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
bcrypt==4.2.0

# HTTP client (SMS gateway, geocoding)
httpx==0.27.0

# Email
aiosmtplib==3.0.1

# Rate limiting
slowapi==0.1.9

# Logging
python-json-logger==2.0.7

# Dev tools
black==24.8.0
isort==5.13.2
pytest==8.3.0
pytest-asyncio==0.24.0
'@

$requirementsPath = Join-Path $ROOT "backend\requirements.txt"
if (-not (Test-Path $requirementsPath)) {
    $requirementsContent | Out-File -FilePath $requirementsPath -Encoding utf8NoBOM
    Write-Host "   + backend/requirements.txt" -ForegroundColor Gray
}

# ==========================================
# backend/app/config.py
# ==========================================

$configContent = @'
"""Application configuration from environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from .env file."""

    # App
    APP_NAME: str = "Event Hub Lublin"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://eventhub:devpassword@localhost:5432/eventhub"

    # Security
    SECRET_KEY: str = "change-this-to-a-random-string-minimum-32-characters-long"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # SMS
    SMS_GATEWAY_TYPE: str = "mock"
    SMS_GATEWAY_URL: str = "http://mock"
    SMS_GATEWAY_API_KEY: str = "mock-key"

    # Email
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "awarie@eventhub.lublin.pl"
    SMTP_USE_TLS: bool = True

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    # Geocoding
    NOMINATIM_URL: str = "https://nominatim.openstreetmap.org"
    NOMINATIM_USER_AGENT: str = "EventHubLublin/1.0"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
'@

$configPath = Join-Path $ROOT "backend\app\config.py"
if (-not (Test-Path $configPath)) {
    $configContent | Out-File -FilePath $configPath -Encoding utf8NoBOM
    Write-Host "   + backend/app/config.py" -ForegroundColor Gray
}

# ==========================================
# backend/app/database.py
# ==========================================

$databaseContent = @'
"""Database engine, session, and base model setup."""

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


async def get_db():
    """Dependency: yield database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
'@

$databasePath = Join-Path $ROOT "backend\app\database.py"
if (-not (Test-Path $databasePath)) {
    $databaseContent | Out-File -FilePath $databasePath -Encoding utf8NoBOM
    Write-Host "   + backend/app/database.py" -ForegroundColor Gray
}

# ==========================================
# backend/app/main.py
# ==========================================

$mainContent = @'
"""
Event Hub Lublin - FastAPI Application
System powiadamiania mieszkancow o awariach sieci wodociagowej.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup and shutdown events.
    print(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    yield
    print("Shutting down...")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Event Hub Lublin - System powiadamiania mieszkancow MPWiK Lublin.",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["System"])
async def health_check():
    """Sprawdzenie stanu systemu."""
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }


# TODO: Import and include routers
# from app.routers import events, subscribers, streets, auth, admin, external
# app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
# app.include_router(events.router, prefix="/api/v1/events", tags=["Events"])
# app.include_router(subscribers.router, prefix="/api/v1/subscribers", tags=["Subscribers"])
# app.include_router(streets.router, prefix="/api/v1/streets", tags=["Streets"])
# app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])
# app.include_router(external.router, prefix="/api/v1/external", tags=["External API"])
'@

$mainPath = Join-Path $ROOT "backend\app\main.py"
if (-not (Test-Path $mainPath)) {
    $mainContent | Out-File -FilePath $mainPath -Encoding utf8NoBOM
    Write-Host "   + backend/app/main.py" -ForegroundColor Gray
}

# ==========================================
# CLAUDE.md
# ==========================================

$claudeMdContent = @'
# CLAUDE.md - Event Hub Lublin

## Projekt
System powiadamiania mieszkancow o awariach sieci wodociagowej dla MPWiK Lublin.
Prototyp na Festiwal Biznesu (Politechnika Lubelska).
Architektura zaprojektowana jako miejski hub powiadamiania (multi-operator).

## Kontekst biznesowy
Przeczytaj plik `docs/PROJECT_CONTEXT.md` - pelny kontekst ze spotkania z MPWiK.
Przeczytaj plik `docs/TECH_SPEC.md` - szczegolowa specyfikacja techniczna.

## Stack technologiczny

### Backend (`backend/`)
- **Python 3.12.10** + **FastAPI** (async)
- **SQLAlchemy 2.0** (ORM) + **Alembic** (migracje)
- **PostgreSQL 16** (baza danych)
- **Pydantic v2** (walidacja, schematy)
- **python-jose** + **passlib[bcrypt]** (JWT auth)
- **aiosmtplib** (async email)
- **httpx** (async HTTP client)
- **slowapi** (rate limiting)
- **uvicorn** (ASGI server)

### Frontend (`frontend/`)
- **React 18** + **TypeScript**
- **Tailwind CSS**
- **React-Leaflet** + **Leaflet** (mapa)
- **React Router v6**
- **Axios**

### Infrastruktura
- **Docker** + **Docker Compose**
- **Nginx** (reverse proxy)
- **Oracle Linux** (docelowy OS)

## Konwencje kodowania

### Python
- Formatowanie: Black (line-length=99)
- Type hints: Wymagane wszedzie
- Async: Uzywaj async/await dla I/O
- Parametryzowane zapytania SQL (SQLAlchemy ORM) - NIGDY string concatenation
- Fizyczne usuwanie danych (RODO) - NIE soft delete

### API Design
- Prefix: `/api/v1/`
- Auth admin: Bearer JWT
- Auth external: X-API-Key header
- Pagination: `?skip=0&limit=20`

### Git
- Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`
- Nie commituj: `.env`, `__pycache__`, `node_modules`, `.venv`

## Wazne zasady biznesowe
1. BRAK okregow/promieni na mapie - dyspozytor podaje ulice + numery od-do
2. Mapa GIS MPWiK niedostepna - autorski system, brak API
3. Adresy slownikowane z TERYT
4. Fizyczne usuniecie danych przy wyrejestrowaniu (RODO)
5. Zgoda na SMS nocne - osobna od RODO, domyslnie wylaczona
6. Wiele adresow na subskrybenta
7. System to OSOBNA strona - nie integracja z mpwik.lublin.pl
8. Zero kosztow licencyjnych - 100% open source
9. Pole `source` w events - przygotowanie pod multi-operator hub
10. WCAG 2.1 AA
11. Bramka SMS MPWiK - na etapie dev mockujemy
'@

$claudeMdPath = Join-Path $ROOT "CLAUDE.md"
if (-not (Test-Path $claudeMdPath)) {
    $claudeMdContent | Out-File -FilePath $claudeMdPath -Encoding utf8NoBOM
    Write-Host "   + CLAUDE.md" -ForegroundColor Gray
}

# ==========================================
# docs/PROJECT_CONTEXT.md
# ==========================================

$projectContextContent = @'
# Kontekst projektu - Event Hub Lublin

## 1. Czym jest ten projekt

System powiadamiania mieszkancow Lublina o awariach i przerwach w dostawie wody,
tworzony we wspolpracy z MPWiK Lublin.

Projekt realizowany na Festiwal Biznesu - Politechnika Lubelska.
Zespol: Rafal Zaborek, Jakub Zatorski, Mateusz Duda
Kierunek: Sztuczna Inteligencja w Biznesie

## 2. Problem biznesowy

### AS-IS:
1. Mieszkaniec odkraca kran - brak wody
2. Dzwoni na numer alarmowy 994
3. Dyspozytor zbiera dane, brygada weryfikuje awarie
4. Informacja pojawia sie na stronie mpwik.lublin.pl

Dane: ~271 awarii rocznie w Lublinie

### TO-BE:
1. Dyspozytor potwierdza awarie, wpisuje do panelu (ulica + numery)
2. System AUTOMATYCZNIE wysyla SMS i email do zarejestrowanych mieszkancow
3. Mapa aktualizuje sie w czasie rzeczywistym

## 3. Kluczowe osoby po stronie MPWiK
- **Piotr Jeczen** - Szef dzialu IT, glowny kontakt techniczny
- **Dorota** - Dyrektor ds. operacyjnych/komunikacji
- **Marcin** - Dyrektor techniczny / dyzurny

## 4. Kluczowe ustalenia

### Potwierdzone:
- SMS + email jako kanaly powiadomien
- Panel administracyjny dla dyspozytora = core systemu
- Mapa z odcinkami ulic (linie, NIE okregi)
- MPWiK ma wlasna bramke SMS - zero kosztow
- MPWiK planuje realne wykorzystanie

### Odrzucone:
- Promien/okrag na mapie -> ulica + numery posesji od-do
- Pobieranie danych z GIS MPWiK -> autorski system, bez API
- AI/ML predykcja -> "trzeba przyhamowac", AI Act
- Dane osobowe klientow z umow -> absolutne tabu

### Nowe wymagania:
1. Adresy slownikowane z TERYT (autocomplete)
2. Wiele adresow na jednego subskrybenta
3. Opcja SMS nocnych (osobna zgoda, domyslnie OFF)
4. Fizyczne usuniecie danych przy wyrejestrowaniu (RODO)
5. WCAG dostepnosc
6. Oracle Linux jako docelowy OS
7. REST API z dokumentacja - przygotowanie pod miejski hub

## 5. Wizja: Miejski Hub Powiadamiania

MPWiK = pierwszy "dostawca zdarzen" (source: "mpwik").
Architektura gotowa na LPEC, zarzad drog, centrum zarzadzania kryzysowego.
Mieszkaniec rejestruje sie RAZ.

## 6. Ograniczenia techniczne
- Brak dostepu do GIS MPWiK
- Bramka SMS - dokumentacja API jeszcze niedostarczona (mockujemy)
- Strona mpwik.lublin.pl zarzadzana przez zewnetrznego hostingowca
'@

$projectContextPath = Join-Path $ROOT "docs\PROJECT_CONTEXT.md"
if (-not (Test-Path $projectContextPath)) {
    $projectContextContent | Out-File -FilePath $projectContextPath -Encoding utf8NoBOM
    Write-Host "   + docs/PROJECT_CONTEXT.md" -ForegroundColor Gray
}

# ==========================================
# docs/TECH_SPEC.md
# ==========================================

$techSpecContent = @'
# Specyfikacja techniczna - Event Hub Lublin

## 1. Endpointy API

### Auth
POST /api/v1/auth/login    -> { "access_token", "token_type" }
POST /api/v1/auth/refresh  -> { "access_token" }

### Events
GET    /api/v1/events         -> lista aktywnych (public, paginacja)
GET    /api/v1/events/{id}    -> szczegoly (public)
POST   /api/v1/events         -> tworzenie (JWT lub API key)
PUT    /api/v1/events/{id}    -> aktualizacja (JWT)
DELETE /api/v1/events/{id}    -> usuniecie (JWT admin)
GET    /api/v1/events/feed    -> plain text dla IVR 994 (public)

### Streets
GET /api/v1/streets?q=pilsud&limit=10  -> autocomplete ulic (public)

### Subscribers
POST   /api/v1/subscribers/{unsubscribe_token}  -> rejestracja (public)
DELETE /api/v1/subscribers/{unsubscribe_token}  -> wyrejestrowanie (public)
GET    /api/v1/subscribers/{unsubscribe_token}  -> info przed usunieciem (public)

### Admin
GET /api/v1/admin/subscribers   -> lista subskrybentow (JWT admin)
GET /api/v1/admin/notifications -> log powiadomien (JWT admin)
GET /api/v1/admin/stats         -> statystyki (JWT)

## 2. Schemat bazy danych

### users
- id SERIAL PK
- username VARCHAR(50) UNIQUE NOT NULL
- password_hash VARCHAR(255) NOT NULL
- full_name VARCHAR(100)
- role VARCHAR(20) DEFAULT 'dispatcher'  -- dispatcher / admin
- is_active BOOLEAN DEFAULT TRUE
- created_at TIMESTAMP DEFAULT NOW()

### streets
- id SERIAL PK
- teryt_sym_ul VARCHAR(10) UNIQUE
- name VARCHAR(200) NOT NULL             -- "Pilsudskiego"
- full_name VARCHAR(250) NOT NULL        -- "Aleja Marszalka Jozefa Pilsudskiego"
- street_type VARCHAR(20)                -- "al.", "ul.", "pl."
- city VARCHAR(50) DEFAULT 'Lublin'
- geojson JSONB

### events
- id SERIAL PK
- event_type VARCHAR(30) NOT NULL        -- 'awaria'/'planowane_wylaczenie'/'remont'
- source VARCHAR(50) DEFAULT 'mpwik'
- street_id INTEGER FK -> streets(id)
- street_name VARCHAR(200) NOT NULL
- house_number_from VARCHAR(10)
- house_number_to VARCHAR(10)
- description TEXT
- status VARCHAR(30) DEFAULT 'zgloszona' -- 'zgloszona'/'w_naprawie'/'usunieta'
- estimated_end TIMESTAMP
- geojson_segment JSONB
- created_by INTEGER FK -> users(id)
- created_at TIMESTAMP DEFAULT NOW()
- updated_at TIMESTAMP DEFAULT NOW()

### event_history
- id SERIAL PK
- event_id INTEGER FK -> events(id) ON DELETE CASCADE
- old_status VARCHAR(30)
- new_status VARCHAR(30)
- changed_by INTEGER FK -> users(id)
- changed_at TIMESTAMP DEFAULT NOW()
- note TEXT

### subscribers
- id SERIAL PK
- phone VARCHAR(20) NOT NULL
- email VARCHAR(100) NOT NULL
- rodo_consent BOOLEAN NOT NULL DEFAULT FALSE
- night_sms_consent BOOLEAN DEFAULT FALSE
- unsubscribe_token VARCHAR(64) UNIQUE NOT NULL
- created_at TIMESTAMP DEFAULT NOW()

### subscriber_addresses
- id SERIAL PK
- subscriber_id INTEGER FK -> subscribers(id) ON DELETE CASCADE
- street_id INTEGER FK -> streets(id)
- street_name VARCHAR(200) NOT NULL
- house_number VARCHAR(10) NOT NULL
- flat_number VARCHAR(10)
- created_at TIMESTAMP DEFAULT NOW()

### notification_log
- id SERIAL PK
- event_id INTEGER FK -> events(id)
- subscriber_id INTEGER FK -> subscribers(id) ON DELETE SET NULL
- channel VARCHAR(10) NOT NULL           -- 'sms' / 'email'
- recipient VARCHAR(100) NOT NULL
- message_text TEXT
- status VARCHAR(20) DEFAULT 'sent'      -- 'sent'/'failed'/'queued'
- sent_at TIMESTAMP DEFAULT NOW()
- error_message TEXT

### api_keys
- id SERIAL PK
- operator_name VARCHAR(50) UNIQUE NOT NULL
- api_key_hash VARCHAR(255) NOT NULL
- is_active BOOLEAN DEFAULT TRUE
- created_at TIMESTAMP DEFAULT NOW()

## 3. Indeksy
- idx_events_status ON events(status)
- idx_events_source ON events(source)
- idx_events_street ON events(street_id)
- idx_events_created ON events(created_at DESC)
- idx_subscriber_addresses_street ON subscriber_addresses(street_id)
- idx_streets_name ON streets(name)
- idx_streets_fullname_trgm ON streets USING gin(full_name gin_trgm_ops)
  (wymaga: CREATE EXTENSION pg_trgm)

## 4. Algorytm matchowania

INPUT: event (street_id, house_number_from, house_number_to)

SELECT subscribers WHERE:
  subscriber_addresses.street_id = event.street_id
  subscriber_addresses.house_number BETWEEN from AND to
  subscriber.rodo_consent = TRUE

Dla kazdego subscriber:
  a. Wyslij EMAIL (zawsze)
  b. Jesli 22:00-06:00 AND night_sms_consent = FALSE -> kolejkuj na 06:00
  c. W innym przypadku -> wyslij SMS natychmiast
  d. Zapisz do notification_log

## 5. SMS Gateway - interfejs

```python
class SMSGateway(ABC):
    @abstractmethod
    async def send(self, phone: str, message: str) -> bool:
        pass

class MockSMSGateway(SMSGateway):
    async def send(self, phone: str, message: str) -> bool:
        logger.info(f"[MOCK SMS] -> {phone}: {message}")
        return True
```

## 6. Kolory statusow na mapie
- zgloszona:           #EF4444 (czerwony)
- w_naprawie:          #F59E0B (pomaranczowy)
- usunieta:            #10B981 (zielony)
- planowane_wylaczenie:#3B82F6 (niebieski)
- remont:              #8B5CF6 (fioletowy)
'@

$techSpecPath = Join-Path $ROOT "docs\TECH_SPEC.md"
if (-not (Test-Path $techSpecPath)) {
    $techSpecContent | Out-File -FilePath $techSpecPath -Encoding utf8NoBOM
    Write-Host "   + docs/TECH_SPEC.md" -ForegroundColor Gray
}

# ==========================================
# README.md
# ==========================================

$readmeContent = @'
# Event Hub Lublin

System powiadamiania mieszkancow o awariach sieci wodociagowej MPWiK Lublin.

## Quick Start

```bash
# 1. Skopiuj zmienne srodowiskowe
cp .env.example .env

# 2. Uruchom baze danych
docker compose up db -d

# 3. Uruchom backend
docker compose up backend

# 4. Sprawdz
# http://localhost:8000/health
# http://localhost:8000/docs (Swagger UI)
```

## Stack
- **Backend:** Python 3.12 + FastAPI
- **Database:** PostgreSQL 16
- **Frontend:** React + TypeScript + Leaflet
- **Infra:** Docker + Nginx

## Zespol
- Rafal Zaborek
- Jakub Zatorski
- Mateusz Duda

Politechnika Lubelska - Sztuczna Inteligencja w Biznesie
'@

$readmePath = Join-Path $ROOT "README.md"
if (-not (Test-Path $readmePath)) {
    $readmeContent | Out-File -FilePath $readmePath -Encoding utf8NoBOM
    Write-Host "   + README.md" -ForegroundColor Gray
}

# ==========================================
# PODSUMOWANIE
# ==========================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  GOTOWE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Struktura projektu:" -ForegroundColor Yellow
Write-Host @"
event-hub-lublin/
├── CLAUDE.md
├── README.md
├── .gitignore
├── .env.example
├── .env
├── docker-compose.yml
├── docs/
│   ├── PROJECT_CONTEXT.md
│   └── TECH_SPEC.md
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── __init__.py
│       ├── main.py
│       ├── config.py
│       ├── database.py
│       ├── models/
│       ├── schemas/
│       ├── routers/
│       ├── services/
│       └── utils/
├── frontend/
│   └── src/
├── nginx/
├── scripts/
├── presentation/
└── research/
"@ -ForegroundColor Gray

Write-Host ""
Write-Host "NASTEPNE KROKI:" -ForegroundColor Yellow
Write-Host "  1. docker compose up db -d" -ForegroundColor White
Write-Host "  2. docker compose up backend" -ForegroundColor White
Write-Host "  3. Otworz: http://localhost:8000/docs" -ForegroundColor White
Write-Host "  4. Zainstaluj Claude Code: npm install -g @anthropic-ai/claude-code" -ForegroundColor White
Write-Host "  5. Uruchom: claude" -ForegroundColor White
Write-Host ""
Write-Host '  git add . && git commit -m "init: project structure"' -ForegroundColor Cyan
Write-Host ""
