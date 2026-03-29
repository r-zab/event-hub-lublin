# Historia i stan projektu — Event Hub Lublin

> Ostatnia aktualizacja: 2026-03-29

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
├── create-structure.ps1               # Skrypt PowerShell tworzący strukturę katalogów
├── historia.md                        # Ten plik
│
├── docs/
│   ├── PROJECT_CONTEXT.md             # Kontekst biznesowy, rozmowy z MPWiK, decyzje
│   ├── TECH_SPEC.md                   # Specyfikacja techniczna: API, baza danych, algorytmy
│   ├── RULES.md                       # Zasady pracy: styl kodu, workflow, bezpieczeństwo
│   ├── PROGRESS.md                    # Co jest zrobione, co jest następne
│   └── CHANGELOG.md                  # Dziennik zmian
│
├── backend/                           # === JEDYNY AKTYWNY KATALOG ===
│   ├── Dockerfile                     # Obraz Docker dla backendu
│   ├── requirements.txt               # Zależności Pythona
│   ├── alembic.ini                    # Konfiguracja Alembic (sqlalchemy.url puste — ustawiany w env.py)
│   │
│   ├── alembic/
│   │   ├── env.py                     # Konfiguracja migracji (async→sync, importuje modele)
│   │   ├── script.py.mako             # Szablon generowanych plików migracji
│   │   └── versions/
│   │       └── 20260329_937cb6bd3ab4_initial_tables.py  # Pierwsza migracja — 8 tabel
│   │
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                    # FastAPI app, CORS, health check, lifespan
│   │   ├── config.py                  # Pydantic Settings — wszystkie zmienne z .env
│   │   ├── database.py                # AsyncEngine, AsyncSession, Base, get_db()
│   │   │
│   │   ├── models/                    # Modele SQLAlchemy 2.0 (ORM, Mapped[])
│   │   │   ├── __init__.py            # Reeksportuje wszystkie modele (ważne dla Alembic)
│   │   │   ├── user.py                # User (id, username, password_hash, role, is_active)
│   │   │   ├── street.py              # Street (teryt_sym_ul, name, full_name, geojson)
│   │   │   ├── event.py               # Event + EventHistory (awaria, status, historia zmian)
│   │   │   ├── subscriber.py          # Subscriber + SubscriberAddress (wiele adresów)
│   │   │   ├── notification.py        # NotificationLog (SMS/email, status wysyłki)
│   │   │   └── api_key.py             # ApiKey (dla operatorów zewnętrznych)
│   │   │
│   │   ├── routers/                   # Endpointy FastAPI (wszystkie PUSTE — do zrobienia)
│   │   │   └── __init__.py
│   │   │
│   │   ├── schemas/                   # Pydantic v2 schemas (PUSTE — do zrobienia)
│   │   │   └── __init__.py
│   │   │
│   │   ├── services/                  # Logika biznesowa (PUSTE — do zrobienia)
│   │   │   └── __init__.py
│   │   │
│   │   └── utils/                     # Narzędzia pomocnicze (PUSTE — do zrobienia)
│   │       └── __init__.py
│   │
│   ├── scripts/                       # Skrypty pomocnicze (seed, import TERYT — do zrobienia)
│   └── tests/                         # Testy (PUSTE — do zrobienia)
│       └── __init__.py
│
├── frontend/                          # NIE DOTYKAMY — robiony osobno w Lovable
│   ├── public/
│   └── src/
│       ├── api/
│       ├── components/Map/
│       ├── hooks/
│       ├── pages/
│       ├── styles/
│       └── types/
│
├── nginx/                             # Konfiguracja Nginx (do zrobienia)
├── presentation/slides/               # Prezentacja na Festiwal Biznesu
├── research/ankieta/wyniki/           # Wyniki badań/ankiet
└── scripts/                           # Skrypty na poziomie projektu
```

---

## Co zostało zrobione

### 1. Struktura projektu
- Katalogi i puste pliki startowe (`create-structure.ps1`)
- `.gitignore`, `README.md`, `CLAUDE.md`

### 2. Docker
- `docker-compose.yml` — PostgreSQL 16 Alpine z healthcheck, backend FastAPI
- `backend/Dockerfile` — obraz dla backendu

### 3. FastAPI starter
- `app/main.py` — aplikacja z CORS, health check `/health`, lifespan handler
- `app/config.py` — Pydantic Settings czytający zmienne z `.env` (DATABASE_URL, SECRET_KEY, SMTP_*, SMS_*, CORS_ORIGINS)
- `app/database.py` — async engine (`asyncpg`), `AsyncSessionLocal`, `Base`, dependency `get_db()`

### 4. Modele SQLAlchemy 2.0
Wszystkie tabele z `docs/TECH_SPEC.md` zaimplementowane jako klasy ORM z `Mapped[]`:

| Model | Tabela | Opis |
|-------|--------|------|
| `User` | `users` | Dyspozytorzy i adminowie MPWiK |
| `Street` | `streets` | Słownik ulic TERYT z GeoJSON |
| `Event` | `events` | Awarie, planowane wyłączenia, remonty |
| `EventHistory` | `event_history` | Historia zmian statusu zdarzenia |
| `Subscriber` | `subscribers` | Subskrybenci powiadomień (RODO) |
| `SubscriberAddress` | `subscriber_addresses` | Adresy subskrybenta (wiele na osobę) |
| `NotificationLog` | `notification_log` | Log wysłanych SMS/email |
| `ApiKey` | `api_keys` | Klucze API dla operatorów zewnętrznych |

Indeksy bazy danych zgodne ze specyfikacją (status, source, street_id, created_at, itp.)

### 5. Alembic — konfiguracja i pierwsza migracja
- `backend/alembic.ini` — `sqlalchemy.url` celowo puste
- `backend/alembic/env.py` — obsługuje async (podmiana `+asyncpg` → `""`), importuje wszystkie modele, offline i online mode
- `backend/alembic/script.py.mako` — szablon plików migracji
- `backend/alembic/versions/20260329_937cb6bd3ab4_initial_tables.py` — migracja "initial tables": tworzy wszystkie 8 tabel z indeksami; zastosowana przez `upgrade head`

---

## Co jest do zrobienia (w kolejności)

### Następne: Auth — security.py, dependencies.py, router auth.py, schema auth.py

---

### Pełna lista zadań

| # | Zadanie | Status |
|---|---------|--------|
| 1 | Alembic — pierwsza migracja (`initial`) | ✅ zrobione |
| 2 | Auth — `security.py`, `dependencies.py`, router `auth.py`, schema `auth.py` | ☐ |
| 3 | Streets — router `streets.py`, schema (autocomplete TERYT) | ☐ |
| 4 | Events — router `events.py`, schema (CRUD + walidacja) | ☐ |
| 5 | Subscribers — router `subscribers.py`, schema (rejestracja, wyrejestrowanie RODO) | ☐ |
| 6 | Notification engine — `sms_gateway`, `email_sender`, `matching`, `notification_engine` | ☐ |
| 7 | Podłączenie notification engine do events router (trigger po zmianie statusu) | ☐ |
| 8 | Seed data — użytkownicy testowi, ulice, zdarzenia, subskrybenci | ☐ |
| 9 | Import ulic TERYT z GUS API | ☐ |
| 10 | Geocoding (Nominatim → GeoJSON w tabeli `streets`) | ☐ |
| 11 | Endpoint `GET /api/v1/events/feed` (tekst dla IVR 994) | ☐ |
| 12 | Admin endpoints (stats, lista subskrybentów, log powiadomień) | ☐ |

---

## Kluczowe decyzje techniczne

| Decyzja | Powód |
|---------|-------|
| Tylko backend, frontend w Lovable | Podział odpowiedzialności, frontend osobny zespół |
| Adresy z TERYT (słownikowane) | Wymaganie MPWiK — brak literówek, autocomplete |
| Linie ulic na mapie (nie okręgi) | Wymaganie MPWiK — precyzja, prawdziwy zasięg awarii |
| Fizyczne delete (nie soft delete) | RODO — pełne usunięcie danych subskrybenta |
| SMS nocne osobna zgoda | Wymaganie prawne — domyślnie wyłączone |
| `source` w events | Multi-operator ready (LPEC, ZDiM, inne w przyszłości) |
| MockSMSGateway | Bramka SMS MPWiK bez dokumentacji API na etapie dev |
| asyncpg + psycopg2 (Alembic) | FastAPI async wymaga asyncpg; Alembic nie obsługuje async drivera |

---

## Changelog

- **2026-03-29**: Alembic — migracja `initial tables` (rev `937cb6bd3ab4`), `upgrade head` zakończony sukcesem. Wszystkie 8 tabel w bazie PostgreSQL. Bugfix: `Mapped[func.now]` → `Mapped[datetime]` w `user.py`. Dodano `psycopg2-binary==2.9.9` do `requirements.txt` (wymagane przez Alembic jako sync driver).

---

## Zmienne środowiskowe (`.env`)

```env
DATABASE_URL=postgresql+asyncpg://eventhub:devpassword@localhost:5432/eventhub
SECRET_KEY=...
SMS_GATEWAY_TYPE=mock
SMTP_HOST=localhost
SMTP_PORT=587
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

---

## Jak uruchomić lokalnie

```bash
# 1. Uruchom bazę danych
docker-compose up db -d

# 2. Zainstaluj zależności
cd backend
pip install -r requirements.txt

# 3. Uruchom pierwszą migrację
alembic upgrade head

# 4. Uruchom backend
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs
