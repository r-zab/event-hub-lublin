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
