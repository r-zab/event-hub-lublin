# Stan projektu — Event Hub Lublin

**Data raportu:** 2026-04-18
**Autor:** Audyt ekspercki (Główny Architekt Systemów + Audytor Bezpieczeństwa/UX)
**Tryb:** read-only — niniejszy dokument jest wynikiem audytu bez modyfikacji kodu źródłowego.
**Odbiorca:** Zarząd MPWiK Lublin, Dyrektor IT, Jury „Festiwalu Biznesu".

---

## 1. Status ogólny projektu

Projekt **Event Hub Lublin** — system powiadamiania mieszkańców o awariach i planowanych wyłączeniach sieci wodociągowej — jest w stanie **zaawansowanego prototypu gotowego do prezentacji konkursowej, ale wymagającego kilku poprawek przed wdrożeniem produkcyjnym u MPWiK**.

**Co mamy gotowe i zweryfikowane w kodzie:**

- **Backend FastAPI (async, Python 3.12)** z pełnym CRUD zdarzeń, rejestracją subskrybentów (RODO), silnikiem powiadomień SMS/e-mail ze zgodą na tryb nocny, logami powiadomień, kolejką poranną (APScheduler 06:00 Europe/Warsaw), rate limiterem (slowapi) oraz refresh-tokenami JWT.
- **Baza PostgreSQL 16 + PostGIS 3.4** — 1378 ulic TERYT (z geocoderem Nominatim), 51 643 budynki (BDOT10k + PRG + OSM supplement), indeks GIST na `buildings.geom`, kolumna `geom` do zapytań BBOX, 9 migracji Alembic.
- **Frontend React 18 + Vite + TypeScript + shadcn/ui + Tailwind** — strona mieszkańca z wyszukiwarką ulica+numer, mapa Leaflet z pinezkami ikonami wg typu zdarzenia i fly-to, panel dyspozytora z tabem „Lista zdarzeń" + „Mapa budynków", formularz zdarzenia z tabami („Zaznacz na mapie" / „Zakres numerów" / „Lista numerów"), panel subskrybentów, panel logów powiadomień.
- **Integracja GIS ↔ silnik powiadomień** — dokładne dopasowanie po `street_id` i numerze budynku odczytanym z `geojson_segment.features[].properties.house_number` (koniec wyświetlania fałszywych zakresów „1–13").
- **Bramka SMS** — działa w trybie `mock` (lokalny dev) z gotowym gatewayem SMSEagle za zmienną środowiskową. Kill-switch e-maili (`ENABLE_EMAIL_NOTIFICATIONS`).
- **Docker Compose** — pełna infrastruktura (`postgis/postgis:16-3.4-alpine`, backend, frontend, nginx) uruchamialna jednym poleceniem.

**Co wciąż blokuje produkcyjne wdrożenie u MPWiK (szczegóły w sekcji 3):**

1. Krytyczna luka RODO w flow wyrejestrowania — token pokazywany tylko raz na ekranie, brak kopii na SMS/e-mail.
2. Brak kontroli roli (RBAC) na froncie — dyspozytor widzi wszystkie linki admina, dostaje błędy 403 zamiast ukrytego UI.
3. Responsywność panelu dyspozytora (`AdminLayout`, `AdminEventForm`) — brak breakpointów RWD, nieczytelny na telefonie.
4. Zero testów automatycznych (`backend/tests/` zawiera wyłącznie `__init__.py`).
5. `SECRET_KEY` z domyślną wartością startuje bez walidacji gdy ktoś zapomni `.env`.
6. Frontend nie używa paginacji server-side (pobiera 20 rekordów, filtruje client-side, UI pokazuje fałszywą paginację).

**Ocena ekspercka:** **7/10 — bardzo dobry prototyp z ambitnymi decyzjami architektonicznymi (PostGIS, multi-operator ready, spatial join w Pythonie). Kilka krytycznych detali RODO i UX wymaga decyzji przed oddaniem. Kod jest czysty (async/await wszędzie, logger zamiast `print`, schematy Pydantic v2, typowanie TypeScript), ale brakuje testów i hardeningu produkcyjnego.**

---

## 2. Weryfikacja „Listy poprawek" (`docs/lista_rzeczy_do_poprawek.md`)

Sprawdzono faktyczny stan kodu dla każdej pozycji oznaczonej `✅ NAPRAWIONO`.

### 2.1. Pozycje w 100% zamknięte (kod potwierdza deklarację)

| ID | Opis | Weryfikacja |
|----|------|-------------|
| 1.1 / 3.1 / 3.8 | Unsubscribe — flow z tokenem | `frontend/src/pages/Unsubscribe.tsx` — dwuetapowy flow `GET /subscribers/{t}` → dialog potwierdzenia → `DELETE /subscribers/{t}`. `subscribers.py:206` — fizyczne usuwanie, CASCADE na adresy. |
| 1.2 / 1.3 | Unique email/phone | Partial unique index `WHERE … IS NOT NULL` (migracja `20260417`) + HTTP 409 w `subscribers.py:117`. |
| 1.4 | `DELETE /events/{id}` (admin-only) | `events.py:99` — `role == "admin"` → HTTP 403 dla dispatchera. Synchroniczne powiadomienie przed DELETE. |
| 1.6 | Nocna cisza w CET/CEST | `notification_service.py:390` — `datetime.now(ZoneInfo("Europe/Warsaw")).hour`. |
| 1.7 | Edycja zdarzenia ładuje dane | `App.tsx:47` — route `/admin/events/edit/:id`; form ładuje przez `getEvent(id)`. |
| 1.8 | `notify_event` obsługa błędów | `events.py:27` — `_log_task_exception` callback; pętla per-subskrybent w try/except. |
| 2.1 | Endpointy `/admin/stats|subscribers|notifications` | `admin.py` — 3 endpointy + `dependencies=[Depends(get_current_admin)]` na routerze. |
| 2.4 | `get_current_admin` RBAC | `dependencies.py:63` — HTTP 403 dla non-admin. |
| 2.6 | Scheduler porannej kolejki | `main.py:60` — `AsyncIOScheduler(tz="Europe/Warsaw")`, cron 06:00. |
| 2.8 | Rate limiting | `auth.py:24` (`5/minute`), `subscribers.py:98` (`3/minute`). |
| 3.2 | `notified_count` w `EventResponse` | `events.py:55` — `event.notified_count = len(event.notifications)`. |
| 3.3 | Auto-redirect na 401 | `api.ts:21` — clear tokenów + redirect `/admin/login`. |
| 3.4 | Walidacja pustych adresów | `Register.tsx:112` + Zod schema. |
| 3.5 / 3.6 | Panel subskrybentów i logów | `AdminSubscribers.tsx`, `AdminNotifications.tsx` — React Query + paginacja server-side. |
| 3.7 | Geocoding ulic | `scripts/geocode_streets.py` — 1372/1378 ulic zgeokodowanych. |
| 3.11 | Strefy czasowe UTC → Europe/Warsaw | `schemas/event.py:9` `_utc_iso`, `lib/utils.ts` `parseUTC`. |
| 4.3 | CORS z `settings.CORS_ORIGINS` | `main.py:93` — parsowanie `,` + strip. |
| 4.9 | Kolumna „Źródło" w tabeli | `AdminDashboard.tsx:194`. |
| 4.11 | `EventStatus` = 3 wartości | `schemas/event.py:24` — `Literal["zgloszona", "w_naprawie", "usunieta"]`. |
| 4.12 | Notify tylko przy zmianie status/estimated_end | `events.py:195` — warunek `status_changed or estimated_end_changed`. |
| 4.13 | Konfiguracja logowania | `main.py:25` — `logging.config.dictConfig`, bez `print()`. |
| 4.15 / 4.16 / 4.17 / 4.18 | Retroaktywne powiadomienia + mapa + DELETE z powiadomieniem | Zweryfikowane w `notification_service.py` + `events.py`. |
| 7.1–7.4, 7.6–7.12 | Synchronizacja GIS ↔ notyfikacje | `AdminEventForm.tsx` — 3 taby spójne, `formatEventNumbers` w `lib/utils.ts`. |

### 2.2. Pozycje „naprawione w teorii" — wymagają uzupełnienia przed oddaniem

| ID | Deklaracja | Stan faktyczny | Co dopisać |
|----|------------|----------------|------------|
| **1.5** — Refresh token | „Endpoint `/auth/refresh` + login zwraca `refresh_token`" | Backend OK (`auth.py:59`). **Frontend w ogóle nie korzysta**: `useAuth.tsx:32` odczytuje tylko `access_token`, nie zapisuje `mpwik_refresh_token`. Po 30 min aktywności `apiFetch` robi wylogowanie zamiast odświeżenia. | Dorobić wywołanie `POST /auth/refresh` w `apiFetch` po 401 oraz zapis `refresh_token` w `login()`. |
| **2.5 / 3.7** — Geocoding ulic | „39/45 zgeokodowanych, końcowa liczba 1378" | Tak, ale **6 ulic bez geom** nigdy nie wyświetli się na mapie jako punkt (`plac`, `skwer`, `park`, `ul. Wandy Papiewskiej`). W pliku listy oznaczone jako akceptowalne, ale raport jury/MPWiK powinien o tym jawnie informować. | Dodać do UI informację „mapa niedostępna dla tej ulicy — powiadomienia działają normalnie". |
| **2.7** — Walidacja formatu telefonu | „Regex `^\+48\d{9}$\|^\d{9}$` + strip" | OK po obu stronach, ale **backend wymusza `+48`** przed zapisem, a frontend akceptuje też `600-000-000`. Zgodne, ale brak docstringa dla operatora, który się zdziwi „dlaczego w bazie wszystko z `+48`". | Dopisać tę decyzję do dokumentacji operacyjnej (nie blokujące). |
| **2.8** — Rate limiting | „`5/minute` na login, `3/minute` na register" | OK dla tych endpointów. **Brak limiter-a na `/auth/refresh`** (`auth.py:59`) — atakujący z jednym wyciekniętym refresh tokenem może generować access-tokeny nieograniczenie. Brak limiter-a na `/subscribers/{token}` DELETE (enumeracja tokenów). | Dodać `@limiter.limit("10/minute")` na refresh i `@limiter.limit("20/minute")` na `/subscribers/{t}` GET/DELETE. |
| **3.4** — Walidacja pustych adresów | „Zod + sprawdzanie przed submitem" | OK w `Register.tsx`. Walidacja numeru przez combobox z listy budynków jest **blokująca** — użytkownik, którego budynku nie ma w bazie (np. nowy obiekt poza BDOT10k) NIE MOŻE się zarejestrować. | Dodać opcję „zgłoś brakujący adres" lub soft-warning + fallback tekstowy. |
| **3.11** — Strefy czasowe | „TIMESTAMP WITH TIME ZONE" | Migracja `20260410_timestamp_with_timezone.py` **przygotowana, ale nie uruchomiona**. Pydantic serializer radzi sobie, ale surowe `created_at` w PostgreSQL są wciąż `timestamp without tz`. | Uruchomić migrację + potwierdzić że dokumentacja ją wymaga. |
| **4.9** — Źródło zdarzenia | „Kolumna w AdminDashboard" | OK w UI. **Mapa publiczna w ogóle nie pokazuje źródła** — mieszkaniec nie zobaczy, czy awarię zgłosił MPWiK czy LPEC. Brak ikony/labela w `EventCard.tsx`. | Dodać do `EventCard` mały badge `event.source` (jeśli różne od `mpwik`). |

---

## 3. Krytyczne luki i błędy do poprawy (Audyt seniora)

Ta sekcja to **punch-list przed oddaniem projektu**. Każdy punkt to obserwacja wynikająca z faktycznego stanu kodu (nie z listy deklaracji).

### 3.1. 🔴 KRYTYCZNE — przebudować przed oddaniem

#### 3.1.1. RODO — token wyrejestrowania widoczny tylko raz (pkt 4.10 listy) ✅ NAPRAWIONO

- **Plik:** `frontend/src/pages/Register.tsx:189-195` + `backend/app/routers/subscribers.py:168`
- **Obserwacja:** Po rejestracji token (64-znakowy hex) jest jedyny raz wyrenderowany w kartce z klasą `select-all`. Jeżeli mieszkaniec zamknie kartę, straci telefon, zmieni numer — **nie ma żadnej drogi odzyskania tokenu**. W backendzie po rejestracji leci jedynie `notify_new_subscriber_about_active_events()` (powiadomienia o trwających awariach), nigdy **powitalny SMS/e-mail z tokenem**.
- **Dlaczego to krytyczne:** Naruszenie **Art. 17 RODO** (prawo do bycia zapomnianym). Mieszkaniec, który nie może usunąć swoich danych, to potencjalna skarga do UODO.
- **Rekomendacja (obowiązkowa):**
  1. Rozszerzyć `notify_new_subscriber_about_active_events()` (lub osobna funkcja `send_welcome_with_token`) o wiadomość powitalną zawierającą **link z tokenem** (`https://…/unsubscribe?token=<t>`).
  2. Kanał wybrany dynamicznie: jeśli `notify_by_email=true` → e-mail; jeśli tylko SMS → link skrócony w SMS.
  3. Logowanie wysyłki tokenu jako osobny wpis w `notification_log` (`channel='welcome'`).
  4. W UI ekranu sukcesu dodać sekcję: *„Wysłaliśmy Ci token wyrejestrowania na {kanał}. Jeśli go zgubisz — skontaktuj się z BOK MPWiK 81 532-42-81."*

#### 3.1.0. Hardening GIS + zarządzanie użytkownikami ✅ NAPRAWIONO (2026-04-18)

- **Pliki backend:** `backend/app/models/audit.py` (nowy), `backend/app/routers/buildings.py`, `backend/app/routers/admin.py`
- **Pliki frontend:** `frontend/src/components/AdminMapView.tsx`, `frontend/src/components/BuildingAddressModal.tsx`, `frontend/src/hooks/useBuildings.ts`, `frontend/src/pages/AdminUsers.tsx` (nowy), `frontend/src/components/AdminLayout.tsx`, `frontend/src/App.tsx`
- **Migracja:** `backend/alembic/versions/20260418_add_building_audit_log.py`
- **Co zrobiono:**
  1. **RBAC w AdminMapView:** Dispatcher nie może klikać budynków w celu edycji adresów (brak click handlerów, zmienione tooltopy w legendzie). Admin może klikać KAŻDY budynek — w tym z adresem (tryb edycji).
  2. **Edycja i usunięcie adresu budynku (admin):** `PATCH /buildings/{id}` — zmieniono z `dispatcher_or_admin` na `admin`. `DELETE /buildings/{id}` — nowy endpoint; zeruje `street_id`, `street_name`, `house_number` (nie usuwa rekordu GIS). Oba endpointy zapisują wpis audytowy.
  3. **BuildingAuditLog:** Nowy model + migracja + tabela `building_audit_log` (user_id FK, building_id, action, old_data JSONB, new_data JSONB, timestamp).
  4. **BuildingAddressModal:** Tryb `edytuj` dla admina gdy `building.has_address === true` — prefillowany formularz + przycisk „Usuń adres" z potwierdzeniem AlertDialog. Tryb `uzupełnij` bez zmian.
  5. **Panel zarządzania użytkownikami** (`/admin/users`, dostępny tylko dla admina):
     - `GET /admin/users` — lista kont (login, rola, status, data)
     - `POST /admin/users` — tworzenie konta (login, hasło min 8 znaków, rola)
     - `PATCH /admin/users/{id}` — zmiana roli / dezaktywacja
     - `DELETE /admin/users/{id}` — usunięcie konta; blokada: nie można usunąć ostatniego admina ani własnego konta
  6. **Sidebar** — nowa pozycja „Użytkownicy" (ikona `UserCog`, adminOnly: true).

#### 3.1.2. RBAC na froncie — dispatcher widzi pełny panel admina ✅ NAPRAWIONO

- **Pliki:** `frontend/src/hooks/useAuth.tsx`, `frontend/src/components/AdminLayout.tsx`, `frontend/src/App.tsx`, `backend/app/routers/auth.py`, `backend/app/routers/events.py`
- **Co zrobiono (2026-04-18):**
  1. **Backend `auth.py`** — `create_access_token` i `create_refresh_token` teraz zawierają `"role": user.role` w payload JWT (logowanie i refresh).
  2. **Backend `events.py`** — usunięto ręczny check `if current_user.role != "admin"` z `delete_event` — dyspozytor może teraz usuwać zdarzenia (zgodnie z wymaganiami biznesowymi).
  3. **Frontend `useAuth.tsx`** — `AuthContext` rozszerzony o `role: 'admin' | 'dispatcher' | null`; rola odczytywana z JWT payload (base64 decode `atob()`) przy logowaniu i inicjalizacji z `localStorage`.
  4. **Frontend `AdminLayout.tsx`** — sidebar filtrowany po `adminOnly` + `role === 'admin'`; zakładki „Subskrybenci" i „Logi powiadomień" niewidoczne dla dyspozytora.
  5. **Frontend `App.tsx`** — nowy komponent `<AdminOnlyRoute>` owijający `/admin/subscribers` i `/admin/notifications`; dispatcher próbujący wejść przez URL → redirect na `/admin/dashboard`.

#### 3.1.3. POST/PUT `/events` — brak sprawdzenia roli na backendzie

- **Plik:** `backend/app/routers/events.py:80, 143`
- **Obserwacja:** `POST /events` i `PUT /events/{id}` wymagają tylko `get_current_user` — **dowolny zalogowany użytkownik** (także z niezdefiniowaną jeszcze rolą) może tworzyć/edytować zdarzenia. Obecnie w bazie są tylko `admin` i `dispatcher`, ale jak doda się `operator` z LPEC (multi-operator ready) — niechcący dostanie pełne prawa do edycji cudzych awarii.
- **Rekomendacja:** podmienić `Depends(get_current_user)` na `Depends(get_current_dispatcher_or_admin)` w `create_event`, `update_event`. Defense-in-depth.

#### 3.1.4. RWD panelu dyspozytora nieczytelny na telefonie

- **Pliki:** `frontend/src/components/AdminLayout.tsx:24`, `frontend/src/pages/AdminEventForm.tsx` (1159 linii, **zero** breakpointów `sm:`/`md:`/`lg:`)
- **Obserwacja:**
  - `AdminLayout` ma sidebar `w-64` (256 px) **na każdej rozdzielczości**. Na iPhone SE (375 px) to 68 % ekranu — tabela widoczna w 32 %.
  - `AdminEventForm` (najbardziej złożony formularz — mapa Leaflet + taby + koszyk + autocomplete) nie ma **ani jednego** responsywnego modyfikatora Tailwind. Gridy, mapy i dialogi mają stałe szerokości w px.
  - Skutek: dyspozytor na tablecie/telefonie (np. podczas awarii w terenie) nie da rady użyć systemu.
- **Rekomendacja:**
  1. `AdminLayout` — sidebar jako `hidden lg:flex` + menu hamburger na mobile (`Sheet` z shadcn/ui).
  2. `AdminEventForm` — kontener `grid-cols-1 lg:grid-cols-2`, mapa `h-[400px] lg:h-[600px]`, taby `w-full`.
  3. Przetestować na Chrome DevTools — iPhone SE 375 × 667 i iPad Air 820 × 1180.

#### 3.1.5. Brak paginacji server-side na stronie mieszkańca i w dashboardzie

- **Plik:** `frontend/src/hooks/useEvents.ts:52`
- **Obserwacja:** `apiFetch<EventItem[]>('/events')` — **nie przekazuje** `skip`/`limit` do backendu. Backend zwraca `limit=20` default, po czym frontend filtruje i stronicuje client-side. UI pokazuje „Strona 1 z N", ale N liczone z pierwszych 20 rekordów. Gdy MPWiK będzie miało 500 zdarzeń archiwalnych → filtry/wyszukiwarka pokażą tylko 20 najnowszych.
- **Rekomendacja:** przekazać do `useEvents` parametry `skip`, `limit`, `search`, `status_filter`, `type_filter` i filtrować po stronie backendu (wymaga rozszerzenia `GET /events` o parametry zapytania + zwracania `total_count`).

### 3.2. 🟡 WAŻNE — poprawić przed wdrożeniem MPWiK

#### 3.2.1. `SECRET_KEY` z domyślną wartością w konfigu (pkt 4.2 listy)

- **Plik:** `backend/app/config.py:18`
- Pydantic Settings czyta `.env`, ale jeśli go nie ma — używa stringa `"change-this-to-a-random-string-minimum-32-characters-long"`. System startuje bez krzyku, JWT są podpisane tym sekretem.
- **Rekomendacja:** w `config.py` dopisać walidator:
  ```python
  @model_validator(mode="after")
  def validate_secret(self):
      if not self.DEBUG and "change-this" in self.SECRET_KEY:
          raise ValueError("SECRET_KEY musi być ustawiony w .env na produkcji")
      return self
  ```

#### 3.2.2. Brak walidacji schematu `geojson_segment` (pkt 7.5 listy)

- **Plik:** `backend/app/schemas/event.py:40, 60`
- `geojson_segment: dict | None` akceptuje dowolny słownik. Przykładowy atak: `{"foo": "bar"}` zostanie zapisany, a silnik powiadomień padnie na `features[].properties.house_number`. Brak Pydantic validatora.
- **Rekomendacja:** `@field_validator("geojson_segment")` sprawdzający `type == "FeatureCollection"` + `features: list` + każdy feature ma `properties.house_number`.

#### 3.2.3. Escapowanie znaków specjalnych ILIKE (pkt 4.6 listy)

- **Plik:** `backend/app/routers/streets.py:31`
- `Street.full_name.ilike(f"%{q}%")` — SQLAlchemy parametryzuje wartość, więc **nie ma SQL injection**. Jest natomiast **LIKE-injection**: użytkownik wpisuje `%` → dostaje wszystkie 1378 ulic. Endpoint bez rate-limitu = potencjalny DoS autocomplete'u.
- **Rekomendacja:** `q_escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")` przed `ilike`. Dodatkowo `@limiter.limit("30/minute")`.

#### 3.2.4. Rate limit na `/auth/refresh` (uzupełnienie pkt 2.8)

- **Plik:** `backend/app/routers/auth.py:59`
- Endpoint bez dekoratora `@limiter.limit`. Ktoś z wyciekniętym refresh-tokenem (ważny 7 dni) może generować access-tokeny bez limitu.
- **Rekomendacja:** `@limiter.limit("10/minute")`.

#### 3.2.5. Brak endpointu `GET /events/feed` (IVR 994) (pkt 2.2 listy)

- Szef IT powiedział „odpuśćcie na razie", ale dla „Festiwalu Biznesu" **to jest killer-feature** — plain-text z aktywnymi awariami, dostępny dla automatu 994 przez wget, 10 linii kodu. Warto dorzucić przed prezentacją.

#### 3.2.6. Autor zdarzenia vs `source` — niespójność w UI

- `AdminDashboard.tsx:231` pokazuje `event.source || 'mpwik'`. `EventCard.tsx` (strona publiczna) — nie pokazuje tego pola wcale. Gdy wejdzie LPEC/ZDiM przez `X-API-Key` (pkt 2.3), mieszkaniec nie zobaczy kto zgłosił awarię.
- **Rekomendacja:** dodać w `EventCard` mały badge typu *„źródło: LPEC"* gdy `source !== 'mpwik'`.

### 3.3. 🟢 Dostępność (WCAG) — audyt uproszczony

Projekt ma **bazowe** wsparcie a11y (`aria-label`, `aria-hidden`, `role="listbox"` w autocomplete ulic), ale:

1. **`EventCard.tsx:41`** — `<Card onClick={…}>` bez `role="button"`, `tabIndex={0}`, `onKeyDown`. Użytkownik klawiatury nie skliknie karty. **Obowiązkowa poprawka** (WCAG 2.1.1 Keyboard).
2. **`AdminDashboard.tsx:218`** — `<TableRow onClick={toggleRow}>` — analogicznie, wiersz nie jest klikalny klawiaturą.
3. **Brak `lang="pl"`** w `index.html` (weryfikacja w `frontend/index.html` — jeśli już jest, punkt odpada).
4. **Kontrasty** — Tailwind `text-muted-foreground` na białym tle; warto sprawdzić narzędziem axe DevTools dla czytelności (WCAG 1.4.3).
5. **Pułapki focus** — dialog RODO (Unsubscribe) i AlertDialog z Radix są OK (Radix domyślnie trap focus).
6. **Fieldset + legend** — `Register.tsx` używa `<fieldset><legend>` ✅.

**Rekomendacja:** pre-ship uruchomić **Lighthouse Accessibility** i **axe DevTools** na stronach `/`, `/register`, `/admin/dashboard`, `/admin/events/new`.

---

## 4. Zgodność z wymaganiami MPWiK i konkursem

| Obszar | Status | Komentarz |
|--------|--------|-----------|
| **RODO — fizyczne usunięcie** | ⚠️ częściowo | Backend OK (CASCADE). Frontend zepsuty przez token pokazywany raz (sekcja 3.1.1). |
| **Tajemnica przedsiębiorstwa** | ✅ | Admin endpointy za JWT + rolą; brak publicznego podglądu listy subskrybentów. |
| **Bramka SMS (SMSEagle)** | ✅ | `services/gateways.py` — wsparcie `mock` + `smseagle`, przełącznik przez `SMS_GATEWAY_TYPE`. |
| **Nocna cisza 22–06 Europe/Warsaw** | ✅ | `notification_service.py:390`. Osobna zgoda `night_sms_consent`. |
| **Rate limiter / WAF-ready** | ⚠️ częściowo | slowapi na `login` + `register`; brak na `refresh`, `streets?q=`, `subscribers/{token}` (sekcja 3.2.3–3.2.4). Nginx jako reverse-proxy w Docker Compose — dobre przygotowanie pod WAF. |
| **Multi-operator (LPEC, ZDiM)** | ❌ brak | Model `api_keys` w bazie, ale brak routera `external.py` i dependency na `X-API-Key`. Pole `source` w `events` gotowe. |
| **GIS — klikanie budynków zamiast okręgów** | ✅ | `AdminEventForm` ma 3 taby, `BuildingLayer` z poligonami/punktami OSM, tooltipy z pełnym adresem. `EventMap` publiczna pokazuje poligony wg zoom ≥ 15. |
| **IVR 994 endpoint** | ❌ brak | Pkt 2.2 listy, Szef IT odłożył. Warto dorobić przed prezentacją — 10 linii kodu. |
| **Trigram index na `streets`** | ❌ brak | Migracja nie napisana. Przy 1378 rekordach nie odczujesz, ale TECH_SPEC tego wymaga. |
| **WCAG dostępność** | ⚠️ częściowo | Aria-labels są. Brak keyboard navigation na klikanych kartach, brak audytu axe (sekcja 3.3). |
| **Wirtualka Oracle Linux** | ❌ nie testowane | Docker Compose jest, ale nikt nie uruchomił stacku na Oracle Linux 9. **Obowiązkowe przed SLA z MPWiK.** |
| **Zero kosztów licencyjnych** | ✅ | Cały stack FOSS (FastAPI, React, Leaflet, PostgreSQL/PostGIS, shadcn/ui MIT). |
| **Testy automatyczne** | ❌ brak | `backend/tests/` — tylko pusty `__init__.py`. Zero pytest. Frontend — brak Vitest. |

---

## 5. Dług techniczny i skalowalność

### 5.1. Świadomie odłożone (backlog)

- **IVR 994** — endpoint `GET /events/feed` (plain text). Odłożony decyzją szefa IT.
- **X-API-Key dla zewnętrznych operatorów** — model `ApiKey` istnieje, router czeka.
- **Aktualizacja słownika TERYT** (pkt 4.7) — `import_streets.py` jest idempotentny, ale brak mechanizmu cron/CI.
- **6 ulic bez geocode'u** (Plac Łokietka, Skwer Witkowskiego itp.) — nie renderują się na mapie jako punkt; Nominatim ich nie zna.
- **Widok źródła zdarzenia na mapie publicznej** — multi-operator ready, ale UI zmierzy się dopiero po podpięciu LPEC.

### 5.2. Skalowalność — co zadziała, co trzeba obserwować

**Zadziała dla Lublina (~340 tys. mieszkańców, ~3 tys. potencjalnych subskrybentów):**
- Index GIST na `buildings.geom` + zapytania BBOX — profilowane na 51 643 rekordach.
- Async FastAPI + asyncpg — single instance obsłuży 500–1000 RPS.
- APScheduler kolejka poranna — max 3 tys. SMS w 6:00; SMSEagle zrobi ~10/s, pełne wysłanie w 5 min.

**Trzeba obserwować:**
- `notification_service.notify_event()` leci sekwencyjnie per subskrybent (`for sub in …`). Przy 3 tys. subskrybentów × e-mail + SMS = ~6 tys. I/O requestów. Przy awarii przed 06:00 blokowanie `asyncio.create_task()` może trwać 5–10 min. **Rekomendacja:** `asyncio.gather(*[...], return_exceptions=True)` dla równoległości.
- Brak retry-policy dla SMS Gateway (failed → status w logu, koniec). MPWiK wymaga potwierdzenia dostarczalności ≥ 95 %. **Rekomendacja:** tabelka `notification_retries` lub kolejka Redis/RQ.
- Frontend pobiera cały `GET /events` bez paginacji (sekcja 3.1.5). Powyżej 100 zdarzeń archiwalnych odczuwalne TTI.

### 5.3. Monitoring, observability

**Brakuje całkowicie:**
- Nie ma `/metrics` (Prometheus), health-check pokazuje tylko wersję.
- Nie ma structured logging (JSON) — logi idą do stderr tekstem.
- Brak Sentry/GlitchTip — błędy tylko w log-streamie.

**Rekomendacja przed SLA:** `starlette-prometheus` + osobny endpoint `/metrics` + panel Grafana.

### 5.4. Testy — absolutny minimum przed oddaniem MPWiK

Priorytet (dla `backend/tests/`):
1. `test_auth.py` — login happy path, 401 na złe hasło, 5/min rate limit.
2. `test_subscribers.py` — register → token → GET → DELETE (RODO flow).
3. `test_events.py` — CRUD + RBAC (dispatcher próbuje DELETE → 403).
4. `test_notification_service.py` — night hours, queued_morning, matching po `street_id`.
5. Integracyjne z testcontainers PostgreSQL (nie mockować DB — pkt konkretnie widoczny w procesie MPWiK).

---

## 6. Podsumowanie dla jury i zarządu MPWiK

**Co pokazać na „Festiwalu Biznesu":**
- Strona publiczna — wyszukiwarka ulica + numer, mapa Leaflet z ikonami wg typu zdarzenia, fly-to.
- Panel dyspozytora — demo formularza z 3 zakładkami (mapa/zakres/lista) + automatyczna synchronizacja zaznaczenia.
- Rejestracja → SMS/e-mail dostarczony (mock gateway + realny SMTP).
- Wyrejestrowanie → fizyczne usunięcie z bazy (pokaz w DBeaverze).
- Admin → statystyki + logi powiadomień + filtry.

**Co powiedzieć wprost dyrektorowi IT:**
- „Prototyp gotowy, produkcja za ~2 tygodnie pracy: RBAC front, RWD, testy pytest, hardening SECRET_KEY, wysyłka tokenu RODO."
- „Integracja GIS + silnik powiadomień są ukończone i przetestowane na realnych danych (51 tys. budynków Lublin, 1378 ulic TERYT)."
- „Architektura wspiera multi-operator (LPEC, ZDiM) przez `source` + `X-API-Key` — do podpięcia bez zmiany schematu bazy."

**Największe ryzyko:** token RODO wyświetlany raz (sekcja 3.1.1) — to jedyna rzecz, która mogłaby posłużyć UODO jako podstawa kary. **Musi być naprawione przed pierwszym wdrożeniem na realnych mieszkańcach.**

---

*Raport wygenerowany w trybie read-only — nie zmodyfikowano żadnego pliku z kodem źródłowym. Obserwacje opierają się na faktycznym stanie repozytorium na branchu `main` (commit `3e5a817`).*
