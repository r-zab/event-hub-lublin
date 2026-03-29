# CLAUDE.md — Event Hub Lublin

## Projekt
System powiadamiania mieszkańców o awariach sieci wodociągowej dla MPWiK Lublin.

## OBOWIĄZKOWO PRZECZYTAJ PRZED PRACĄ
@docs/PROJECT_CONTEXT.md
@docs/TECH_SPEC.md
@docs/RULES.md
@docs/PROGRESS.md

## Stack (backend only — frontend robiony osobno)
- Python 3.12.10 + FastAPI (async)
- SQLAlchemy 2.0 + Alembic
- PostgreSQL 16 (Docker)
- Pydantic v2
- python-jose + passlib[bcrypt] (JWT)
- httpx, aiosmtplib, slowapi

## WAŻNE
- Pracujemy TYLKO nad backendem. NIE twórz nic w frontend/
- Przed pracą sprawdź docs/PROGRESS.md — co jest zrobione
- PLAN FIRST — opisz co zrobisz zanim zaczniesz kodować
- Po każdym zadaniu zaktualizuj docs/PROGRESS.md
- Jeden moduł na raz. Nie rób więcej niż proszę.

## Kluczowe zasady biznesowe
1. Adresy z bazy TERYT (autocomplete, słownikowane)
2. Mapa: linie na ulicach, NIE okręgi/promienie
3. Wiele adresów na subskrybenta
4. Fizyczne usunięcie danych (RODO) — NIE soft delete
5. Zgoda na SMS nocne — osobna, domyślnie wyłączona
6. Pole source w events — multi-operator ready
7. 100% open source, zero kosztów licencyjnych
8. Bramka SMS — mockujemy na etapie dev

## Zmienne środowiskowe
Czytane przez backend/app/config.py z pliku .env
DATABASE_URL, SECRET_KEY, SMS_GATEWAY_TYPE, SMTP_*, CORS_ORIGINS

### Po zakończeniu zadania:
1. Zaktualizuj docs/PROGRESS.md — oznacz co zrobione, dodaj wpis do changelog.
2. Zaktualizuj historia.md — zsynchronizuj listę plików (jeśli doszły nowe) oraz tabelę "Co zostało zrobione" i "Do zrobienia".
3. Opisz w kilku słowach w historia.md (sekcja Changelog lub Stan projektu), co dokładnie zmieniło się w tej konkretnej poprawce.
4. Powiedz mi co testować i jak.