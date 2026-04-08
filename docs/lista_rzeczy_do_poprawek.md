# Lista rzeczy do poprawek - Audyt techniczny Event Hub Lublin

Data audytu: 2026-04-03

---

## 1. BLEDY KRYTYCZNE

### ~~1.1~~ ✅ NAPRAWIONO — Wyrejestrowanie (Unsubscribe) - frontend kompletnie nie dziala z backendem
- **Plik:** `frontend/src/pages/Unsubscribe.tsx`
- **Problem:** Frontend pyta o e-mail i po submitcie wyswietla toast "Dane usuniete" - ale **NIE wywoluje zadnego API**. Funkcja `handleSubmit` nie robi `fetch`/`apiFetch` do backendu. Dane NIE sa usuwane z bazy.
- **Backend** oczekuje DELETE `/api/v1/subscribers/{unsubscribe_token}` - wymaga tokenu, nie e-maila.
- **Skutek:** Uzytkownik mysli, ze sie wyrejestrowal, a jego dane dalej sa w bazie. **Naruszone RODO**.
- **Naprawa:** Przepisac Unsubscribe.tsx - formularz powinien przyjmowac `unsubscribe_token` (nie e-mail), wywolac GET `/subscribers/{token}` zeby pokazac dane, a potem DELETE `/subscribers/{token}`.

### ~~1.2~~ ✅ NAPRAWIONO — Brak walidacji unikalnosci e-maila przy rejestracji
- `unique=True` dodane do `email` w modelu + HTTP 409 w routerze + migracja `c2d3e4f5a6b7`.

### ~~1.3~~ ✅ NAPRAWIONO — Brak walidacji unikalnosci telefonu
- `unique=True` dodane do `phone` w modelu, walidacja w routerze sprawdza obie kolumny jednocześnie.

### ~~1.4~~ ✅ NAPRAWIONO — Brak endpointu DELETE /events/{id} (wymagany w TECH_SPEC)
- `DELETE /api/v1/events/{id}` dodany w `routers/events.py` z weryfikacją `user.role == 'admin'` (HTTP 403 gdy dispatcher), zwraca HTTP 204 No Content.

### ~~1.5~~ ✅ NAPRAWIONO — Brak endpointu POST /api/v1/auth/refresh (wymagany w TECH_SPEC)
- `create_refresh_token()` w `security.py` (JWT z `type=refresh`, ważny 7 dni wg `REFRESH_TOKEN_EXPIRE_DAYS`).
- Endpoint `POST /api/v1/auth/refresh` w `routers/auth.py` — przyjmuje JSON `{refresh_token}`, weryfikuje claim `type=refresh`, zwraca nowy access token.
- Login `POST /auth/login` zwraca teraz `refresh_token` w odpowiedzi.
- Schema `RefreshRequest` dodana do `schemas/auth.py`; `Token` ma opcjonalne pole `refresh_token`.

### ~~1.6~~ ✅ NAPRAWIONO — Nocna cisza liczy czas w UTC zamiast CET/CEST
- `_is_night_hours()` w `notification_service.py` zmieniona na `datetime.now(ZoneInfo("Europe/Warsaw")).hour`.
- Import `from zoneinfo import ZoneInfo` dodany (stdlib Python 3.9+).

### ~~1.7~~ ✅ NAPRAWIONO — Edycja zdarzenia (AdminEventForm) nie laduje danych istniejacego eventu
- Route zmieniony na `/admin/events/edit/:id` w `App.tsx`; `AdminEventForm.tsx` używa `useParams<{id}>()`, ładuje dane przez `getEvent(id)` przy montowaniu (`useEffect`), przekazuje dane do pól formularza. Submit: `PUT /events/{id}` przy edycji, `POST /events` przy tworzeniu. Spinner podczas ładowania, różne tytuły i toasty dla obu trybów.

### ~~1.8~~ ✅ NAPRAWIONO — `asyncio.create_task(notify_event)` bez obsługi błędów
- `notify_event()` owinięto głównym `try/except Exception` z `logger.exception(...)` — pełny traceback w logach.
- Pętla per-subskrybent ma własny `try/except`: błąd dla jednej osoby nie przerywa wysyłki do pozostałych; licznik `sent_count`/`error_count` w podsumowującym logu.
- Logika wysyłki wyizolowana do `_send_notifications_for_subscriber()` — czytelna separacja obowiązków.
- `events.py`: `task.add_done_callback(_log_task_exception)` jako druga linia obrony — loguje wyjątki, które mimo wszystko przebijają się poza `notify_event`.

---

## 2. BRAKUJACE FUNKCJE (wg TECH_SPEC i ustalen ze spotkania)

### ~~2.1~~ ✅ NAPRAWIONO — Endpointy admin
- `routers/admin.py`: GET /admin/stats, GET /admin/subscribers (skip/limit, total_count), GET /admin/notifications (skip/limit, total_count).
- `dependencies.py`: `get_current_admin` — HTTP 403 dla non-admin.
- `main.py`: router zarejestrowany pod prefiksem `/api/v1/admin`.
- **Bugfix MissingGreenlet** (2026-04-08): `GET /admin/subscribers` używa `selectinload(Subscriber.addresses)` zamiast ręcznego mapowania — eliminuje lazy load w kontekście async (SQLAlchemy async nie wspiera niejawnych zapytań poza sesją).

### 2.2 Endpoint GET /api/v1/events/feed (IVR 994)
- **Plik:** brak w `backend/app/routers/events.py`
- **Problem:** TECH_SPEC wymaga endpointu plain text dla automatu 994. Na spotkaniu (PDF str. 5) szef IT powiedzial "odpusccie sobie to" na razie, ale endpoint feed jest prosty i warto go miec.
- **Naprawa:** Dodac GET `/events/feed` zwracajacy `text/plain` z lista aktywnych awarii.

### 2.3 Brak autoryzacji X-API-Key dla external operatorow
- **Pliki:** brak `backend/app/routers/external.py`, model `ApiKey` istnieje ale jest nieuzywany
- **Problem:** TECH_SPEC i spotkanie mowia o multi-operator ready (source w events). Model `api_keys` jest w bazie, ale brak dependency do walidacji API key, brak routera external.
- **Skutek:** Zewnetrzni operatorzy (LPEC, zarzad drog) nie moga wysylac zdarzen przez API.

### ~~2.4~~ ✅ NAPRAWIONO — Weryfikacja roli (admin vs dispatcher)
- `dependencies.py`: `get_current_admin(current_user = Depends(get_current_user))` — sprawdza `role == "admin"`, rzuca HTTP 403 gdy dispatcher.
- Cały router `/api/v1/admin` wymaga tej dependency.

### ~~2.5~~ ✅ NAPRAWIONO — Geocoding ulic (Nominatim → GeoJSON)
- `scripts/geocode_streets.py`: async, Nominatim `/search`, delay 1.2 s (Usage Policy), zapis `{"type":"Point","coordinates":[lon,lat]}` do `street.geojson`.
- Flagi CLI: `--delay`, `--dry-run`, `--limit`. Idempotentny (pomija ulice z istniejącym geojson).
- Uruchomienie: `python -m scripts.geocode_streets` z katalogu `backend/`.

### ~~2.6~~ ✅ NAPRAWIONO — Scheduler porannej kolejki SMS
- `services/notification_service.py`: `process_morning_queue()` — SELECT `queued_morning`, send SMS, UPDATE `sent`/`failed`.
- `main.py`: `AsyncIOScheduler` z jobem cron `hour=6, minute=0, timezone="Europe/Warsaw"`, start w lifespan, shutdown po yield.
- `requirements.txt`: `apscheduler==3.10.4`.

### ~~2.7~~ ✅ NAPRAWIONO — Walidacja formatu telefonu
- `schemas/subscriber.py`: `phone_format` validator — regex `^\+48\d{9}$|^\d{9}$`, strip spacji/myślników, ValueError z czytelnym komunikatem.
- `frontend/Register.tsx`: `pattern="^(\+48)?\d{9}$"` + `title="Format: 123456789 lub +48123456789"` na inpucie telefonu.

### ~~2.8~~ ✅ NAPRAWIONO — Rate limiting (slowapi)
- `app/limiter.py`: współdzielona instancja `Limiter(key_func=get_remote_address)`.
- `main.py`: `app.state.limiter = limiter` + `add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)`.
- `routers/auth.py`: `@limiter.limit("5/minute")` na login (brute-force).
- `routers/subscribers.py`: `@limiter.limit("3/minute")` na rejestrację (anty-spam).

---

## 3. UX / FRONTEND

### 3.1 Unsubscribe - kompletnie zly flow (patrz 1.1)
- **Plik:** `frontend/src/pages/Unsubscribe.tsx`
- Frontend pyta o e-mail - backend wymaga tokenu. Flow jest niespojny. Link do wyrejestrowania powinien byc `/unsubscribe?token=xxx` lub `/unsubscribe/:token`.

### 3.2 Brak informacji o wyslanych powiadomieniach w dashboard
- **Plik:** `frontend/src/pages/AdminDashboard.tsx:188-189`
- **Problem:** Kolumna "Powiadomienia" wyswietla `event.notified_count ?? '-'`. Backend NIE zwraca pola `notified_count` w `EventResponse`. Zawsze pokazuje "–".
- **Naprawa:** Dodac pole `notified_count` do EventResponse (count z notification_log) lub osobny endpoint.

### ~~3.3~~ ✅ NAPRAWIONO — Brak obslugi bledu JWT wygasniecia na frontendzie
- **Plik:** `frontend/src/lib/api.ts`
- `apiFetch` sprawdza `res.status === 401` → `localStorage.removeItem('mpwik_token')` + `removeItem('mpwik_refresh_token')` + `window.location.href = '/admin/login'`.
- Działa dla dowolnego endpointu admin — wylogowuje automatycznie po wygaśnięciu tokenu (30 min).

### 3.4 Brak walidacji pustych pol adresu przy rejestracji
- **Plik:** `frontend/src/pages/Register.tsx`
- **Problem:** Mozna wyslac formularz z pustym `street_name` lub `house_number` - HTML `required` jest na inputach, ale `AddressRow` ustawia `required` na input ulicy, nie na calej grupie. Jesli uzytkownik doda drugi adres i go nie wypelni, formularz moze przejsc.
- **Naprawa:** Walidacja JS przed submitem - kazdy adres musi miec street_name i house_number.

### ~~3.5~~ ✅ NAPRAWIONO — Brak strony/widoku subskrybentow w panelu admina
- **Plik:** `frontend/src/pages/AdminSubscribers.tsx` (nowy)
- Route `/admin/subscribers` dodany w `App.tsx`. Tabela z paginacją (20/strona): e-mail, telefon, kanały, zgody RODO/nocne SMS, adresy, data rejestracji.
- Dane z `GET /api/v1/admin/subscribers?skip=&limit=`. Spinner podczas ładowania.

### ~~3.6~~ ✅ NAPRAWIONO — Brak strony logu powiadomien w panelu admina
- **Plik:** `frontend/src/pages/AdminNotifications.tsx` (nowy)
- Route `/admin/notifications` dodany w `App.tsx`. Tabela z paginacją: data, kanał, odbiorca, status (badge), zdarzenie, treść (truncate z tooltip).
- Dane z `GET /api/v1/admin/notifications?skip=&limit=`. Spinner podczas ładowania.

### ~~3.7~~ ✅ NAPRAWIONO — EventMap fallback marker w centrum Lublina
- Rozwiązane przez geocoding (pkt 2.5): `scripts/geocode_streets.py` wypełnia `street.geojson` dla 1378 ulic. Po uruchomieniu skryptu zdarzenia z `street_id` będą miały poprawne współrzędne na mapie.

### 3.8 Brak potwierdzenia przed usunieciem danych (Unsubscribe)
- Po naprawie 1.1 - dodac dialog potwierdzenia ("Czy na pewno chcesz usunac swoje dane?") przed wywolaniem DELETE.

### 3.9 Strona About - brak integracji z backendem
- **Plik:** `frontend/src/pages/About.tsx`
- Brak informacji dynamicznych (np. ilosc zdarzen, ilosc subskrybentow). To raczej nice-to-have.

### 3.10 Brak toast/powiadomienia przy bledzie logowania admin
- **Plik:** `frontend/src/pages/AdminLogin.tsx`
- Nalezy sprawdzic czy po blednym logowaniu uzytkownik dostaje czytelny komunikat.

---

## 4. DLUG TECHNICZNY

### ~~4.1~~ ✅ NAPRAWIONO — `print()` zamiast `logging` w main.py
- `print()` zastąpione `logger.info()` w lifespan (startup i shutdown).

### 4.2 SECRET_KEY z domyslna wartoscia w kodzie
- **Plik:** `backend/app/config.py:18`
- **Problem:** `SECRET_KEY: str = "change-this-to-a-random-string-minimum-32-characters-long"` - jesli ktos zapomni ustawic .env, system startuje z domyslnym kluczem. Tokeny JWT sa podpisane tym kluczem.
- **Naprawa:** Rzucic wyjatek przy starcie jesli SECRET_KEY ma wartosc domyslna i DEBUG=False.

### 4.3 CORS hardkodowany - nie uzywa CORS_ORIGINS z config
- **Plik:** `backend/app/main.py:34-39`
- **Problem:** CORS origins sa hardkodowane w kodzie. Config ma `CORS_ORIGINS` ale nie jest uzywany.
- **Naprawa:** `allow_origins=settings.CORS_ORIGINS.split(",")`.

### 4.4 Brak testow (pytest)
- **Plik:** `backend/tests/__init__.py` - pusty
- **Problem:** Zero testow jednostkowych i integracyjnych. Wymienione w backlogu PROGRESS.md, ale krytyczne przed oddaniem.

### 4.5 Brak indeksu trigram na streets (wymagany w TECH_SPEC)
- **Problem:** TECH_SPEC wymaga `idx_streets_fullname_trgm ON streets USING gin(full_name gin_trgm_ops)` + `CREATE EXTENSION pg_trgm`. Autocomplete ulic uzywa ILIKE bez indeksu trigram - wolne przy 1378 rekordach (akceptowalne), ale nie skaluje sie.
- **Naprawa:** Migracja Alembic z `CREATE EXTENSION pg_trgm` i indeksem GIN.

### 4.6 Streets autocomplete podatne na SQL Injection przez ILIKE
- **Plik:** `backend/app/routers/streets.py:29`
- **Problem:** `Street.full_name.ilike(f"%{q}%")` - chociaz SQLAlchemy parametryzuje zapytania (ORM), znaki specjalne LIKE (`%`, `_`) w `q` nie sa escapowane. Uzytkownik moze wpisac `%` zeby dostac wszystkie ulice.
- **Naprawa:** Escapowac znaki specjalne LIKE w `q` przed przekazaniem do ilike.

### 4.7 Brak migracji Alembic dla aktualizacji slownika TERYT
- Na spotkaniu szef IT sugerowal mechanizm aktualizacji ulic TERYT (pobranie XML i sprawdzenie co nowego). `import_streets.py` jest idempotentny, ale brak automatyzacji.

### 4.8 useEvents pobiera WSZYSTKIE eventy jednym requestem
- **Plik:** `frontend/src/hooks/useEvents.ts:37`
- **Problem:** `apiFetch<EventItem[]>('/events')` - pobiera wszystko, potem filtruje in-memory. Przy setkach zdarzen beda problemy z wydajnoscia. Backend ma paginacje (skip/limit) ale frontend jej nie uzywa.
- **Naprawa:** Przekazywac parametry skip/limit/filter do backendu. Backend powinien zwracac tez `total_count`.

### 4.9 Brak obslugi `source` w widoku frontendu
- **Problem:** Model `Event` ma pole `source` (multi-operator ready), ale frontend nie wyswietla zrodla zdarzenia. Gdy podlaczy sie LPEC, dyspozytor nie zobaczy kto zglosil event.
- **Naprawa:** Dodac kolumne "Zrodlo" w tabeli AdminDashboard.

### 4.10 Token wyrejestrowania wyswietlany tylko raz
- **Plik:** `frontend/src/pages/Register.tsx:101-119`
- **Problem:** Token wyswietlany jest na ekranie sukcesu po rejestracji. Jesli uzytkownik zamknie strone, nie odzyska tokenu. Brak wysylki tokenu na e-mail lub SMS.
- **Naprawa:** Wyslac token wyrejestrowania w e-mailu powitalnym / SMS potwierdzajacym rejestracje.

### 4.11 Model EventStatus zle skonfigurowany
- **Plik:** `backend/app/schemas/event.py:10`
- **Problem:** `EventStatus = Literal["zgloszona", "w_naprawie", "usunieta", "planowane_wylaczenie", "remont"]` - `planowane_wylaczenie` i `remont` to typy zdarzen (`EventType`), nie statusy. Status powinien byc: `zgloszona`, `w_naprawie`, `usunieta`. Frontend ma ten sam blad w `mockData.ts:1`.
- **Skutek:** Mozna ustawic status "remont" na awarii, co jest nielogiczne.

### 4.12 Notify przy kazdym uupdacie eventu - duplikaty powiadomien
- **Plik:** `backend/app/routers/events.py:126`
- **Problem:** `asyncio.create_task(notify_event(event.id))` jest wywolywany przy KAZDEJ aktualizacji (PUT), nawet jesli zmienia sie tylko opis. Subskrybenci dostana powiadomienie za kazdym razem.
- **Naprawa:** Powiadamiac tylko przy tworzeniu eventu i przy zmianie statusu (np. na `w_naprawie`), nie przy kazdym edicie.

### ~~4.13~~ ✅ NAPRAWIONO — Brak logowania (logging config) na poziomie aplikacji
- `logging.basicConfig(level=INFO/DEBUG, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")` dodane w `main.py` przed definicją aplikacji.
- `sqlalchemy.engine` i `sqlalchemy.pool` ustawione na `WARNING` — surowy SQL ukryty, błędy nadal widoczne.
- Poziom dynamiczny: `DEBUG` gdy `settings.DEBUG=True`, `INFO` produkcyjnie.

---

## 5. ZGODNOSC ZE SPECYFIKACJA (TECH_SPEC.md + spotkanie z szefem IT)

| Wymaganie | Status | Uwagi |
|-----------|--------|-------|
| POST /auth/login | DONE | Dziala |
| POST /auth/refresh | DONE | Zaimplementowany (pkt 1.5) |
| GET /events (paginacja) | DONE | Ale frontend nie uzywa paginacji (pkt 4.8) |
| GET /events/{id} | DONE | |
| POST /events (JWT) | DONE | |
| PUT /events/{id} (JWT) | DONE | |
| DELETE /events/{id} (JWT admin) | BRAK | Nie zaimplementowany (pkt 1.4) |
| GET /events/feed (IVR 994) | BRAK | Szef IT: "odpusccie na razie", ale warto miec (pkt 2.2) |
| GET /streets?q= autocomplete | DONE | Brak trigram index (pkt 4.5) |
| POST /subscribers | DONE | Brak unique email (pkt 1.2) |
| DELETE /subscribers/{token} | DONE backend | Frontend ZEPSUTY (pkt 1.1) |
| GET /subscribers/{token} | DONE | Frontend nie korzysta |
| GET /admin/subscribers | BRAK | (pkt 2.1) |
| GET /admin/notifications | BRAK | (pkt 2.1) |
| GET /admin/stats | BRAK | (pkt 2.1) |
| Adresy TERYT autocomplete | DONE | 1378 ulic zaimportowanych |
| Mapa - linie na ulicach | CZESCIOWO | Brak geocodingu, fallback na marker (pkt 2.5) |
| Wiele adresow na subskrybenta | DONE | |
| RODO fizyczne usuwanie | DONE backend | Frontend zepsuty (pkt 1.1) |
| Nocna cisza 22-06 | DONE | Europe/Warsaw (pkt 1.6 naprawiony) |
| SMS nocne - osobna zgoda | DONE | |
| Multi-operator (source + API key) | CZESCIOWO | Model jest, brak routera/dependency (pkt 2.3) |
| Bramka SMS (SMSEagle) | DONE | Mock + SMSEagle gateway |
| Kill-switch emaili | DONE | ENABLE_EMAIL_NOTIFICATIONS |
| Zero kosztow licencyjnych | DONE | Caly stack open-source |
| WCAG dostepnosc | CZESCIOWO | aria-labels sa, brak audytu |
| Wirtualka Oracle Linux | NIE TESTOWANE | Docker jest, brak testow na Oracle Linux |

---

## 6. PRIORYTETY NAPRAW (sugerowana kolejnosc)

### Pilne (przed demo/oddaniem):
1. **[1.1]** Naprawic Unsubscribe.tsx - RODO compliance
2. **[1.2]** Unique email + walidacja duplikatow
3. **[1.7]** Naprawic edycje zdarzen (route + ladowanie danych)
4. **[1.6]** Nocna cisza - Europe/Warsaw zamiast UTC
5. **[2.1]** Endpointy admin (subscribers, notifications, stats)
6. **[1.4]** DELETE /events/{id}
7. **[4.12]** Duplikaty powiadomien przy update

### Wazne (przed wdrozeniem u MPWiK):
8. **[1.5]** Refresh token
9. **[2.4]** Weryfikacja roli admin
10. **[2.6]** Scheduler dla queued_morning SMS
11. **[3.3]** Obsluga wygasniecia JWT na frontendzie
12. **[2.5]** Geocoding ulic (mapa)
13. **[4.3]** CORS z config
14. **[4.2]** Walidacja SECRET_KEY
15. **[2.7]** Walidacja formatu telefonu

### Nice-to-have (backlog):
16. **[2.2]** Events feed (IVR 994)
17. **[2.3]** X-API-Key dla external
18. **[4.4]** Testy pytest
19. **[4.8]** Paginacja server-side
20. **[2.8]** Rate limiting (slowapi)
