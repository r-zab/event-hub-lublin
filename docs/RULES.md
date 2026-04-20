# Zasady pracy — System Powiadomień MPWiK Lublin

## Scope
- Pracujemy TYLKO nad backendem (backend/)
- Frontend będzie robiony osobno w Lovable — NIE TWÓRZ plików w frontend/
- NIE twórz plików poza katalogiem projektu

## Python / Backend
- Python 3.12.10, FastAPI, SQLAlchemy 2.0 async, Pydantic v2
- Formatowanie: Black, line-length=99
- Type hints na KAŻDEJ funkcji
- Async/await na KAŻDEJ operacji I/O
- SQLAlchemy: ZAWSZE ORM, NIGDY surowy SQL ze stringami
- Hasła: bcrypt. NIGDY plaintext
- Sekrety: ZAWSZE z config.py. NIGDY hardkodowane
- Usuwanie danych: FIZYCZNE delete (RODO)
- Logowanie: moduł logging, NIE print()
- Każdy endpoint musi mieć Pydantic schema + docstring
- Każda zmiana modelu = nowa migracja Alembic

## Workflow
1. PLAN FIRST — przed kodem opisz co zrobisz i w jakich plikach
2. Jeden moduł na raz
3. Przed edycją pliku — powiedz co zmienisz
4. Po zadaniu — podsumowanie: jakie pliki, co zrobiłeś
5. Po zadaniu — zaktualizuj docs/PROGRESS.md
6. NIE rób rzeczy których nie prosiłem

## API
- Prefix: /api/v1/
- Auth admin: Bearer JWT
- Auth external: X-API-Key
- Pagination: ?skip=0&limit=20
- Errors: {"detail": "message"}

## Bezpieczeństwo
- Parametryzowane SQL (ORM)
- Bcrypt (cost 12)
- JWT z expiration (30min)
- Rate limiting (slowapi)
- CORS: only allowed origins
- Pydantic validation

## Dokumentacja i Historia
- Każda sesja Claude Code MUSI zakończyć się aktualizacją plików dokumentacji.
- Plik `historia.md` jest źródłem prawdy o stanie projektu dla użytkownika — musi zawierać aktualną listę plików i postęp prac.
- Jeśli Claude Code tworzy nowy plik, musi on zostać odnotowany w strukturze katalogów w `historia.md`.
- Przed komendą `/clear`, Claude musi upewnić się, że `historia.md` odzwierciedla stan po zmianach.