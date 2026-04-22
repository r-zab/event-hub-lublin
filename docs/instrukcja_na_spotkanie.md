# Instrukcja na spotkanie z Szefem IT (Piotr) — Demo MVP "Event Hub Lublin"

**Data:** 2026-04-23 (Zoom)  
**Cel:** Prezentacja postępu prac nad MVP — warstwa techniczna i biznesowa  
**Czas:** ~40 minut (demo 20 min + Q&A 20 min)

---

## 1. Główne punkty do zaprezentowania — The "Wow" Factor

### 1.1 Interfejs — Premium Dark Mode z gradientry i ramkami

Otwórz `http://localhost:8080` i przejdź przez stronę publiczną.

**Co podkreślić:**
- Styl bliski Linear/Vercel — spójny design system oparty wyłącznie na `shadcn/ui` + Tailwind; zero bibliotek UI z zewnątrz.
- Dark/light mode bez migotania — `next-themes`-style class switching, zapisuje preferencję w localStorage.
- Strona `/about` — pełna instrukcja dla mieszkańców (statystyki: 1378 ulic TERYT, 51 000+ budynków), legenda kolorów, zasady RODO. Zbudowana z `Card`, `Tabs`, `Accordion`, `Badge` — zero custom CSS poza Tailwind.
- Status badges: każdy status ma kontrast ≥ 4.5:1 (WCAG 2.1 AA) po serii poprawek z 22.04.

### 1.2 Wyszukiwarka — szybkość i inteligentne sortowanie

Przejdź do formularza rejestracji (`/register`), wpisz ulicę z kilkoma wynikami (np. „Lipowa").

**Co pokazać:**
- Podpowiedzi autouzupełniania ulic — endpoint `GET /streets?q=` z escapowaniem znaków LIKE (`%`, `_`, `\`); ataki SQL nie zaburzają działania.
- Lista numerów budynków po wyborze ulicy — sortowanie alfanumeryczne `localeCompare({ numeric: true })`: wyniki prezentowane jako `1, 2, 10, 10A, 11`, nie `1, 10, 10A, 11, 2`.
- Brak ikony `#` przy polu numeru — czyste pole tekstowe, bez wizualnego szumu.
- Walidacja adresu w czasie rzeczywistym: wpisanie numeru spoza bazy MPWiK blokuje przycisk „Zarejestruj się" i wyświetla Toast z komunikatem.

### 1.3 Mapa — stabilność i odporność na błędy

Wróć do strony głównej, odszukaj sekcję mapy.

**Co podkreślić:**
- `MapErrorBoundary` opakowuje `<EventMap />` — przy nieoczekiwanym błędzie Leaflet/GeoJSON komponent pokazuje fallback: „Nie udało się załadować mapy, ale powiadomienia działają poprawnie." Strona publiczna pozostaje w pełni użyteczna.
- Polling co 60 sekund — mieszkaniec widzi zmiany w ciągu minuty bez odświeżania strony.
- `aria-label="Mapa zdarzeń"` na kontenerze mapy — spełniony wymóg WCAG 1.3.1.

---

## 2. Techniczny "Hardening" — Co zrobiliśmy pod maską

### 2.1 Bezpieczeństwo

| Obszar | Co zostało zrobione |
|--------|-------------------|
| **Brute-force login** | Rate limit 5 req/min na `/auth/login` (SlowAPI). Blokada zwraca HTTP 429 z opisem. Testy integracyjne pokrywają logowanie poprawne i błędne (test_auth.py). |
| **CORS hardening** | Lista dozwolonych origins jawna i ograniczona; brak `allow_origins=["*"]` w środowisku prod. |
| **Bezpieczny SECRET_KEY** | Aplikacja nie startuje bez `SECRET_KEY` w env — `Pydantic BaseSettings` rzuca `ValidationError` przy próbie uruchomienia z pustym kluczem. Koniec z domyślnym `"changeme"` w kodzie. |
| **RBAC** | `DELETE /events/{id}` chroni `get_current_dispatcher_or_admin` (nie każdy zalogowany user). Testowane w `test_events.py`. |
| **RODO w logach** | Wszystkie dane osobowe (telefon, email) zamaskowane: `+48 123 *** 89`, `m***k@lublin.eu` — w logach aplikacyjnych, logach transportowych (SMS/Email gateway) i w kolumnie `recipient` bazy danych. Migracja retroaktywna maskuje historyczne rekordy. |

### 2.2 Dostępność (WCAG 2.1 AA)

Otwórz narzędzia deweloperskie → zakładka axe DevTools lub Lighthouse.

**Naprawione problemy (wszystkie z 22.04):**
- Badge „Remont": kontrast 1.91:1 → 5.0:1 (`bg-amber-700`)
- Badge „Awaria": kontrast 3.76:1 → 6.5:1 (`bg-red-700`)
- Badge „Planowane wyłączenie": kontrast 3.67:1 → 6.7:1 (`bg-blue-700`)
- `StatusBadge` — statusy „Planowane" i „Remont": kontrast 3.06:1 / 3.57:1 → 5.6:1 / 7.2:1
- `StatusBadge` — status „W naprawie": kontrast 1.82:1 → 6.3:1 (`text-amber-800`)
- Tagi `<code>` na stronie `/about`: kontrast 4.48:1 → 9.2:1 (`text-slate-700`)
- Brakujący `aria-hidden="true"` na ikonach dekoracyjnych: `ChevronDown` w Accordion, `MoreHorizontal` w Breadcrumb/Pagination
- `aria-label` na kontenerze mapy Leaflet

**Wynik:** Wszystkie wymienione naruszenia są naprawione. Pełną weryfikację axe/Lighthouse na `/`, `/register`, `/about` można przeprowadzić na żywo.

### 2.3 Stabilność i testy automatyczne

```
backend/tests/
├── conftest.py       # Fixture: AsyncClient → ASGI (bez uruchamiania serwera)
├── test_auth.py      # Logowanie poprawne (200) + złe hasło (401)
├── test_events.py    # RBAC DELETE: dyspozytor → 404; brak tokena → 401
└── test_streets.py   # SQL LIKE injection: %%%, ___, \\\ → 200 + pusta lista
```

**Zasada testów:** Prawdziwa baza dev (Docker PostGIS) — żadnych mocków bazy, zgodnie z filozofią „mock prod divergence kills migrations".

---

## 3. Instrukcja pokazu — Krok po kroku

### Przed spotkaniem (5 min wcześniej)

```bash
# 1. Uruchom bazę danych
docker-compose up -d db

# 2. Backend
cd backend && uvicorn app.main:app --reload
# Oczekiwany output: "Application startup complete."

# 3. Frontend (osobny terminal)
cd frontend && npm run dev
# Otwiera http://localhost:8080
```

Sprawdź że panel admina jest dostępny pod `/sys-panel/login` (nie `/admin/login` — zmieniony dla bezpieczeństwa).

### Sekwencja demo

**[2 min] Strona publiczna — pierwsze wrażenie**
1. Otwórz `http://localhost:8080`
2. Pokaż mapę z aktywnymi zdarzeniami (muszą być dodane wcześniej!)
3. Zwróć uwagę na polling — „mapa odświeża się automatycznie co minutę"

**[3 min] Wyszukiwarka — inteligentne sortowanie**
1. Przejdź do `/register`
2. Wpisz „Lip" → pokaż autocomplete ulic
3. Wybierz ulicę z budynkami o numerach alfanumerycznych (np. z „10A")
4. Otwórz dropdown numerów → pokaż kolejność: `1, 2, 10, 10A, 11`
5. Wpisz ręcznie nieprawidłowy numer → pokaż Toast i zablokowany przycisk

**[3 min] Strona About — profesjonalizm**
1. Kliknij „O systemie" w nawigacji
2. Pokaż statystyki GIS, legendę kolorów, zakładki Tabs z instrukcją RODO

**[5 min] Panel admina — tworzenie zdarzenia**
1. Zaloguj się przez `/sys-panel/login`
2. Dodaj nowe zdarzenie: ulica, zakres numerów, typ „Awaria"
3. Pokaż podgląd SMS w czasie rzeczywistym (reaktywne pole pod formularzem)
4. Zapisz — wróć na stronę publiczną i pokaż nowe zdarzenie na mapie

**[5 min] Testy automatyczne — budowanie zaufania**

Otwórz terminal i uruchom:
```bash
cd backend && python -m pytest tests/ -v --tb=short
```

Oczekiwany output (zielone):
```
tests/test_auth.py::test_login_success        PASSED
tests/test_auth.py::test_login_wrong_password PASSED
tests/test_events.py::test_delete_as_dispatcher_returns_404 PASSED
tests/test_events.py::test_delete_requires_auth PASSED
tests/test_streets.py::test_like_injection_percent PASSED
tests/test_streets.py::test_like_injection_underscore PASSED
tests/test_streets.py::test_like_injection_backslash PASSED

7 passed in X.XXs
```

**Komentarz na żywo:** „Mamy testy, które dosłownie próbują złamać wyszukiwarkę atakiem SQL — i failują, bo system jest odporny."

---

## 4. Pytania pułapki — Technical Trap Questions i gotowe odpowiedzi

### P1: „Jak system zachowa się przy 100 tysiącach budynków?"

**Odpowiedź:**
> Baza już teraz zawiera 51 000+ budynków z geometrią PostGIS (`GEOMETRY` z indeksem GIST). Filtrowanie subskrybentów przy powiadomieniu to spatial join — PostGIS wykonuje go w ułamku sekundy dzięki indeksowi przestrzennemu nawet przy milionach rekordów. Dla samego autocomplete ulic (`GET /streets?q=`) używamy `ILIKE` z indeksem B-tree na `name`. Przy 100 tys. budynków jedynym potencjalnym bottleneckiem jest generowanie GeoJSON dla mapy — do tego mamy limit `100` zdarzeń na widok publiczny i stronicowanie po stronie serwera w panelu admina.

### P2: „Dlaczego nie mamy pełnej integracji z systemem GIS MPWiK?"

**Odpowiedź:**
> To celowa granica projektu MVP — zdefiniowana na etapie wymagań. Dane ulic i budynków są importowane z rejestru TERYT/OSM (1378 ulic, 51 000+ budynków) i przechowywane lokalnie w PostGIS. Pełna integracja dwukierunkowa z wewnętrznym GIS MPWiK (WMS/WFS) to osobny projekt z wymaganiami dot. autentykacji, licencji na dane i synchronizacji — idealny temat na kolejną fazę. Obecna architektura (model `Street` + `Building` w bazie) jest zaprojektowana tak, żeby tę integrację dało się dokleić bez przebudowy core systemu.

### P3: „Jak sprawdzacie, że SMS nie wyjdzie w nocy?"

**Odpowiedź:**
> `notification_service.py` sprawdza aktualny czas w strefie `Europe/Warsaw` przed wysyłką SMS. Godziny 22:00–06:00 to „cisza nocna" — SMS jest wówczas zapisywany do kolejki porannej (`morning_queue`) ze statusem `queued_morning` w `NotificationLog`, a nie wysyłany. O 06:00 czasu warszawskiego APScheduler odpala `process_morning_queue()`, który wysyła wszystkie wstrzymane SMS-y. E-maile wychodzą bez ograniczeń czasowych — są uznawane za mniej inwazyjne. Całość jest deterministyczna i testowalna — godzina jest argumentem, nie global state.

### P4: „Co jeśli ktoś wpisze `' OR 1=1` w wyszukiwarkę?"

**Odpowiedź:**
> Mamy na to dedykowany test! `test_streets.py::test_like_injection_percent` — wpisanie samych `%` bez escapowania pasowałoby do WSZYSTKICH rekordów w bazie. Endpoint `GET /streets?q=` escapuje znaki specjalne LIKE (`%` → `\%`, `_` → `\_`, `\` → `\\`) przed przekazaniem do zapytania SQLAlchemy. Co do SQL Injection w stylu `' OR 1=1` — ORM SQLAlchemy używa parametryzowanych zapytań; surowy SQL nigdzie nie jest budowany przez konkatenację stringów. Testy PASS — możemy pokazać je na żywo.

---

## Backup plan

- Jeśli Docker nie odpala: otwórz `docs/stan_projektu.md` — pełna dokumentacja zmian z 22.04 z numerami linii i wyjaśnieniami.
- Jeśli testy failują: sprawdź czy Docker PostGIS działa (`docker-compose up -d db`) i czy zmienne `.env` są ustawione.
- Jeśli padnie sieć: przygotuj zrzuty ekranu z terminala z przechodzącymi testami jako backup.
