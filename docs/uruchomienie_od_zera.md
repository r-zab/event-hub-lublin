# Uruchomienie projektu od zera (Windows / hybryda Docker + lokalnie)

Dokument opisuje **jak naprawdę** uruchamia się projekt u Rafała i Kuby — czyli baza danych w Dockerze, backend i frontend lokalnie. Główny `README.md` opisuje wariant „wszystko w Dockerze", którego my **nie używamy** w pracy codziennej i który po klonie nie wstaje bez ręcznych poprawek.

> Stan na 2026-04-29. Przed migracją na Oracle Linux. Po migracji rozdział 9 (Wdrożenie) trzeba przepisać.

---

## 1. Architektura runtime — co gdzie chodzi

```
+-----------------------------+        +-----------------------------+
| HOST (Windows / Linux)      |        | DOCKER                      |
|                             |        |                             |
|  python run.py  (port 8000) |  TCP   |  postgis/postgis:16-3.4     |
|  npm run dev    (port 8080) | <----> |  kontener: eventhub-db      |
|                             |  5433  |  port hosta 5433 -> 5432    |
|  alembic upgrade head       |        |  wolumen: pgdata            |
+-----------------------------+        +-----------------------------+
```

**Co siedzi gdzie:**
- **W Dockerze:** TYLKO PostGIS (kontener `eventhub-db`). Wystawiony na `localhost:5433`.
- **Na hoście:** backend FastAPI (`python run.py` → `uvicorn` na `127.0.0.1:8000`) i frontend Vite (`npm run dev` → `http://localhost:8080`).
- **Migracje (`alembic upgrade head`):** uruchamiane lokalnie z `backend/`, łączą się do `localhost:5433`.

**Czego NIE robimy w codziennej pracy:**
- nie odpalamy serwisu `backend` z `docker-compose.yml` (ten serwis jest tam dla wariantu „wszystko w Dockerze" i dla migracji na Linuxa, na razie go ignorujemy),
- nie używamy `docker compose up -d` bez argumentu — to podniosłoby też backend w kontenerze, który będzie konfliktować z lokalnym Pythonem na porcie 8000.

---

## 2. Codzienny workflow — 3 kroki (na maszynie już skonfigurowanej)

Po jednorazowym setupie z rozdziału 4 te trzy komendy wystarczają każdego dnia:

```bash
# 1) Baza w Dockerze (raz dziennie albo po reboot)
docker compose up -d db

# 2) Backend lokalnie (w jednym terminalu, w katalogu backend/)
cd backend
python run.py

# 3) Frontend lokalnie (w drugim terminalu, w katalogu frontend/)
cd frontend
npm run dev
```

Migracje uruchamiamy **tylko gdy ktoś dodał nową** w `backend/alembic/versions/`:

```bash
cd backend
alembic upgrade head
```

**Sprawdzenie czy żyje:**
- Backend: `curl http://127.0.0.1:8000/health` → `{"status":"ok",...}`
- Swagger: `http://127.0.0.1:8000/docs`
- Frontend: `http://localhost:8080`
- Panel admin: `http://localhost:8080/sys-panel/login`

---

## 3. Wymagania na nowym kompie

| Narzędzie | Wersja | Uwagi |
|-----------|--------|-------|
| Docker Desktop | dowolna z Compose v2 | Dla bazy PostGIS |
| Python | **3.12+** | Dokładnie 3.12, geopandas/shapely się przydaje skompilowane wheels mieć dostępne |
| Node.js | **20+** (LTS) | Dla Vite 5 |
| Git | dowolna | — |

**Ważne — użyj tych narzędzi w PATH:**
- `python --version` → 3.12.x
- `node --version` → v20.x (lub nowszy)
- `docker --version` + `docker compose version`

Jeśli Python z PATH wskazuje 3.11 albo 3.10, projekt teoretycznie wystartuje, ale `geopandas` przy imporcie budynków potrafi sypać błędami przy buildowaniu z źródeł.

---

## 4. Setup od zera na nowym kompie — krok po kroku

### 4.1. Klon repo

```bash
git clone <url-repo>
cd event-hub-lublin
```

### 4.2. Utwórz `backend/.env` (KRYTYCZNE — to jest pierwszy zonk)

Plik `backend/.env` jest w `.gitignore` i **nie znajdzie się w klonie**. Bez niego `app/config.py` rzuci błędem o brakującym `SECRET_KEY`. Skopiuj poniższy blok do `backend/.env`:

```env
# Backend ENV — wariant lokalny (DB w Dockerze na porcie 5433)
DATABASE_URL=postgresql+asyncpg://eventhub:devpassword@localhost:5433/eventhub

POSTGRES_DB=eventhub
POSTGRES_USER=eventhub
POSTGRES_PASSWORD=devpassword

SECRET_KEY=zmien-na-tajny-klucz-minimum-32-znaki-jakies-losowe-bajty
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

ENABLE_EMAIL_NOTIFICATIONS=false
SMS_GATEWAY_TYPE=mock
SMSEAGLE_URL=http://placeholder/api/v2
SMSEAGLE_API_TOKEN=placeholder

SMTP_HOST=localhost
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=awarie@eventhub.lublin.pl
SMTP_USE_TLS=true

TRUSTED_PROXIES=127.0.0.1
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:8080

NOMINATIM_URL=https://nominatim.openstreetmap.org
NOMINATIM_USER_AGENT=EventHubLublin/1.0 (student-project)

APP_NAME=Event Hub Lublin
APP_VERSION=0.1.0
DEBUG=true
```

Dwa krytyczne pola: `DATABASE_URL` musi mieć **`localhost:5433`** (nie `db:5432` i nie `localhost:5432`), `SECRET_KEY` musi mieć cokolwiek niepuste.

`frontend/.env` jest w git (śledzony) i działa od razu — nie ruszaj.

### 4.3. Wirtualne środowisko Pythona

```bash
# z katalogu głównego event-hub-lublin/
python -m venv .venv

# Windows (Git Bash)
source .venv/Scripts/activate
# albo PowerShell
# .venv\Scripts\Activate.ps1

cd backend
pip install -r requirements.txt
```

`requirements.txt` ciągnie m.in. `geopandas`, `shapely`, `rtree`, `geoalchemy2` — to są zależności GIS potrzebne **tylko** dla skryptu importu budynków. Jeżeli `pip install` sypie się na rtree na Windowsie, najpierw upewnij się że masz Pythona 3.12 (nie 3.13), wtedy są prebuilt wheels.

### 4.4. Podnieś bazę danych

```bash
# z katalogu głównego
docker compose up -d db
```

Pierwsze uruchomienie pobiera obraz `postgis/postgis:16-3.4-alpine` (~150 MB) i zakłada wolumen `pgdata`. Sprawdź:

```bash
docker compose ps
# eventhub-db  ... healthy
```

### 4.5. Migracje — utwórz schemat

```bash
cd backend
alembic upgrade head
```

To podbija schemat do najnowszej rewizji (na 2026-04-29: `20260426b_expand_department_columns`). Wszystkie 21 migracji jedzie po kolei, łącznie z dodaniem PostGIS-owej kolumny `geom` na `buildings` i indeksu GIST.

### 4.6. Zasilenie bazy danych

```bash
# Konta deweloperskie (admin/dispatcher)
python -m scripts.setup_dev_users

# 1378 ulic Lublina z TERYT (geometria z BDOT10k)
python -m scripts.import_streets

# Obrysy budynków (~46 tys.) — ZAJMUJE KILKA MINUT
python -m scripts.import_buildings
```

Skrypty są idempotentne (upsert po unikalnych kluczach), bezpiecznie powtarzalne.

**Konta po `setup_dev_users.py` (zgodne z kodem, NIE z README):**

| Login | Hasło | Rola |
|-------|-------|------|
| `admin` | `admin123` | admin |
| `dyspozytor1` | `lublin123` | dispatcher |
| `dyspozytor2` | `lublin123` | dispatcher |

(README głównego repo podaje `Admin123secure` / `Lublin123secure` — to nieprawda, kod tworzy hasła jak w tabeli wyżej. Trzeba kiedyś naprawić README.)

### 4.7. Frontend — instalacja paczek

```bash
cd ../frontend
npm install
```

### 4.8. Pierwsze uruchomienie — sprawdzenie

```bash
# Terminal 1
cd backend
python run.py
# Powinno pokazać: Uvicorn running on http://127.0.0.1:8000

# Terminal 2
cd frontend
npm run dev
# Powinno pokazać: Local:   http://localhost:8080/

# Terminal 3 (kontrola)
curl http://127.0.0.1:8000/health
```

Wejdź na `http://localhost:8080/sys-panel/login`, zaloguj się jako `admin / admin123`. Mapa Lublina powinna się załadować z budynkami i ulicami.

---

## 5. Mapa repozytorium — co gdzie leży i po co

### 5.1. Pliki w korzeniu

| Plik / katalog | Po co istnieje | Czy ruszać |
|----------------|----------------|------------|
| `README.md` | Opis projektu + wariant „wszystko w Dockerze" | Niespójny z naszym workflow — patrz przypis na końcu |
| `CLAUDE.md` | Instrukcje dla Claude Code (agent) | Tak, jak coś się zmienia w architekturze |
| `docker-compose.yml` | Definiuje serwisy `db` (UŻYWAMY) i `backend` (NIE UŻYWAMY) | Edytuj świadomie |
| `docker-compose.prod.yml` | Wariant produkcyjny (Linux) | Na razie nie ruszaj |
| `.env` (root) | Plik dla wariantu „wszystko w Dockerze" — używa `db:5432` | **NIE** używamy w lokalnym dev. Ma BŁĄD: `localhost:5432` zamiast `5433`. Mylący, do posprzątania |
| `.env.example` (root) | Template do `.env` | Bez znaczenia w naszym workflow |
| `package-lock.json` (root) | Zostawiony przypadkowo | Można usunąć — frontendowy lock jest w `frontend/` |
| `nginx/` | Pusty katalog na konfig produkcyjny | Zignoruj |
| `scripts/` | **PUSTY** katalog | Wprowadza w błąd. Można usunąć — wszystkie skrypty są w `backend/scripts/` |
| `research/`, `presentation/` | Materiały do prezentacji i ankiety | Nie dotyczy uruchomienia |
| `.venv/` | Lokalne środowisko Pythona | W `.gitignore` |

### 5.2. `backend/`

| Plik / katalog | Po co |
|----------------|-------|
| `app/main.py` | FastAPI app, rejestracja routerów, CORS, scheduler (APScheduler 06:00), lifespan |
| `app/config.py` | Pydantic Settings — wczytuje `backend/.env` (klucz: `env_file = ".env"` z working dir = `backend/`) |
| `app/database.py` | Async engine SQLAlchemy + `AsyncSessionLocal` |
| `app/dependencies.py` | DI: `get_db`, `get_current_user`, `get_current_admin`, `get_current_dispatcher_or_admin` |
| `app/limiter.py` | SlowAPI limiter — rate limiting per IP |
| `app/middleware.py` | `TrustedProxyMiddleware` — przepisuje `request.client.host` z `X-Forwarded-For` |
| `app/ws_manager.py` | Manager WebSocket — broadcast zmian na liście zdarzeń |
| `app/models/` | SQLAlchemy 2.0 ORM (Event, EventHistory, Subscriber, Street, Building, NotificationLog, User, Department, MessageTemplate, audit logi) |
| `app/schemas/` | Pydantic v2 — schematy żądań / odpowiedzi |
| `app/routers/` | Endpointy: `auth`, `events`, `buildings`, `streets`, `subscribers`, `event_types`, `departments`, `message_templates`, `admin` |
| `app/services/` | `gateways.py` (SMSGateway ABC, MockSMSGateway, SMSEagleGateway, EmailSender) i `notification_service.py` (matching + nocna cisza + morning queue) |
| `app/utils/` | `security.py` (bcrypt, JWT) i pomocnicze |
| `alembic/` | Migracje. Plik `env.py` wstrzykuje `DATABASE_URL` z `app.config.settings` (zamienia `+asyncpg` na driver sync). |
| `alembic/versions/` | 21 migracji ułożonych chronologicznie po dacie |
| `alembic.ini` | Konfig CLI Alembica. **`sqlalchemy.url` celowo puste** — URL jest wstawiany przez `env.py` |
| `data/` | Zestawy GIS w git (TERYT, BDOT10k, OSM) — paliwo dla skryptów importu |
| `scripts/` | Patrz tabela w sekcji 6 |
| `tests/` | pytest — RBAC, walidacja, event_close, 2FA |
| `Dockerfile` | Image dla wariantu „backend w Dockerze" — my go nie używamy lokalnie |
| `requirements.txt` | Zależności Pythona (FastAPI, SQLAlchemy, geopandas, slowapi, apscheduler, pytest, ...) |
| `pytest.ini` | Konfig testów |
| `run.py` | Wrapper na uvicorn — czyta `TRUSTED_PROXIES` z `.env` i przekazuje do uvicorna jako `forwarded_allow_ips` |
| `.env` | **W `.gitignore`** — musisz utworzyć ręcznie (patrz 4.2) |

### 5.3. `frontend/`

| Plik / katalog | Po co |
|----------------|-------|
| `src/pages/` | Top-level routes (Index, Register, Unsubscribe, Admin*) |
| `src/components/` | EventMap, AdminMapView, EventCard, StatusBadge, AdminLayout, ProtectedAdminLayout, ... |
| `src/hooks/` | TanStack Query: `useEvents`, `useStreets`, `useBuildings`, `useDepartments`, `useEventTypes`, `useAuth` |
| `src/lib/api.ts` | `apiFetch<T>()` — Bearer token z localStorage, obsługa 401 → odśwież lub wyloguj |
| `src/lib/mapConfig.ts` | Konfig Leaflet (kafle, centrum, zoom) |
| `src/lib/utils.ts` | `parseUTC`, `formatDateTime`, `formatEventNumbers`, `streetLabel` |
| `vite.config.ts` | Proxy `/api` → `http://127.0.0.1:8000` + alias `@` → `./src` |
| `package.json` | Skrypty: `dev`, `build`, `lint`, `test`, `test:watch` |
| `.env` | `VITE_API_URL=/api/v1` + Turnstile site key (klucz testowy Cloudflare). W git |
| `playwright.config.ts`, `vitest.config.ts` | Konfigi testów E2E i jednostkowych |
| `dist/` | Build produkcyjny — gitignored |

### 5.4. `docs/`

| Plik | Zawartość | Aktualność |
|------|-----------|------------|
| `roadmap_finalna_maj.md` | Plan sprintu na 14 maja | Aktywny |
| `stan_projektu.md` | **Jedyne miejsce** gdzie wpisujemy ukończone zadania — patrz CLAUDE.md | Aktywny |
| `historia.md` | Stara historia — nie aktualizujemy (zakaz w CLAUDE.md) | Zamrożony |
| `PROJECT_CONTEXT.md` | Kontekst biznesowy MPWiK | Stabilne |
| `TECH_SPEC.md` | API, schemat DB, algorytmy | Stabilne |
| `RULES.md` | Zasady kodu i pracy | Stabilne |
| `openapi.yaml` | Eksport OpenAPI | Generowany — odśwież po dużych zmianach API |
| `streets_lublin.geojson` | Surowy GIS — kopia robocza | — |
| `notatka.txt`, `prompt.txt`, `notka.txt`, `log błędu backend.txt` | Notatki ad hoc | — |
| `spotkanie2/`, `*.pdf`, `img*.png` | Materiały spotkań i screeny | — |
| **`uruchomienie_od_zera.md`** | **TEN PLIK** | Aktywny |

---

## 6. `backend/scripts/` — co do czego

Foldera nie tknęliśmy od dawna i nie wszystko jest częścią pipeline'u. Tabela porządkuje:

| Skrypt | Kategoria | Kiedy odpalać | Czy potrzebny do uruchomienia projektu |
|--------|-----------|---------------|----------------------------------------|
| `setup_dev_users.py` | **Pipeline (wymagany)** | Raz po `alembic upgrade head` | TAK |
| `import_streets.py` | **Pipeline (wymagany)** | Raz po setupie schematu | TAK (bez tego autocomplete ulic nie działa) |
| `import_buildings.py` | **Pipeline (zalecany)** | Raz po `import_streets` | TAK (mapa będzie pusta bez budynków) |
| `import_osm_supplement.py` | Pipeline opcjonalny | Po `import_buildings`, gdy chcesz dorzucić nowsze adresy z OSM | NIE — dorzuca ~kilkaset adresów ponad PZGIK. Wymaga pakietu `osmium` (pyosmium 4.x) i pliku PBF województwa lubelskiego |
| `geocode_streets.py` | Pipeline opcjonalny | Gdy ulice z `geojson IS NULL` (typowo: nie zdarza się po `import_streets` z GeoJSON) | NIE w naszym standardzie. Trwa 30–90 min (rate limit Nominatim) |
| `seed_traffic_only.py` | Dev seed | Generuje 30 fake subskrybentów + 10 zdarzeń. Wymaga `pip install faker` | NIE — tylko jak chcesz mieć ruch testowy |
| `fix_seeded_events.py` | Jednorazówka historyczna | Naprawa po starym buggy seedzie z kwietnia | NIE — nieaktualne, można usunąć |
| `pobierz_budynki_lublin.py` | Research / dev offline | Pobiera poligony z Overpass i zapisuje GeoJSON do `data/` | NIE w pipeline. Używane tylko do regeneracji `data/lublin_budynki.geojson` |
| `spatial_join_budynki.py` | Research / dev offline | Spatial join na plikach GeoJSON poza bazą | NIE w pipeline |

**Minimalna ścieżka zasilania bazy:**
```
setup_dev_users.py  →  import_streets.py  →  import_buildings.py
```

To wszystko. `import_osm_supplement.py` jest „nice-to-have", reszta to research albo śmieci historyczne.

---

## 7. Dane wejściowe w `backend/data/`

Wszystko jest w git (śledzone), więc kolega po klonie ma komplet:

| Plik | Źródło | Używany przez |
|------|--------|---------------|
| `streets_lublin__final.geojson` | TERYT + BDOT10k | `import_streets.py` (domyślny input) |
| `ULIC_29-03-2026.xml` / `.csv` | GUS TERYT (legacy) | `import_streets.py --file ... .xml` (tryb XML) |
| `budynki_surowe.geojson` | BDOT10k | `import_buildings.py` |
| `adresy_surowe.geojson` | GUGiK PRG | `import_buildings.py` |
| `lublin_budynki_final.geojson` | OSM Overpass (efekt `pobierz_budynki_lublin.py` + `spatial_join_budynki.py`) | Wariant alternatywny — nie używany w pipeline |
| `place_surowe.geojson` | GUGiK | Skrypty research |
| `users.json` | Dump kont | Nie używany przez kod, archiwalny |
| `*.qmd` | Pliki QGIS Project Metadata | Otwierane w QGIS, nie używane przez backend |

---

## 8. Najczęstsze problemy i jak je rozpoznać

### 8.1. `pydantic_settings.ValidationError: SECRET_KEY field required`
Brak `backend/.env` lub w pliku nie ma `SECRET_KEY`. Patrz 4.2.

### 8.2. `asyncpg.exceptions.InvalidPasswordError` lub `connection refused`
- DB nie wstała: `docker compose ps` → kontener `eventhub-db` powinien być `healthy`
- `DATABASE_URL` ma zły port: musi być **`localhost:5433`** (mapping z `docker-compose.yml`), nie 5432
- DB wstała, ale na innym hoście: na Windows przy WSL2 czasem `localhost` nie odpowiada — spróbuj `127.0.0.1`

### 8.3. `ImportError` przy `python run.py`
Nie aktywowałeś `.venv`. `which python` powinno wskazywać na `event-hub-lublin/.venv/Scripts/python.exe`.

### 8.4. `geopandas` / `rtree` / `fiona` — błąd buildowania na Windowsie
Masz Pythona 3.13, brak prebuilt wheels. Rozwiąż: zainstaluj Pythona **3.12** i odtwórz `.venv`.

### 8.5. `alembic upgrade head` — błąd „relation does not exist"
Migracja gdzieś po drodze padła. Sprawdź `alembic current` — pokaże ostatnią dobrze zaaplikowaną. Najpewniej DB była stworzona ręcznie wcześniej w innym stanie. Reset:
```bash
docker compose down -v   # UWAGA: kasuje wolumen z danymi!
docker compose up -d db
alembic upgrade head
```

### 8.6. Frontend nie łączy się z backendem (CORS, 404 na /api)
- Backend musi być pod `127.0.0.1:8000` (proxy Vite jest na sztywno skonfigurowane)
- W `backend/.env` musi być w `CORS_ORIGINS` wpis `http://localhost:8080`
- Sprawdź dev tools → Network — czy żądanie idzie na `/api/v1/...` czy na pełny URL

### 8.7. Logowanie do panelu nie działa (`401 Unauthorized`)
Hasła z README są błędne. Konta po `setup_dev_users.py`: `admin / admin123`, `dyspozytor1 / lublin123`.

### 8.8. Mapa pusta, brak budynków
Nie zaimportowałeś budynków. Uruchom `python -m scripts.import_buildings` (kilka minut).

---

## 9. Co warto posprzątać przy okazji (TODO przed Linuxem)

Te rzeczy nie blokują uruchomienia, ale wprowadzają w błąd:

1. **Usunąć pusty `scripts/`** w korzeniu repo — myli, że tu są skrypty.
2. **Usunąć `package-lock.json`** w korzeniu — błąka się przypadkowo, prawdziwy lock jest w `frontend/`.
3. **Dodać `backend/.env.example`** — żeby każdy nowy kolega miał template (dziś musi go skopiować z tego dokumentu, sekcja 4.2).
4. **Naprawić root `.env`** — port `localhost:5432` jest niepoprawny dla naszego workflow. Albo usunąć ten plik z repo, albo ustawić port `5433`.
5. **Zaktualizować `README.md`:**
   - Sekcja „Uruchomienie" powinna pokazywać hybrydę (DB w Dockerze, backend lokalnie) jako default; pełen Docker — jako wariant alternatywny.
   - Hasła kont muszą być zgodne z `setup_dev_users.py`: `admin/admin123`, `dyspozytor1/lublin123`.
   - Statusy zdarzeń w README są niepełne — w kodzie są: `zgloszona`, `potwierdzona`, `trwajaca`, `w_naprawie`, `zakonczono`, `usunieta`.
6. **Wyrzucić `fix_seeded_events.py`** — jednorazówka z kwietnia, dziś martwa.
7. **`backend/data/users.json`** — wygląda jak archiwalny dump, nie używany przez kod.

---

## 10. TL;DR — szybka instrukcja dla kolegi

1. `git clone <url> && cd event-hub-lublin`
2. Utwórz `backend/.env` z bloku w sekcji 4.2 tego dokumentu.
3. `python -m venv .venv` → aktywuj.
4. `cd backend && pip install -r requirements.txt`
5. `docker compose up -d db` (z korzenia repo)
6. `cd backend && alembic upgrade head`
7. `python -m scripts.setup_dev_users && python -m scripts.import_streets && python -m scripts.import_buildings`
8. `cd ../frontend && npm install`
9. **Codzienna praca:** `docker compose up -d db` + `cd backend && python run.py` + `cd frontend && npm run dev`
10. Zaloguj się: `admin / admin123` na `http://localhost:8080/sys-panel/login`
