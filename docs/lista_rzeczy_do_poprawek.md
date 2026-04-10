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

### ~~3.1~~ ✅ NAPRAWIONO — Unsubscribe zły flow (patrz 1.1)
- **Plik:** `frontend/src/pages/Unsubscribe.tsx`
- Zweryfikowano w kodzie — formularz przyjmuje `unsubscribe_token`, auto-load z `?token=` w URL, `GET /subscribers/{token}` → podgląd danych, `DELETE /subscribers/{token}` → fizyczne usunięcie + redirect do `/`. Flow zgodny z RODO.

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

### ~~3.8~~ ✅ NAPRAWIONO — Brak potwierdzenia przed usunięciem danych (Unsubscribe)
- Zweryfikowano w kodzie — `Unsubscribe.tsx` implementuje 2-etapowy flow: etap 1 weryfikacja tokenu → etap 2 podgląd danych z pytaniem "Czy na pewno chcesz trwale usunąć powyższe dane?" + przyciski "Anuluj" / "Potwierdzam — usuń moje dane". Potwierdzenie istnieje.

### ~~3.11~~ ✅ NAPRAWIONO — Globalna naprawa stref czasowych (UTC → Europe/Warsaw)
- **Strategia:** UTC w bazie (SSoT), wyświetlanie w Europe/Warsaw. Brak `TZ=Europe/Warsaw` w procesie (niepewne na Windows/Docker).
- **Root cause:** Backend zwracał naive datetime BEZ `Z` (np. `"2026-04-10T14:00:00"`). JS parsuje string bez strefy jako LOKALNY — błąd wyświetlania o +2h w zależności od kontekstu.
- **Backend `schemas/event.py` (2026-04-10):** `_utc_iso()` + `@field_serializer` na `estimated_end`, `created_at`, `updated_at`, `changed_at` — wszystkie timestampy serializowane z `+00:00`, np. `"2026-04-10T14:00:00+00:00"`. JS poprawnie interpretuje jako UTC.
- **Frontend `lib/utils.ts` (2026-04-10):** `parseUTC()` (dodaje Z do stringów bez strefy), `toLocalISO()` (UTC→input), `toUTCISO()` (input→UTC ISO), `formatDate()`, `formatDateTime()` — SSoT dla wszystkich konwersji dat.
- **Zastosowane w:** `AdminEventForm.tsx` (ładowanie/zapis), `EventCard.tsx` (estimated_end), `AdminDashboard.tsx` (created_at, changed_at), `AdminSubscribers.tsx` (created_at), `AdminNotifications.tsx` (sent_at).
- **Migracja TIMESTAMP WITH TIME ZONE:** Przygotowana jako `backend/alembic/versions/20260410_timestamp_with_timezone.py` — zmienia typ kolumn na TIMESTAMPTZ. **Nie uruchomiona** — wymaga potwierdzenia. Opcjonalna: Pydantic serializer już gwarantuje poprawne Z w JSON bez tej migracji.

### 3.9 Strona About - brak integracji z backendem
- **Plik:** `frontend/src/pages/About.tsx`
- Brak informacji dynamicznych (np. ilosc zdarzen, ilosc subskrybentow). To raczej nice-to-have.

### ~~3.10~~ ✅ NAPRAWIONO — Brak toast/powiadomienia przy błędzie logowania admin
- Zweryfikowano w kodzie — `AdminLogin.tsx` linia 31: `toast({ title: 'Błąd', description: 'Nieprawidłowe dane logowania.', variant: 'destructive' })` wywoływany gdy `login()` zwraca false. Czytelny komunikat błędu istnieje.

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

### ~~4.12~~ ✅ NAPRAWIONO — Notify przy kazdym uupdacie eventu - duplikaty powiadomien
- **Pliki:** `backend/app/routers/events.py`, `backend/app/services/notification_service.py`
- **Naprawa (2026-04-10):**
  - `old_status = event.status` przechwytywane przed aktualizacją pól.
  - Warunek wywołania powiadomień: `"status" in update_data and update_data["status"] != old_status` — eliminuje duplikaty gdy status wysłany bez faktycznej zmiany wartości.
  - `notify_event(event_id, old_status=old_status)` — stary status przekazany jako argument.
  - `notify_event` wybiera szablon: `old_status is None` → nowe zdarzenie; `old_status` ustawiony → zmiana statusu.
  - Nowe szablony: `build_sms_status_change_message`, `build_email_status_change_subject/body` — *"Szanowny mieszkańcu, informujemy, że status zgłoszenia zmienił się z „X" na „Y". Szacowany czas naprawy: ..."*
  - Etykiety statusów przetłumaczone na język naturalny (`_STATUS_LABELS`, `_status_label()`).
  - **Naprawa strefy czasowej (2026-04-10):** `_estimated_end_str()` konwertuje `estimated_end` (UTC naive z PostgreSQL) do `Europe/Warsaw` przez `.replace(tzinfo=utc).astimezone(Warsaw)` przed `strftime`. Wszystkie szablony SMS/email używają tej funkcji — koniec błędu +1h/+2h w datach powiadomień.
  - **Dedykowany szablon zamknięcia (2026-04-10):** Gdy `event.status == "usunieta"`, funkcje `build_sms_status_change_message` i `build_email_status_change_body` zwracają osobny szablon bez „szacowanego czasu naprawy". SMS: *„Szanowny mieszkańcu, informujemy, że awaria na ul. [ULICA] została usunięta."* Email: krótki komunikat z podziękowaniem za cierpliwość. Temat emaila zmieniony na *„[MPWiK Lublin] Awaria usunięta — ul. [ULICA]"*.

### ~~4.15~~ ✅ NAPRAWIONO — Interaktywność mapy: Pinezki, nawigacja z kart i flyToBounds dla poligonów
- **Pliki:** `frontend/src/pages/Index.tsx`, `frontend/src/components/EventCard.tsx`, `frontend/src/components/EventMap.tsx`
- **Problem:** Brak powiązania między kartami zdarzeń a mapą — kliknięcie karty nic nie robiło. Kliknięcie pinezki nie aktualizowało stanu.
- **Naprawa (2026-04-10, rozszerzona 2026-04-10):**
  - `Index.tsx`: stan `focusedEventId` + `setFocusedEventId` — przekazany do `EventMap` (oba: read+write) i do `EventCard` (write przez `onFocus`).
  - `EventCard` odbiera `onFocus: (id: number) => void` — wywołuje przy `onClick`; `cursor-pointer hover:bg-muted/50`.
  - `EventMap.Props`: dodano `setFocusedEventId?: (id: number) => void` — każdy `<Marker>` ma `eventHandlers={{ click: () => setFocusedEventId(event.id) }}`, tak że kliknięcie pinezki również kadruję mapę.
  - `MapController`: inteligentna nawigacja zależna od typu geometrii:
    - `geojson_segment` jest `FeatureCollection` → `L.geoJSON(fc).getBounds()` + `map.flyToBounds(bounds, { padding: [50,50], duration: 1.5, maxZoom: 18 })`.
    - Punkt (`street_geojson`) lub Polyline → `map.flyTo([lat, lon], 16, { duration: 1.5 })`.
    - Centrum Lublina (fallback bez danych) → brak akcji.
  - Konwersja koordynatów GeoJSON `[lon, lat]` → Leaflet `[lat, lon]` zachowana.
  - Poprawiono pozycjonowanie markerów — teraz są obliczane na podstawie środka obszaru poligonów (centroid `L.geoJSON(fc).getBounds().getCenter()`), a nie środka całej ulicy (`street_geojson`). Priorytet: centroid FeatureCollection > `street_geojson` Point > centrum Lublina.

### ~~4.16~~ ✅ NAPRAWIONO — Lepsza stylizacja poligonów budynków na mapie
- **Plik:** `frontend/src/components/EventMap.tsx`
- **Problem:** Poligony budynków były słabo widoczne (fillOpacity: 0.5), popup wyświetlał ogólny zakres z nagłówka zdarzenia zamiast konkretnego numeru domu.
- **Naprawa (2026-04-10):**
  - `fillOpacity` zmienione z `0.5` na `0.6` — budynki wyraźniejsze, tło mapy nadal widoczne.
  - `stroke: false, weight: 0` — brak krawędzi (bez zmian — już było).
  - `fillColor` używa koloru statusu zdarzenia (czerwony/pomarańczowy/zielony/niebieski/fioletowy) — zachowana semantyka kolorów.
  - `onEachFeature`: popup każdego poligonu wyświetla `event.street_name + feature.properties.house_number` (np. "Nadbystrzycka 9") zamiast ogólnego tytułu.

### ~~4.14~~ ✅ NAPRAWIONO — Powiadomienia retroaktywne dla nowych subskrybentów
- **Pliki:** `backend/app/services/notification_service.py`, `backend/app/routers/subscribers.py`
- **Problem:** Nowy subskrybent rejestrujący się w trakcie trwającej awarii nie otrzymywał żadnego powiadomienia.
- **Naprawa (2026-04-10):**
  - Nowa funkcja `notify_new_subscriber_about_active_events(subscriber_id: int)` w `notification_service.py`.
  - Pobiera subskrybenta z adresami, następnie wszystkie zdarzenia ze statusem `"zgloszona"` lub `"w_naprawie"`.
  - Dla każdego aktywnego zdarzenia sprawdza dopasowanie adresów subskrybenta: `addr.street_id == event.street_id` + `is_in_range()`.
  - Deduplikacja po `event_id` — jedno powiadomienie nawet jeśli subskrybent ma kilka adresów na tej samej ulicy.
  - Używa szablonu „nowe zdarzenie" (`build_sms_message` / `build_email_body`) — dla subskrybenta to pierwsza informacja.
  - Router `POST /subscribers` wywołuje funkcję przez `asyncio.create_task()` zaraz po zapisie do bazy — odpowiedź HTTP 201 nie jest opóźniana.

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
| DELETE /events/{id} (JWT admin) | DONE | Zaimplementowany (pkt 1.4) |
| GET /events/feed (IVR 994) | BRAK | Szef IT: "odpusccie na razie", ale warto miec (pkt 2.2) |
| GET /streets?q= autocomplete | DONE | Brak trigram index (pkt 4.5) |
| POST /subscribers | DONE | Brak unique email (pkt 1.2) |
| DELETE /subscribers/{token} | DONE backend | Frontend ZEPSUTY (pkt 1.1) |
| GET /subscribers/{token} | DONE | Frontend nie korzysta |
| GET /admin/subscribers | DONE | Zaimplementowany (pkt 2.1) |
| GET /admin/notifications | DONE | Zaimplementowany (pkt 2.1) |
| GET /admin/stats | DONE | Zaimplementowany (pkt 2.1) |
| Adresy TERYT autocomplete | DONE | 1378 ulic zaimportowanych |
| Mapa - linie na ulicach | CZESCIOWO | Geocoding zrobiony (pkt 2.5), obrysy budynków zasilone (pkt 7.6), pełne GeoJSON linie po uruchomieniu geocode_streets.py |
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
13. ~~**[4.3]**~~ ✅ CORS z config
14. **[4.2]** Walidacja SECRET_KEY
15. **[2.7]** Walidacja formatu telefonu

### Nice-to-have (backlog):
16. **[2.2]** Events feed (IVR 994)
17. **[2.3]** X-API-Key dla external
18. **[4.4]** Testy pytest
19. **[4.8]** Paginacja server-side
20. **[2.8]** Rate limiting (slowapi)

---

## 7. NOWE PROBLEMY: GIS VS LOGIKA BIZNESOWA

> Zidentyfikowane 2026-04-09 po analizie Sesji 12 (obrysy budynków na mapie).

### ~~[7.1]~~ ✅ NAPRAWIONO — Brak synchronizacji poligonów mapy z zakresem numerów (Notification Engine mismatch)

- **Pliki:** `frontend/src/pages/AdminEventForm.tsx`
- **Naprawa (2026-04-09):** Przebudowano formularz w mechanizm 3-zakładkowy (`Tabs` shadcn/ui): „Zaznacz na mapie" / „Zakres numerów" / „Lista numerów". Wszystkie trzy tryby współdzielą `selectedBuildingIds`. Nowe helpery JS: `parseHouseNumber`, `isInRange`, `sortHouseNumbers` (odpowiedniki backendowe). Mechanizm `selectionSourceRef` zapobiega cyklicznym aktualizacjom. Zaznaczenie budynku na mapie → auto-aktualizacja pól houseFrom/houseTo i listInput. `applyRange` → filtruje buildings po zakresie → auto-podświetlenie na mapie. Wpisanie listy numerów → dopasowanie buildings → podświetlenie na mapie. houseFrom/houseTo zawsze zsynchronizowane z zaznaczeniem → silnik powiadomień dostaje spójne dane.

### ~~[7.2]~~ ✅ NAPRAWIONO — Edycja zdarzenia nie przywraca zaznaczonych budynków na mapie

- **Plik:** `frontend/src/pages/AdminEventForm.tsx`
- **Naprawa (2026-04-09):** `pendingRestoreIdsRef` przechowuje ID budynków z `geojson_segment.features[].properties.id` wczytanego zdarzenia. Po załadowaniu budynków dla ulicy (`useEffect` na `selectedStreet?.id`), IDs są aplikowane do `selectedBuildingIds` — rozwiązuje problem timingu ładowania.

### ~~[7.3]~~ ✅ NAPRAWIONO — Pola houseFrom/houseTo wymagane mimo zaznaczenia budynków na mapie

- **Plik:** `frontend/src/pages/AdminEventForm.tsx`
- **Naprawa (2026-04-09):** Pola houseFrom/houseTo przeniesione do zakładki „Zakres numerów" (opcjonalne). houseFrom/houseTo są auto-derywowane z zaznaczonych budynków gdy źródłem jest mapa lub lista. Walidacja: submit akceptuje bieżący formularz (z ulicą) LUB kolejkę — nie wymaga zakresu gdy budynki zaznaczone na mapie.

### ~~[7.4]~~ ✅ NAPRAWIONO — update_event nie ładuje relacji street → street_geojson=None w odpowiedzi PUT

- **Plik:** `backend/app/routers/events.py`
- **Naprawa (2026-04-10):** Oba `select(Event)` w `update_event` rozszerzone o `selectinload(Event.street)`. Po finalnym `event = result.scalar_one()` dodano `event.street_geojson = event.street.geojson if event.street else None`. Odpowiedź `PUT /events/{id}` teraz zawiera poprawne współrzędne ulicy.

### [7.5] Brak walidacji schematu FeatureCollection w geojson_segment

- **Plik:** `backend/app/schemas/event.py` (linia 25, 44)
- **Problem:** `geojson_segment: dict | None = None` akceptuje dowolny słownik bez walidacji struktury. Można wysłać `{"foo": "bar"}` i zostanie zapisany do bazy. Gdy silnik powiadomień (Opcja B z [7.1]) będzie czytać `features[].properties.house_number`, brak tej właściwości nie zostanie wykryty przy zapisie.
- **Naprawa:** Dodać Pydantic validator lub osobny model `GeoJsonFeatureCollection` sprawdzający `type == "FeatureCollection"` oraz `features` jako listę z `geometry` i `properties.house_number`. Alternatywnie: lekka walidacja `@field_validator` z `mode="before"`.

### ~~[7.6]~~ ✅ ZASILONO — Dane buildings istnieją w bazie

- **Plik:** `backend/app/models/building.py`, `backend/app/routers/streets.py`
- Potwierdzone przez użytkownika (2026-04-09): tabela `buildings` zawiera dane widoczne w DBeaverze. Endpoint `GET /streets/{id}/buildings` działa i zwraca obrysy budynków. Zakładka „Zaznacz na mapie" w AdminEventForm działa. Punkt zamknięty.

### ~~[7.7]~~ ✅ NAPRAWIONO — Selekcja budynków nadpisywana przez zakładkę Zakres/Lista

- **Plik:** `frontend/src/pages/AdminEventForm.tsx`
- **Problem:** `applyRange` i `handleListInputChange` wywoływały `setSelectedBuildingIds(ids)` — nowe ID zastępowały istniejący Set, kasując budynki zaznaczone np. wcześniej kliknięciem na mapie. Przełączenie do zakładki „Zakres" i zastosowanie filtra usuwało poprzednie zaznaczeenia.
- **Naprawa (2026-04-09):** Zmieniono na `setSelectedBuildingIds(prev => new Set([...prev, ...newIds]))` w obu metodach — nowe ID są DODAWANE do istniejącego stanu. Toast zmieniony z „Zaznaczono N" na „Dodano N do zaznaczenia".

### ~~[7.8]~~ ✅ NAPRAWIONO — displayLabel koszyka używał prymitywnego min/max zamiast inteligentnego formatu

- **Plik:** `frontend/src/pages/AdminEventForm.tsx`
- **Problem:** `buildDisplayLabel` przy >6 numerach zwracał `nr 1–17 (8 bud.)` — ignorował luki między numerami. Zaznaczenie budynków 1, 3, 5 oraz zakresu 16–17 wyświetlało się w karcie koszyka jako "od 1 do 17".
- **Naprawa (2026-04-09):** Dodano funkcję `formatBuildingNumbers(nums)` kompresującą ciągłe sekwencje numeryczne do zakresów, np. `[1, 3, 5, 16, 17]` → `"nr 1, 3, 5, 16–17"`, `[1,2,3,5]` → `"nr 1–3, 5"`. `buildDisplayLabel` używa jej gdy `selectedNums.length > 0`.

### ~~[7.10]~~ ✅ NAPRAWIONO — Fałszywe zakresy w podsumowaniu koszyka (formatBuildingNumbers)

- **Plik:** `frontend/src/pages/AdminEventForm.tsx`
- **Problem:** Poprzednia wersja `formatBuildingNumbers` kompresowała ciągłe sekwencje do zakresów (np. `[1,2,3]` → `"nr 1–3"`), ale kompresja mogła maskować luki — zakres "1–3" sugerował budynki 1, 2, 3, nawet gdy 2 nie było zaznaczone.
- **Naprawa (2026-04-09):** Zastąpiono całą logikę kompresji prostym listowaniem: `sortHouseNumbers(nums).join(', ')`. Koszyk zawsze pokazuje dokładną listę zaznaczonych numerów, np. "1, 3, 5, 16, 17A".

### ~~[7.11]~~ ✅ NAPRAWIONO — Tooltipy na mapie bez nazwy ulicy (tylko numer posesji)

- **Pliki:** `frontend/src/pages/AdminEventForm.tsx` (BuildingLayer), `frontend/src/components/EventMap.tsx`
- **Problem:** Tooltip po najechaniu na poligon budynku pokazywał tylko numer posesji (np. "17A"), bez kontekstu ulicy. Przy wielu ulicach na mapie trudno było stwierdzić, do której ulicy należy budynek.
- **Naprawa (2026-04-09):**
  - `BuildingLayer` w AdminEventForm: dodano prop `streetName: string`; tooltip zmieniony na `"${streetName} ${num}"` (np. "Organowa 17A"); prop przekazywany jako `streetName={selectedStreet?.full_name ?? ''}`.
  - `EventMap.tsx`: dodano `onEachFeature` do `<GeoJSON>` dla FeatureCollection; tooltip `"${event.street_name} ${num}"` dla każdego budynku; znika po zjechaniu myszką (domyślne `permanent: false`).

### ~~[7.9]~~ ✅ NAPRAWIONO — HTML5 required blokował wysyłanie koszyka (Queue Submit Blocker)

- **Plik:** `frontend/src/pages/AdminEventForm.tsx`
- **Problem:** Główny przycisk był `type="submit"` wewnątrz `<form>`. Po dodaniu ulicy do koszyka (i wyczyszczeniu roboczego formularza) kliknięcie „Zapisz i powiadom" uruchamiało walidację HTML5, która blokowała akcję z powodu pustego pola `required` (ulica). Koszyk nie mógł być wysłany.
- **Naprawa (2026-04-09):** Wydzielono `handleBulkSubmit()` jako osobną async funkcję (bez parametru event). Przycisk zmieniony na `type="button"` z `onClick={handleBulkSubmit}` — pomija walidację HTML5. `handleSubmit` na tagu `<form>` zachowany (obsługuje Enter w polach i deleguje do `handleBulkSubmit`).

### ~~[7.12]~~ ✅ NAPRAWIONO — Karty awarii i tabela dashboard wyświetlały fałszywe zakresy numerów

- **Pliki:** `frontend/src/components/EventCard.tsx`, `frontend/src/pages/AdminDashboard.tsx`
- **Problem:** `EventCard` budował zakres `house_number_from–house_number_to` bezpośrednio z pól tekstowych (np. "3–13"), ignorując faktyczne budynki zapisane w `geojson_segment.features[].properties.house_number`. Podobnie kolumna „Numery" w `AdminDashboard` używała tych samych prymitywnych pól. Zaznaczenie np. budynków 3, 5, 13 przez dyspozytora pojawiało się jako "3–13", sugerując ciągły zakres którego nie było.
- **Naprawa (2026-04-09):** Wyekstrahowano funkcje `parseHouseNumber` i `sortHouseNumbers` do `frontend/src/lib/utils.ts`. Nowa funkcja `formatEventNumbers(event)` sprawdza: jeśli `geojson_segment` jest FeatureCollection, wyciąga `house_number` z każdego feature'a, sortuje alfanumerycznie i zwraca listę po przecinku (np. "3, 5, 13"). Fallback na pola `from/to` gdy brak features. `EventCard` i `AdminDashboard` importują i używają `formatEventNumbers` zamiast własnej logiki zakresów.

### Priorytety sekcji 7 (stan po 2026-04-09):
- ✅ [7.1] Synchronizacja GIS — NAPRAWIONO
- ✅ [7.2] Przywracanie zaznaczenia przy edycji — NAPRAWIONO
- ✅ [7.3] Wymagalność pól houseFrom/houseTo — NAPRAWIONO
- ✅ [7.4] Naprawa update_event brakujący selectinload — NAPRAWIONO
- 🔲 [7.5] Walidacja schematu FeatureCollection — nice-to-have
- ✅ [7.6] Dane buildings zasilone — potwierdzone w bazie (DBeaver) — ZASILONO
- ✅ [7.7] Selekcja addytywna (zakres/lista) — NAPRAWIONO
- ✅ [7.8] formatBuildingNumbers (inteligentny format koszyka) — NAPRAWIONO
- ✅ [7.9] Queue Submit Blocker (type=button) — NAPRAWIONO
- ✅ [7.10] Precyzyjna lista numerów (bez fałszywych zakresów) — NAPRAWIONO
- ✅ [7.11] Tooltipy z pełnym adresem (AdminEventForm + EventMap) — NAPRAWIONO
- ✅ [7.12] Precyzyjna lista numerów w kartach awarii i tabeli dashboard — NAPRAWIONO

---

## 8. PLAN KOLEJNYCH KROKÓW (stan po 2026-04-09)

> Sugerowana kolejność realizacji — od najłatwiejszego z największym efektem do złożonych.

### Priorytet 1 — Quick wins (każdy to 1–5 linii kodu, można zrobić jednym commitem):

1. ~~**[7.4]**~~ ✅ NAPRAWIONO **Naprawa `update_event` — brakujący `selectinload(Event.street)`**
   - Plik: `backend/app/routers/events.py`
   - Oba `select(Event)` w `update_event` rozszerzone o `selectinload(Event.street)`. Po `event = result.scalar_one()` dodano `event.street_geojson = event.street.geojson if event.street else None`.
   - Efekt: Mapa po edycji zdarzenia renderuje marker/linię poprawnie.

2. ~~**[4.12]**~~ ✅ NAPRAWIONO **Powiadamiaj tylko przy tworzeniu i zmianie statusu (nie każdy PUT)**
   - Plik: `backend/app/routers/events.py`
   - `notify_event` wywoływany tylko gdy `"status" in update_data and update_data["status"] != old_status`.
   - Efekt: Subskrybenci nie dostają wielokrotnych duplikatów przy każdym PUT.

3. ~~**[4.3]**~~ ✅ NAPRAWIONO **CORS z `settings.CORS_ORIGINS`**
   - Plik: `backend/app/main.py`
   - Zmiana: `allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")]` — strip() usuwa białe znaki
   - Efekt: Konfiguracja CORS z `.env` bez zmiany kodu.

4. ~~**[4.11]**~~ ✅ NAPRAWIONO **Naprawić `EventStatus` — usunąć `planowane_wylaczenie`/`remont`**
   - Plik: `backend/app/schemas/event.py`
   - Zmiana: `EventStatus = Literal["zgloszona", "w_naprawie", "usunieta"]`
   - Efekt: Koniec semantycznego błędu — statusy != typy zdarzeń.

### Priorytet 2 — Ważne przed wdrożeniem:

5. **[4.2] Walidacja `SECRET_KEY` przy starcie**
   - Plik: `backend/app/config.py`
   - Zmiana: Rzucić `ValueError` gdy `SECRET_KEY == "change-this..."` i `DEBUG=False`
   - Efekt: System nie uruchomi się produkcyjnie z domyślnym kluczem.

6. **[2.2] Endpoint `GET /api/v1/events/feed` (IVR 994)**
   - Plik: nowy endpoint w `backend/app/routers/events.py`
   - Zwraca `text/plain` z listą aktywnych awarii (status != 'usunieta')
   - Efekt: Spełnienie wymagania biznesowego MPWiK — automat 994.

7. **[3.2] Pole `notified_count` w `EventResponse`**
   - Plik: `backend/app/routers/events.py` + `backend/app/schemas/event.py`
   - Zmiana: subquery COUNT z `notification_log` per event lub osobny endpoint
   - Efekt: Kolumna "Powiadomienia" w AdminDashboard przestaje pokazywać "–".

### Priorytet 3 — Backlog techniczny:

8. **[4.5] Indeks trigram (pg_trgm) dla autocomplete ulic**
   - Migracja Alembic: `CREATE EXTENSION pg_trgm` + GIN index
   - Efekt: Autocomplete skaluje się powyżej 1378 ulic (przyszłe rozszerzenia).

9. **[2.3] X-API-Key dla zewnętrznych operatorów (LPEC, ZDiM)**
   - Nowy router `routers/external.py` + dependency walidujący `ApiKey` z bazy
   - Efekt: Multi-operator ready — wdrożenie miejskiego hubu.

10. **[4.4] Testy jednostkowe i integracyjne (pytest)**
    - Katalog `backend/tests/` jest pusty — krytyczne przed oddaniem MPWiK
    - Priorytety: auth flow, subscribers CRUD, notification matching logic.
