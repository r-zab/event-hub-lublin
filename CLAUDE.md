# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O Projekcie

System powiadamiania mieszkańców o awariach sieci wodociągowej dla MPWiK Lublin. Agent działa jako Senior Fullstack & GIS Developer.

## Stack Technologiczny

- **Backend:** Python 3.12+ / FastAPI (async) / SQLAlchemy 2.0 / PostgreSQL 16 z PostGIS / Pydantic v2
- **Frontend:** React 18 / TypeScript / Vite / Tailwind CSS / shadcn/ui / Leaflet (mapy)
- **Infrastruktura:** Docker Compose (PostGIS 16-3.4-alpine na porcie 5433, backend na 8000, frontend na 8080)

## Komendy Deweloperskie

```bash
# Backend
cd backend && uvicorn app.main:app --reload

# Frontend
cd frontend && npm run dev

# Migracje DB
cd backend && alembic upgrade head
cd backend && alembic revision --autogenerate -m "opis"

# Docker
docker-compose up -d          # uruchom db + backend
docker-compose up -d db       # tylko baza danych
```

## Architektura Backendu

**Punkty wejścia:** `backend/app/main.py` — rejestruje routery, CORS, rate limiting (SlowAPI), APScheduler (SMS o 06:00 czas warszawski).

**Endpointy API v1:**
- `GET/POST /events` — lista/tworzenie zdarzeń; POST wyzwala async job powiadomień
- `PUT/DELETE /events/{id}` — edycja z zapisem do EventHistory; DELETE najpierw zmienia status na `usunieta`
- `POST /subscribers` — rejestracja (rate limit 3/min), walidacja RODO, deduplikacja email/telefon
- `GET/DELETE /subscribers/{unsubscribe_token}` — dostęp i usunięcie (RODO hard delete)
- `POST /auth/login` + `POST /auth/refresh` — JWT HS256, access 30 min, refresh 7 dni
- `/api/v1/admin/*` — wymaga JWT + rola admin

**Dependency injection:** `get_db()` → AsyncSession; `get_current_user()`, `get_current_admin()`, `get_current_dispatcher_or_admin()` w `app/dependencies.py`.

**Modele danych** (`backend/app/models/`):
- `Event` — zdarzenie (awaria/wyłączenie/remont), pola: `event_type`, `street_id`, `house_number_from/to`, `status`, `geojson_segment`, `start_time`, `estimated_end`
- `EventHistory` — audit log zmian statusu
- `Subscriber` + `SubscriberAddress` — subskrybent z wieloma adresami; RODO: tylko hard delete
- `Street` — rejestr ulic z kodami TERYT i `geojson` (LineString)
- `Building` — obrys budynku z OSM; pola `geom` (PostGIS GEOMETRY) z indeksem GIST
- `NotificationLog` — log wszystkich wysłanych SMS/email
- `User` — konta admin/dyspozytor z bcrypt (cost=12)

**Statusy zdarzeń:** `zgloszona` → `potwierdzona` → `trwajaca` → `zakonczono` / `usunieta`

## Architektura Frontendu

**Routing** (`frontend/src/App.tsx`): React Router v6; trasy publiczne (`/`, `/register`, `/unsubscribe/:token`) + chronione `/admin/*` za `ProtectedAdminLayout` (redirect na `/admin/login` gdy brak tokena).

**API client** (`frontend/src/lib/api.ts`): `apiFetch<T>()` — wstrzykuje Bearer token z localStorage (`mpwik_token`), przy 401 czyści tokeny i przekierowuje do logowania. Proxy Vite: `/api` → `http://127.0.0.1:8000`.

**Stan serwera:** TanStack React Query — custom hooki: `useEvents()`, `useStreets()`, `useBuildings()`.

**Autoryzacja:** `useAuth()` hook + `AuthProvider` context; tokeny w localStorage.

**Mapa:** Leaflet + React-Leaflet; konfiguracja w `frontend/src/lib/mapConfig.ts`; komponent `EventMap.tsx` i `AdminMapView.tsx`.

## Żelazne Zasady Kodu

1. **Frontend:** Stylujemy TYLKO Tailwind CSS + komponenty `shadcn/ui`. Unikamy `any` w TypeScript.
2. **Backend:** Pełna asynchroniczność (`AsyncSession`, `asyncpg`). ZERO `print()` — zawsze `logger.info()` lub `logger.exception()`.
3. **GIS ↔ powiadomienia:** Szczególna uwaga na styk `geojson_segment` w Event z logiką filtrowania numerów budynków w `notification_service.py` (obsługa alfanumerycznych: "10A", "10B").
4. **Numery budynków:** Parsowanie w `parse_house_number()` w notification service — nie zmieniaj bez testów numerów skrajnych zakresu.

## ⚠️ Zarządzanie Dokumentacją (KRYTYCZNE) ⚠️

**ZABRANIA SIĘ** aktualizowania `docs/PROGRESS.md` oraz `historia.md` po każdym zadaniu.
Wszelkie zakończone lub nowo odkryte problemy wpisuj TYLKO w `docs/stan_projektu.md` (zmieniając status na `✅ NAPRAWIONO`).

## Kluczowe Wzorce

- **Notification flow:** `notify_event()` (async background job) → dopasuj subskrybentów po ulicy + zakresie numerów → filtruj nocną ciszę SMS → wyślij email + SMS → zapisz do `NotificationLog`
- **Morning queue:** APScheduler odpala `process_morning_queue()` o 06:00 dla SMS wstrzymanych nocą
- **Migracje:** Pliki w `backend/alembic/versions/` — nazwy z datą `YYYYMMDD_opis`
- **Rate limiting:** `/auth/login` — 5/min; `POST /subscribers` — 3/min
