# Lista rzeczy do poprawek - Audyt techniczny Event Hub Lublin

Data audytu: 2026-04-03

---

## 0a. ✅ ZROBIONE — Wizualizacja budynków na mapie + edycja adresu przez dyspozytora (2026-04-16)

- **Pliki backend:** `backend/app/models/building.py` (kolumna `geom` GeoAlchemy2), `backend/app/schemas/building.py` (`BuildingBboxResponse`, `BuildingUpdate`), `backend/app/routers/buildings.py` (nowy router), `backend/app/main.py` (rejestracja routera), `backend/app/dependencies.py` (`get_current_dispatcher_or_admin`), `backend/alembic/versions/20260416_add_geom_to_buildings.py` (migracja GIST), `backend/requirements.txt` (`geoalchemy2>=0.14.0`).
- **Pliki frontend:** `frontend/src/hooks/useBuildings.ts`, `frontend/src/components/AdminMapView.tsx`, `frontend/src/components/BuildingAddressModal.tsx`, `frontend/src/pages/AdminDashboard.tsx` (zakładka Mapa budynków), `frontend/src/components/EventMap.tsx` (`pointToLayer` dla budynków-punktów).
- **Backend — BBOX query:** migracja `20260416_geom_buildings` dodaje kolumnę `geom geometry(Geometry,4326)` + indeks GIST wypełniony z JSONB przez `ST_GeomFromGeoJSON`. Zapytanie `GET /api/v1/buildings?min_lat=...` używa `ST_Intersects` + `ST_MakeEnvelope` — sequential scan na 51k rekordach zastąpiony index scan GIST.
- **Frontend — mapa admina:** `AdminDashboard` ma nową zakładkę „Mapa budynków" z komponentem `AdminMapView`. Zielone poligony = mają adres, czerwone = brak adresu. Kliknięcie w czerwony poligon/punkt otwiera `BuildingAddressModal` (autocomplete ulic + numer). Po zapisie mapa odświeża się automatycznie. Budynki ładowane tylko przy zoom ≥ 15 (hard limit po stronie frontendu i backendu 500 rekordów/zapytanie).
- **Frontend — mapa publiczna:** `EventMap.tsx` rozszerzony o `pointToLayer` — budynki-punkty (`geom_type='point'`) w FeatureCollection awarii renderowane jako kolorowy `CircleMarker` zamiast domyślnego markera Leaflet.
- **PATCH /api/v1/buildings/{id}:** wymaga roli `dispatcher` lub `admin` (RBAC przez `get_current_dispatcher_or_admin`).
- **Wymagana migracja:** `cd backend && alembic upgrade head` (uzupełnia kolumnę `geom` + tworzy indeks GIST na ~51k rekordach).

## 0. Poprawa jakości danych GIS - obsługa budynków narożnych i buforowanie

### ~~[0.3]~~ ✅ NAPRAWIONO — Scenariusz 4: uzupełnienie braków PZGIK węzłami OSM PBF (2026-04-15)

- **Pliki:** `backend/scripts/import_osm_supplement.py` (nowy), `backend/alembic/versions/20260415_add_osm_columns_to_buildings.py` (migracja), `backend/app/models/building.py`, `backend/scripts/import_buildings.py` (CREATE TABLE).
- **Cel:** po głównym imporcie (BDOT10k + PRG → 36 678 adresów) dołożyć brakujące adresy z pliku `lubelskie-260413.osm.pbf`. OSM zawiera m.in. `node` z `addr:housenumber` (klatki w blokach, adresy bez obrysu), których PRG nie eksportuje.
- **Schema:** migracja `20260415_osm_cols` dodaje do `buildings` kolumny `osm_way_id BIGINT`, `osm_node_id BIGINT`, `geom_type VARCHAR(10) DEFAULT 'polygon'`, `geojson_point JSONB`. `fid` jest nullowalne (adresy OSM nie mają BDOT fid). CREATE TABLE w `import_buildings.py` został równolegle rozszerzony o te kolumny, żeby świeży import od zera dawał spójny schemat.
- **Algorytm skryptu:**
  1. Streamingowy parser `osmium.FileProcessor(...).with_locations()` — na Windows działa z pyosmium ≥ 4.x bez kompilacji.
  2. Zbieramy tylko obiekty z `addr:city=Lublin` + `addr:housenumber` + `addr:street`; deduplikacja w pamięci po (nazwa_ulicy, numer) — `way` (poligon) ma pierwszeństwo nad `node` (punkt).
  3. Z bazy ładujemy set istniejących `(street_norm, number_norm)` i słownik `street_norm → street_id`. Normalizacja: iteracyjne zdejmowanie prefiksów `ul./al./pl./os./aleja...` + `casefold()`.
  4. Filtrujemy adresy OSM już obecne w bazie; resztę wstawiamy partiami po 500:
     - `way`  → `geom_type='polygon'`, `geojson_polygon`, `osm_way_id`
     - `node` → `geom_type='point'`, `geojson_point`, `osm_node_id`
  5. `full_address` budowane jako `"ul. {street} {number}"`, `street_id` z lookupu (NULL gdy brak dopasowania — rekord wciąż przydatny do wyszukiwania tekstowego w panelu admina).
- **Uruchomienie:** `cd backend && python -m scripts.import_osm_supplement --pbf C:/Users/rafal/Downloads/lubelskie-260413.osm.pbf`. Skrypt jest idempotentny — każde kolejne uruchomienie dokłada tylko adresy, których jeszcze nie ma (nie duplikuje).
- **Wynik w bazie (2026-04-15, po wykonaniu):**
  - łącznie: **51 643** budynki (było 46 596)
  - z `full_address`: **41 725** (było 36 678, **+5 047 adresów**)
  - bez adresu: 9 918 (bez zmian — OSM dokłada tylko adresy, nie zmienia obiektów technicznych BDOT10k)
  - `geom_type='polygon'`: 48 973 | `geom_type='point'`: 2 670
  - `osm_way_id IS NOT NULL`: 2 377 | `osm_node_id IS NOT NULL`: 2 670
  - adresy OSM bez dopasowanego `street_id`: 885 (ulica spoza `streets` — wyszukiwanie tekstowe działa, ale subskrypcje po `street_id` ich nie znajdą)
- **Zidentyfikowany kolejny problem (do przyszłego zadania, NIE w tym PR):** część poligonów BDOT10k widocznych na Geoportalu nie ma adresu ani w PRG, ani w OSM — np. `Muzyczna 1` (Piekarnia Różana, pokazywana przez Google/Targeo). Pełna analiza przypadku + opcje rozwiązania (A–E) w `docs/mozliwosci.md` → sekcja „Adresy widoczne na Geoportalu, ale bez obrysu + adresu w bazie". Rekomendacja: kombinacja C + E (akceptacja luki + ręczny fallback w panelu admina przez dyspozytora, gdy zgłosi brak).
- **Dalsze kroki (frontend, poza zakresem tego zadania):** autocomplete w panelu admina + render w Leaflet — poligon dla `geom_type='polygon'`, marker dla `geom_type='point'`. Zgodnie z sekcją „Widok w panelu admina" w `docs/mozliwosci.md`.

### ~~[0.2]~~ ✅ NAPRAWIONO — OSM supplement dla adresów brakujących w PRG (2026-04-13)

- **Pliki:** `backend/scripts/import_buildings.py` (funkcja `append_osm_buildings`), `backend/data/lublin_budynki.geojson`
- **Problem (regresja zgłoszona):** Panel Dyspozytora → "Brak dopasowań w obrysach" dla `Matejki 7`. Również `Matejki 2`. Tych numerów **nie ma w pliku PRG/GUGiK** `adresy_surowe.geojson` (są tylko nieparzyste 1, 3, 9, ... i parzyste od 10), więc żaden spatial join BDOT10k×PRG nie mógł ich wykryć.
- **Źródło rozwiązania:** plik `backend/data/lublin_budynki.geojson` (z OSM) ma 23 219 features z **bezpośrednimi tagami** `street` + `house_number` + polygon. OSM zawiera m.in. `Matejki 2, 7, 10, 12, 13, 20b` — czyli dokładnie te, których brakuje w PRG.
- **Naprawa:** dodano funkcję `append_osm_buildings()` do `import_buildings.py`: po zakończonym spatial join (KROK 1+2) skrypt czyta OSM GeoJSON i dopisuje rekordy dla par `(street, house_number)`, których jeszcze nie ma w bazie. `street_id` przez lookup po `streets.name`/`full_name`. `id_budynku` przyjmuje format `osm:way:{osm_id}`.
- **Weryfikacja API:** `GET /api/v1/streets/1630/buildings` (Matejki) zwraca **64 rekordów**; `house_number='2'` → 1 Polygon OSM, `house_number='7'` → 1 Polygon OSM. Format GeoJSON poprawny (nie HEX — tabela używa JSONB, nie PostGIS `geometry`, więc `ST_AsGeoJSON` nie jest potrzebne; API zwraca dict bezpośrednio przez Pydantic `geojson_polygon: dict | None`).
- **Efekt w bazie:** 65 406 → **68 677 rekordów**, **wszystkie z `geojson_polygon`** (0 rekordów bez geometrii). 3 271 budynków dopisanych z OSM.
- **Dalszy brak:** `Matejki 4, 5, 6` nie istnieją w żadnym z plików źródłowych (PRG ani OSM) — to luka w obu dostępnych datasetach, nie problem skryptu. Do wyjaśnienia z GUGiK / OSM community.

### ~~[0.1]~~ ✅ NAPRAWIONO — Many-to-one spatial join + bufor 10 m (2026-04-13)

- **Pliki:** `backend/scripts/import_buildings.py`, tabela `buildings`
- **Problem:** poprzednia logika `import_buildings.py` robiła `drop_duplicates(subset=['fid'], keep='first')` — budynek narożny z 2+ punktami adresowymi dostawał tylko **jeden** rekord (pierwszy adres). Przykład: budynek na rogu Matejki/Kunickiego 132 → zapisany tylko jako `Kunickiego 132`, brak rekordu `Matejki 7`. Dodatkowo `fid UNIQUE` na tabeli uniemożliwiał wiele rekordów per poligon. Wiele adresów z PRG leżało 2-10 m od obrysu BDOT10k (przesunięcie geodezyjne) i wypadało z `intersects`.
- **Naprawa:**
  1. Usunięto `UNIQUE` z `fid` + dodano indeks non-unique.
  2. Usunięto `ON CONFLICT (fid)` z upsertu — tabela jest `DROP TABLE` + `CREATE TABLE` przy każdym re-imporcie, więc wystarczy czysty `INSERT`.
  3. **Bufor 10 m**: poligony budynków są buforowane w `EPSG:2180` (PUWG 1992 metryczne) przed `sjoin(intersects)`. Oryginalna geometria jest zachowana w `_orig_geom` i przywracana po joinnie.
  4. **Many-to-one**: brak `drop_duplicates` po `fid` — każda para (budynek, adres) daje osobny rekord.
  5. KROK 2 (rescue `sjoin_nearest ≤15 m`) uruchamia się tylko dla fid, które w KROK 1 nie dostały **żadnego** matchu (zachowuje stare zachowanie dla budynków całkowicie odseparowanych).
- **Efekt:** 46 596 → **65 406 rekordów** w tabeli `buildings`, adresów z **36 678 → 55 488** (+18 810 adresów odzyskanych dzięki buforowi i many-to-one). **13 581 budynków narożnych** (jeden `id_budynku` → wiele różnych `full_address`). Puste ulice: 178 → 176.
- **Ograniczenie zewnętrzne (nie błąd skryptu):** część adresów (np. Matejki 2, 4, 5, 6, 7) **nie istnieje w pliku źródłowym PRG/GUGiK** `adresy_surowe.geojson` — w nim lista dla Matejki zaczyna się od 1, 3, 9, 10, 14, 14a, 15... Brak tych numerów = luka w danych GUGiK, do wyjaśnienia z dostawcą danych. Skrypt robi maximum tego, co pozwalają mu dane źródłowe.

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

### ~~3.2~~ ✅ NAPRAWIONO — Brak informacji o wyslanych powiadomieniach w dashboard
- **Plik:** `frontend/src/pages/AdminDashboard.tsx:188-189`
- **Problem:** Kolumna "Powiadomienia" wyswietla `event.notified_count ?? '-'`. Backend NIE zwraca pola `notified_count` w `EventResponse`. Zawsze pokazuje "–".
- **Naprawa:** Dodac pole `notified_count` do EventResponse (count z notification_log) lub osobny endpoint.

### ~~3.3~~ ✅ NAPRAWIONO — Brak obslugi bledu JWT wygasniecia na frontendzie
- **Plik:** `frontend/src/lib/api.ts`
- `apiFetch` sprawdza `res.status === 401` → `localStorage.removeItem('mpwik_token')` + `removeItem('mpwik_refresh_token')` + `window.location.href = '/admin/login'`.
- Działa dla dowolnego endpointu admin — wylogowuje automatycznie po wygaśnięciu tokenu (30 min).

### ~~3.4~~ ✅ NAPRAWIONO - Brak walidacji pustych pol adresu przy rejestracji
- **Plik:** `frontend/src/pages/Register.tsx`
- **Problem:** Mozna wyslac formularz z pustym `street_name` lub `house_number` - HTML `required` jest na inputach, ale `AddressRow` ustawia `required` na input ulicy, nie na calej grupie. Jesli uzytkownik doda drugi adres i go nie wypelni, formularz moze przejsc.
- **Naprawa (2026-04-15):** Walidacja JS przed submitem — `addresses.find(a => !a.street_name.trim() || !a.house_number.trim())` z toastem "Każdy adres musi mieć podaną ulicę i numer budynku."

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

### ~~4.9~~ ✅ NAPRAWIONO — Brak obslugi `source` w widoku frontendu
- **Problem:** Model `Event` ma pole `source` (multi-operator ready), ale frontend nie wyswietla zrodla zdarzenia. Gdy podlaczy sie LPEC, dyspozytor nie zobaczy kto zglosil event.
- **Naprawa (2026-04-15):** Dodano kolumnę „Źródło" w tabeli `AdminDashboard.tsx` — wyświetla `event.source` (domyślnie `'mpwik'`). Kolumna pojawia się między „Status" a „Powiadomienia". Wszystkie `colSpan` zaktualizowane z 9 → 10.

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
  - ~~Używa szablonu „nowe zdarzenie" (`build_sms_message` / `build_email_body`) — dla subskrybenta to pierwsza informacja.~~ → Patrz [4.17].
  - Router `POST /subscribers` wywołuje funkcję przez `asyncio.create_task()` zaraz po zapisie do bazy — odpowiedź HTTP 201 nie jest opóźniana.

### ~~4.17~~ ✅ NAPRAWIONO — Brak aktualnego statusu w powiadomieniach retroaktywnych
- **Pliki:** `backend/app/services/notification_service.py`
- **Problem:** Nowy subskrybent otrzymywał powiadomienie o trwającej awarii (`notify_new_subscriber_about_active_events`), ale wiadomość nie informowała o aktualnym statusie (np. „w naprawie"). Subskrybent nie wiedział, czy awaria jest dopiero zgłoszona czy już w trakcie naprawy.
- **Naprawa (2026-04-10):**
  - Nowe funkcje szablonów: `build_sms_retroactive_message(event)` i `build_email_retroactive_body(event)`.
  - SMS: *„MPWiK Lublin: Awaria — ul. [ULICA] nr X. Aktualny status: w naprawie. Szacowany czas naprawy: .... Przepraszamy za utrudnienia."*
  - Email: zdanie *„trwa [typ zdarzenia]"* zamiast *„wystąpiła"* + dodatkowa linia *„Aktualny status: [etykieta]."* — czytelne rozróżnienie między „nową awarią" a „awarią w trakcie".
  - Statusy przetłumaczone przez `_status_label()`: `w_naprawie` → *„w naprawie"*, `zgloszona` → *„zgłoszona"*.
  - `notify_new_subscriber_about_active_events` podmienione na nowe szablony.

### ~~4.18~~ ✅ NAPRAWIONO — DELETE /events/{id} nie wysyłał powiadomienia o usunięciu awarii
- **Pliki:** `backend/app/routers/events.py`, `backend/app/models/notification.py`, `backend/app/models/event.py`, `backend/alembic/versions/20260410_notification_log_event_fk_set_null.py` (nowy)
- **Problem:** Kliknięcie ikony kosza w AdminDashboard usuwało zdarzenie bez wysłania subskrybentom powiadomienia o zamknięciu awarii. Subskrybenci nie wiedzieli, że woda wróciła. Dodatkowo — FK `notification_log.event_id → events(id)` nie miała `ON DELETE SET NULL`, więc usunięcie zdarzenia posiadającego logi powiadomień rzucało błąd FK constraint violation (istniejący bug).
- **Naprawa (2026-04-10):**
  - `notification_log.event_id` FK zmieniona na `ForeignKey("events.id", ondelete="SET NULL")`.
  - `Event.notifications` relationship: dodano `passive_deletes=True` — SQLAlchemy deleguje SET NULL do PostgreSQL (brak zbędnych SELECT przed DELETE).
  - Nowa migracja Alembic `20260410_notif_fk` (rev `20260410_notif_fk`): `DROP CONSTRAINT + CREATE FOREIGN KEY ... ON DELETE SET NULL`.
  - Endpoint `DELETE /events/{id}` — nowa sekwencja: (1) ustaw `event.status = "usunieta"`, commituj; (2) `await notify_event(event_id, old_status=old_status)` **synchronicznie** (wysyła SMS/email z szablonem „awaria usunięta"); (3) ponownie załaduj event z bazy; (4) `db.delete()` + commituj. Subskrybenci otrzymują SMS: *„Szanowny mieszkańcu, informujemy, że awaria na ul. [ULICA] została usunięta."*

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

### ~~[7.6]~~ ✅ NAPRAWIONO — Dane buildings zasilone + migracja na PostGIS

- **Plik:** `backend/app/models/building.py`, `backend/app/routers/streets.py`, `docker-compose.yml`
- Potwierdzone przez użytkownika (2026-04-09): tabela `buildings` zawiera dane widoczne w DBeaverze. Endpoint `GET /streets/{id}/buildings` działa i zwraca obrysy budynków. Zakładka „Zaznacz na mapie" w AdminEventForm działa.
- **Aktualizacja 2026-04-13:** Infrastruktura zmigrowana na obraz `postgis/postgis:16-3.4-alpine` (wcześniej `postgres:16-alpine`). Rozszerzenie `postgis` włączone (`CREATE EXTENSION postgis` — v3.4, GEOS/PROJ). Pełny re-import: `scripts/import_streets.py` + `scripts/import_buildings.py` (spatial join KROK1 intersects + KROK2 sjoin_nearest ≤15 m, EPSG:2180). Wynik: **46 596 budynków** (36 678 z adresem, 9 918 bezadresowych). Punkt zamknięty.
- **Aktualizacja 2026-04-13 (ulice — pełne pokrycie TERYT):** Plik `streets_lublin__final.geojson` (spatial join OSM × TERYT) zawierał tylko 1333/1378 ulic — brakowało 45 obiektów typu `pl.`, `skwer`, `park`, `inne` oraz 1 `ul.` (Wandy Papiewskiej), których OSM nie mapuje jako `highway`. Zmodyfikowano `scripts/import_streets.py`: w trybie GeoJSON funkcja `_supplement_from_teryt()` uzupełnia brakujące SYM_UL z `ULIC_29-03-2026.xml` jako rekordy z `geojson = NULL`. Dodano też post-import normalizację JSONB `'null'` → SQL `NULL` (SQLAlchemy domyślnie zapisywał Python `None` jako JSONB literal `'null'`, przez co `geocode_streets.py` z filtrem `Street.geojson.is_(None)` ich nie widział).
- **Aktualizacja 2026-04-13 (geokodowanie brakujących 45):** Uruchomiono `scripts/geocode_streets.py` (Nominatim, delay 1.2 s). Zgeokodowano **39/45**; 6 nieznalezionych przez Nominatim (`Park Rury im. urbanisty Romualda Dylewskiego`, `Plac Króla Władysława Łokietka`, `Plac Obrońców Lublina`, `Plac im. Marii Curie-Skłodowskiej`, `Skwer arch. T. Witkowskiego`, `ul. Wandy Papiewskiej`) — to bardzo nowe lub lokalnie niemapowane obiekty OSM. Dodatkowo SQL `UPDATE buildings SET street_id = s.id FROM streets s WHERE b.street_id IS NULL AND b.street_name = s.name/full_name` — **podpiął 33 budynki** do nowo zaimportowanych ulic. **Stan końcowy:** 1378 ulic (6 bez geom), **46 596 budynków** (9918 bez `street_id` — to dokładnie liczba "bezadresowych" z PRG, nie problem brakujących ulic). ✅ Import + geokodowanie zamknięte.

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

---

## 8. CLEANUP & OPTYMALIZACJA (Wykonano 2026-04-11)

### Struktura plików

- **Usunięto `frontend/bun.lock` i `frontend/bun.lockb`** — projekt używa npm (jest `package-lock.json`). Bun był pozostałością po inicjalizacji projektu — powodował confusion przy `npm install`.
- **Przeniesiono `lublin_budynki.geojson` → `backend/data/`** (~13 MB, surowe dane OSM). Zaktualizowano domyślną ścieżkę w `backend/scripts/import_buildings.py`.
- **Przeniesiono `lublin_budynki_final.geojson` → `backend/data/`** (~16 MB, dane po spatial join). Zaktualizowano `DEFAULT_FILE` w `import_buildings.py`.
- **Przeniesiono `users.json` → `backend/data/`** — testowe dane subskrybentów dev, nie powinny leżeć w root.
- **Usunięto `create-structure.ps1`** z root — 27 KB skryptu PowerShell do jednorazowego tworzenia struktury projektu, zbędny po inicjalizacji.
- **Przeniesiono `docs/pobierz_budynki_lublin.py` → `backend/scripts/`** — skrypt pobrania geometrii budynków z OSM, logicznie należy obok `import_buildings.py`.
- **Przeniesiono `docs/spatial_join_budynki.py` → `backend/scripts/`** — skrypt spatial join. Zaktualizowano ścieżki `OUTPUT_FILE` w obu skryptach (teraz wskazują na `backend/data/`).

### Hooki Claude Code

- **Dodano hook PostToolUse dla TypeScript** — po każdej edycji pliku w `frontend/src/**/*.tsx` lub `*.ts` automatycznie uruchamia `npx tsc --noEmit`. Zapobiega produkowaniu kodu z błędami typowania.

### Martwy kod (Dead Code)

- **Usunięto `frontend/src/App.css`** — boilerplate z szablonu Vite (animacje logo, selektory `.card`, `.read-the-docs`). Plik nie był nigdzie importowany.
- **Usunięto `frontend/src/components/NavLink.tsx`** — wrapper na `react-router-dom NavLink` nie był importowany przez żaden komponent ani stronę.
- **Usunięto `export const mockEvents: EventItem[] = []`** z `frontend/src/data/mockData.ts` — pusta tablica, nigdzie nie używana, pozostałość po etapie mockowania danych.
- **Usunięto zombie code z `backend/app/main.py`** — zakomentowany blok `# TODO: Include remaining routers` z martwym importem `routers/external` (router nigdy nie powstał).

---

## 9. UX PUBLICZNEJ STRONY GŁÓWNEJ

- ✅ Dodanie wyszukiwarki lokalizacji "Hero Search" — sekcja hero z gradientowym tłem, centralny pasek wyszukiwania filtrujący aktywne awarie po nazwie ulicy. Komunikat sukcesu (zielony) gdy brak awarii w podanej lokalizacji.
- ✅ Zmiana layoutu na Sticky Map (rozwiązanie problemu ucinania mapy przy scrollowaniu) — układ side-by-side (lista awarii po lewej, sticky mapa po prawej na desktop). Na mobile mapa nad listą z h-[400px]. `EventMap` zmieniony na `h-full` aby wypełniał kontener.
- ✅ [HOTFIX] Naprawa WSOD (TypeError: Cannot read properties of undefined reading 'features') przy renderowaniu zdarzeń bez `geojson_segment` — dodano `Array.isArray(features)` guard w `formatEventNumbers()` (`utils.ts`) oraz type-guard helper `isValidFeatureCollection()` w `EventMap.tsx` eliminujący 3 niebezpieczne castowania.
- ✅ Naprawa logicznego błędu w wyszukiwarce na stronie głównej (case-insensitive fuzzy search) — `filteredEvents` w `Index.tsx` filtruje teraz pełny zbiór `activeEvents` (a nie spaginowany `events`), z normalizacją `trim().toLowerCase()` i `.includes()`. Dzięki temu wpisanie „głęb" znajduje awarię „Głęboka" niezależnie od strony paginacji.
- ✅ Dodanie automatycznego centrowania mapy i płynnego najeżdżania (Fly-To) na wyszukiwany adres — `Index.tsx` ustawia `focusedEventId` na pierwszy wynik wyszukiwania (`useEffect` na `submittedQuery` + `filteredEvents`); istniejący `MapController` w `EventMap.tsx` wykonuje `flyToBounds` (dla `FeatureCollection` budynków) lub `flyTo([lat,lng], 16)` (dla `Point`).
- ✅ Rozbudowa wyszukiwarki awarii o obsługę numerów budynków (multi-term search logic) — `Index.tsx`: `searchableText` łączy `street_name` z `formatEventNumbers(event)`, a zapytanie dzielone jest na słowa (`split(/\s+/)`) i sprawdzane przez `.every(...includes)`. Wpisanie „Przeskok 18", „18 Przeskok" lub samego „18" zwraca poprawne dopasowanie.
- ✅ Nowe, customowe znaczniki na mapie (`L.divIcon` z kroplą wody) — `EventMap.tsx`: zastąpiono płaską kropkę okrągłą białą tarczą z kolorową obwódką (kolor wg statusu), inline SVG ikoną kropli wody i trójkątnym ogonem CSS celującym ostrzem w punkt awarii (`iconAnchor: [16, 40]`). Inspiracja: MPWiK Wrocław.

---

## 10. PODSUMOWANIE PRAC (12.04.2026)

* Ostateczne rozwiązanie problemu z CORS i wylogowywaniem dyspozytorów (FastAPI + Vite Proxy).
* Naprawa krytycznego błędu mapy (WSOD) przy braku danych z Leaflet.
* Zastąpienie Hero Search inteligentnym Autocomplete TERYT na froncie.
* Zasilenie dashboardu dyspozytora realnym licznikiem wysłanych powiadomień.
* Dodano kolumnę Źródło w panelu admina (multi-operator ready).
* Uelastyczniono format telefonu podczas rejestracji (akceptacja spacji z czyszczeniem JS).
* Skorygowano dropdown statusów awarii (tylko: Zgłoszona, W naprawie, Usunięta).
* Rozbudowano tabele Admina o paski wyszukiwania, selektory kanałów i dynamiczne liczniki rekordów.
* Wdrożono twardą normalizację numerów telefonów na backendzie (automatyczne dodawanie prefiksu +48 dla 9-cyfrowych numerów), aby zapobiec duplikatom w bazie i błędom bramki SMS.
* Naprawiono błąd "White Screen of Death" przy rejestracji subskrybenta, dodając poprawne parsowanie tablicowych błędów walidacji Pydantic (HTTP 422) wyświetlanych w Toastach.
* Dodano przyciski nawigacyjne (Powrót do strony głównej / Zarejestruj kolejny adres) na ekranie sukcesu subskrybenta, zapobiegające ślepemu zaułkowi UX.
* Wdrożono zaawansowany system filtrowania w panelach Subskrybentów (ulica, kanał, zgoda nocna) i Logów Powiadomień (kanał, status, okres) wraz z licznikami statystyk i wskaźnikiem skuteczności wysyłki w czasie rzeczywistym.

---

## 11. ZMIANY BIZNESOWE I UX (13.04.2026)

> Uwaga: numeracja przesunięta na 11, ponieważ sekcja 10 jest już zajęta przez „Podsumowanie prac (12.04.2026)".

- ✅ Dodano `start_time` do modelu zdarzeń i obsługę w UI (zakresy „od-do" dla planowanych wyłączeń) — nowa kolumna `events.start_time` (`DateTime(timezone=True)`, nullable), migracja `1f213e3939ab`, pola w `EventBase`/`EventUpdate`/`EventResponse` (serializator UTC), warunkowy input `datetime-local` w `AdminEventForm` (widoczny + wymagany dla `planowane_wylaczenie`), `EventCard` renderuje „Planowane: [start] – [koniec]" gdy oba pola obecne, w przeciwnym razie zachowuje poprzedni format „Szacowane zakończenie".
- ✅ Ujednolicono kolory poligonów na mapie z kolorami pinezek (oparte na typie zdarzenia) — `EventMap.tsx`: `<GeoJSON>` style używa teraz `TYPE_COLORS`/`TYPE_FILL_COLORS` (`color: #DC2626 + fillColor: #EF4444` dla awarii, `#2563EB + #3B82F6` dla planowanych, `#D97706 + #F59E0B` dla remontów). Dodano widoczny obrys (`stroke: true, weight: 1.5`). `STATUS_COLORS` zostaje jako fallback. Polygon i pinezka są wizualnie spójne.
- ✅ Dodano pływającą legendę objaśniającą kolory na mapie publicznej — komponent `MapLegend` (white/95 + backdrop-blur, shadow-md, rounded-lg, border) pozycjonowany `absolute bottom-4 right-4 z-[1000]`, `pointer-events-none` aby nie blokował interakcji z mapą. `MapContainer` opakowany w `relative w-full h-full`.
- ✅ Dynamiczne pinezki Leaflet na mapie (różne ikony i kolory dla Awarii oraz Planowanych wyłączeń) — `EventMap.tsx`: `makeIcon(event_type)` zastąpiło `makeIcon(color)`. Mapy `ICON_SVGS` i `TYPE_COLORS` per typ: `awaria` → czerwona ramka + ogon (`#DC2626`) i ikona `TriangleAlert`, `planowane_wylaczenie` → niebieski (`#2563EB`) + `CalendarClock`, `remont` → bursztynowy (`#D97706`) + `Wrench`. Spójne wizualnie z `EventCard`.
- ✅ Zróżnicowano kolorystykę i ikony kart w zależności od typu zdarzenia (Awaria = czerwony, Planowane = niebieski) — `EventCard.tsx`: `typeStyles` mapuje `event_type` na klasy Tailwind (`awaria` → `text-red-600/700` + `TriangleAlert`, `planowane_wylaczenie` → `text-blue-600/700` + `CalendarClock`, `remont` → `text-amber-600/700` + `Wrench`). `StatusBadge` pozostawiony bez zmian — już używa unikalnych kolorów per status (`status-planned`, `status-renovation` w design tokens).
- ✅ Usunięto wyświetlanie numerycznego ID/kodu ulicy w dropdownach formularzy — `AdminEventForm.tsx` i `AddressRow.tsx`: pole `street_type` importowane z GeoJSON GUGiK zawiera kod `"1"` (RODZAJ) zamiast czytelnego prefiksu. Dodano funkcję pomocniczą `streetLabel(type, name)` pomijającą typy pasujące do `/^\d+$/`. Usunięto też jawną etykietę `(ID: {selectedStreet.id})` z potwierdzenia wyboru ulicy w formularzu dyspozytora. Atrybuty `key` i `value` komponentów oraz wywołania API nadal używają `street.id`.

---

## 12. PODSUMOWANIE PRAC (13.04.2026)
- ✅ Rozbudowano silnik powiadomień o inteligentne formatowanie adresów (nazwa ulicy + precyzyjne numery posesji pobierane z danych GIS).
- ✅ Zmodyfikowano treść SMS-ów o zmianie statusu, stawiając lokalizację awarii na pierwszym miejscu dla lepszej czytelności.
- ✅ Dodano numer alarmowy 994 oraz ujednolicone przeprosiny za utrudnienia do wszystkich szablonów wiadomości SMS.

---

## 13. IMPORT DANYCH WEKTOROWYCH GIS (13.04.2026)

### Import ulic — `streets_lublin__final.geojson`
- ✅ Zaimportowano **1 333 ulice** z pliku `backend/data/streets_lublin__final.geojson` (źródło: QGIS/GUGiK EPSG:4326).
- ✅ Mapowanie pól: `ID_ULIC` → `teryt_sym_ul` (unikalny klucz upsert), `NAZWA_TER1` → `name` (człon główny, np. „Mickiewicza"), `NAZWA_ULC` → `full_name` (pełna nazwa, np. „Adama Mickiewicza"), `RODZAJ` → `street_type`, geometria MultiLineString → `geojson` (JSONB).
- ✅ Skrypt `import_streets.py` obsługuje teraz dwa formaty: GeoJSON (domyślny, plik `.geojson`) oraz XML TERYT (legacy, plik `.xml`) — wybór automatyczny na podstawie rozszerzenia.
- ✅ Układ współrzędnych potwierdzony: EPSG:4326 (WGS84) — współrzędne w formacie `[lon, lat]` zgodnym z Leaflet.

### Import budynków — programowy Spatial Join (geopandas) — `budynki_surowe.geojson` + `adresy_surowe.geojson`
- ✅ Zmiana podejścia: zamiast pliku wstępnie złączonego w QGIS, join wykonywany jest programowo w Pythonie przez `geopandas`, co daje pełną kontrolę nad procesem i gwarantuje zachowanie wszystkich poligonów.
- ✅ Zainstalowano i dodano do `requirements.txt` pakiety GIS: `geopandas>=0.14.0`, `shapely>=2.0.0`, `rtree>=1.0.0` (indeks przestrzenny R-tree dla wydajności).
- ✅ Zaimportowano **46 596 budynków** (wszystkie poligony z `budynki_surowe.geojson` — zero utraconych).
- ✅ Algorytm: `gpd.sjoin(budynki, adresy, how='left', predicate='intersects')` — flaga `how='left'` jest kluczowa i zachowuje budynki bezadresowe. Po joinie deduplikacja po `fid` (usunięto 85 duplikatów — przypadki jednego poligonu przeciętego przez kilka punktów adresowych).
- ✅ **25 967 budynków z adresem** po KROK 1 — `full_address = "ul. NAZWA_ULC NUMER_PORZ"` (np. `"ul. Wapienna 21B"`). Dopasowanie `street_id` przez TERYT: `ID_ULIC` z punktów adresowych = `teryt_sym_ul` w tabeli `streets` — bezpośrednie, bez fuzzy matching.
- ✅ **20 629 budynków bezadresowych** po KROK 1 — luka wynikająca z przesunięcia punktów PRG (GUGiK) względem poligonów BDOT10k (zwłaszcza rodzaj `'m'` — mieszkalne).
- ✅ **Wprowadzono 15-metrowy bufor bezpieczeństwa (KROK 2 — sjoin_nearest)** — `import_buildings.py` wykonuje teraz dwuetapowy spatial join:
  - **KROK 1 (rygorystyczny):** `gpd.sjoin(predicate='intersects')` — punkt adresowy wewnątrz poligonu.
  - **KROK 2 (ratunkowy):** `gpd.sjoin_nearest(max_distance=15, EPSG:2180)` — dla budynków nadal bez adresu, znajdź najbliższy punkt PRG w promieniu ≤ 15 m w układzie metrycznym PUWG 1992.
  - Wynik: **+10 711 budynków uratowanych** przez KROK 2, łącznie **36 678 budynków z adresem** (wzrost z 26 tys. do prawie 37 tys. — pokrycie adresowe ponad 78% wszystkich poligonów).
- ✅ **9 918 budynków bezadresowych** — faktycznie bezadresowe (garaże, budynki techniczne, obiekty gospodarcze) — zaimportowane z `NULL` w polach adresowych. Wszystkie posiadają geometrię i `id_budynku`.
- ✅ Układ współrzędnych potwierdzony: EPSG:4326 (WGS84, `lon≈22, lat≈51`). Geometria MultiPolygon przechowywana w `geojson_polygon` (JSONB) — gotowa do renderowania w Leaflet bez konwersji.

---

## 14. POPRAWKI UX PANELU DYSPOZYTORA (16.04.2026)

### ✅ Mapa interaktywna widoczna we wszystkich 3 zakładkach „Zakresu awarii" (`AdminEventForm.tsx`)
- **Problem:** Mapa z obrysami budynków była wcześniej renderowana tylko wewnątrz zakładki „Zaznacz na mapie". Przełączenie na zakładkę „Zakres numerów" lub „Lista numerów" ukrywało mapę, uniemożliwiając wizualną weryfikację zaznaczenia.
- **Naprawa:** Komponent `<MapContainer>` wraz ze stanem ładowania i komunikatem o braku obrysów wyciągnięty poza blok `<Tabs>` i umieszczony bezpośrednio pod nim. Zakładka 1 („Zaznacz na mapie") zawiera teraz tylko krótki hint tekstowy. Mapa jest zawsze widoczna po wybraniu ulicy, niezależnie od aktywnej zakładki.

### ✅ Warstwy budynków na mapie publicznej ukryte przy małym zoomie (`EventMap.tsx`)
- **Problem:** Poligony i kółka (`CircleMarker`) poszczególnych budynków w obrębie awarii renderowały się na każdym poziomie zoomu. Przy oddaleniu tworzyły duże, nakładające się skupisko kółek (np. kilkanaście budynków przy ul. Matejki), mimo że pinezka zdarzenia była już widoczna i wystarczająca.
- **Naprawa:** Dodano komponent `ZoomAwareLayer` (używa `useMap` + `useMapEvents`) wewnątrz `MapContainer`. Warstwa `<GeoJSON>` z obrysami budynków owija się w `ZoomAwareLayer` — przy zoom < 15 warstwa jest całkowicie ukryta, renderuje się tylko pinezka zdarzenia. Przy zoom ≥ 15 poligony/kółka wracają i można kliknąć poszczególne budynki. Próg `BUILDINGS_ZOOM_THRESHOLD = 15` zdefiniowany jako stała.

### ✅ Naprawa błędu zaznaczania budynków przez „Listę numerów" (`AdminEventForm.tsx`)
- **Problem:** Wpisując np. `12, 23,` w polu listy, system zaznaczał 4 budynki (1, 2, 12, 23) zamiast 2 (12 i 23). Przyczyna: `handleListInputChange` wywoływał `setSelectedBuildingIds((prev) => new Set([...prev, ...newIds]))` — akumulował zaznaczenie zamiast zastępować. Każda pośrednia cyfra (np. „1" podczas pisania „12") była matchowana i trwale dodawana do setu.
- **Naprawa (dwa elementy):**
  1. **Zastąpienie akumulacji nadpisaniem:** `setSelectedBuildingIds(newIds)` — bieżąca lista wejściowa wyznacza zaznaczenie w całości.
  2. **Opóźnione matchowanie niekompletnych tokenów:** parser sprawdza czy ostatni token jest zakończony separatorem (przecinek/spacja). Jeśli nie — token jest uznany za niekompletny i pomijany. Np. przy wpisie `12, 2` (bez końcowego przecinka) matchuje tylko `12`; po dopisaniu `,` matchuje `12` i kolejny wpisany numer. Hint w labelu zaktualizowany: „zatwierdź przecinkiem".

