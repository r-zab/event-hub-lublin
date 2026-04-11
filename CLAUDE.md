# CLAUDE.md — Event Hub Lublin (Fullstack & GIS)

## O Projekcie
System powiadamiania mieszkańców o awariach sieci wodociągowej dla MPWiK Lublin. Agent działa jako Senior Fullstack & GIS Developer.

## Stack Technologiczny
- **Backend:** Python 3.12+ / FastAPI (async) / SQLAlchemy 2.0 / PostgreSQL 16 z PostGIS / Pydantic v2.
- **Frontend:** React 18 / TypeScript / Vite / Tailwind CSS / shadcn/ui / Leaflet (integracja map).

## Żelazne Zasady Kodu
1. **Frontend:** Stylujemy TYLKO za pomocą Tailwind CSS. Używamy komponentów z `shadcn/ui`. Unikamy `any` w TypeScript.
2. **Backend:** Pełna asynchroniczność (`AsyncSession`, `asyncpg`). ZERO `print()` — zawsze używaj `logger.info()` lub `logger.exception()`.
3. **Synchronizacja:** Zwracaj szczególną uwagę na styk GIS (mapy, `geojson_segment`) z logiką powiadomień (numery budynków).

## ⚠️ Zarządzanie Dokumentacją i Tokenami (KRYTYCZNE) ⚠️
ZABRANIA SIĘ aktualizowania plików `docs/PROGRESS.md` oraz `historia.md` po każdym zadaniu (optymalizacja kosztów tokenów kontekstowych).
Wszelkie zakończone lub nowo odkryte problemy wpisuj i aktualizuj TYLKO w pliku `docs/lista_rzeczy_do_poprawek.md`, zmieniając ich status na `✅ NAPRAWIONO`.

## Przydatne Komendy
- Backend dev: `cd backend && uvicorn app.main:app --reload`
- Frontend dev: `cd frontend && npm run dev`
- Migracje DB: `cd backend && alembic upgrade head`