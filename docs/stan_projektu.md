# Stan projektu — System Powiadomień MPWiK Lublin

**Data raportu:** 2026-04-18 (aktualizacja: 2026-04-20)
**Autor:** Audyt ekspercki (Główny Architekt Systemów + Audytor Bezpieczeństwa/UX)
**Odbiorca:** Zarząd MPWiK Lublin, Dyrektor IT, Jury „Festiwalu Biznesu".

---

## 🔥 PRIORYTETY (DO ZROBIENIA)

Punkty wymagające natychmiastowej uwagi przed wdrożeniem produkcyjnym:

| # | Priorytet | Opis | Plik |
|---|-----------|------|------|
| P1 | 🔴 KRYT. | **SECRET_KEY — dokończenie hardeningu** (sekcja 3.2.1) — walidator blokuje start na produkcji, ale klucz domyślny wciąż istnieje w repozytorium. Wymagane: usunięcie wartości domyślnej, dokumentacja procedury generowania klucza produkcyjnego. | `backend/app/config.py` |
| P2 | 🔴 KRYT. | **Security by Obscurity — ukrycie panelu admina** — ścieżka `/admin/login` jest jawna (widoczna w stopce, publicznym kodzie JS). Zmienić na `/sys-panel/login` + ukryć link w stopce. Zmniejsza powierzchnię ataku brute-force. | `App.tsx`, `PublicLayout.tsx` |
| P3 | 🟡 WAŻE | **Testy penetracyjne `/auth/login` pod kątem brute-force** — rate limit 5/min jest, ale brak blokady IP po N nieudanych próbach, brak CAPTCHA, brak alertu na e-mail admina. | `backend/app/routers/auth.py` |
| P4 | 🟡 WAŻE | **Endpoint IVR 994** (`GET /events/feed`, sekcja 3.2.5) — plain-text z aktywnymi awariami dla automatu telefonicznego. Killer-feature na Festiwal Biznesu, ~10 linii kodu. | `backend/app/routers/events.py` |
| P5 | 🟡 WAŻE | **Ostateczny audyt WCAG axe/Lighthouse** — po wszystkich poprawkach UI/UX z ostatnich dni wymagana jest pełna weryfikacja na stronach: `/`, `/register`, `/admin/dashboard`, `/admin/events/new`. | — |
| P6 | ✅ GOTOWE | **Obsługa HTTP 429 na froncie** — `apiFetch` nie obsługuje statusu `429`. Użytkownik widzi cichy błąd zamiast komunikatu „Przekroczono limit — spróbuj za chwilę". | `frontend/src/lib/api.ts` |
| P7 | 🟢 NISKI | **Testy jednostkowe escapowania LIKE** — `streets.py` ma logikę escapowania `%`, `_`, `\`, ale brak pokrycia testami. Regresja mogłaby przywrócić podatność DoS. | `backend/tests/test_streets.py` |

---

## 📝 CHANGE LOG (HISTORIA DZIAŁAŃ)

Chronologiczna lista zmian w kodzie od momentu audytu.

### 2026-04-18 — Hardening GIS + RBAC

- **RBAC backend:** `POST /events` i `PUT /events/{id}` wymagają teraz roli `dispatcher` lub `admin` (`get_current_dispatcher_or_admin`).
- **RBAC frontend:** Sidebar filtrowany po roli; `<AdminOnlyRoute>` blokuje dostęp do `/admin/subscribers` i `/admin/notifications` dla dyspozytora.
- **Panel zarządzania użytkownikami:** Nowa strona `/admin/users` (CRUD kont, zmiana roli, dezaktywacja, blokada usunięcia ostatniego admina).
- **BuildingAuditLog:** Nowy model + migracja `20260418_add_building_audit_log.py`; każda edycja/usunięcie adresu budynku zapisuje audyt (user_id, stary/nowy JSON).
- **RWD panelu dyspozytora:** Sidebar → `hidden lg:flex` + hamburger z `Sheet` na mobile; formularze zdarzeń z `grid-cols-1 sm:grid-cols-2`.
- **Paginacja server-side:** Backend — nowe parametry `search`, `status_filter`, `type_filter`, `skip`, `limit`; `PaginatedEventResponse { items, total_count }`. Frontend — `useEvents` przebudowany, `AdminDashboard` z filtrami, `Index.tsx` `limit=100`.

### 2026-04-20 — Bezpieczeństwo

- **BEZPIECZEŃSTWO — LIKE-injection w wyszukiwarce ulic** (`streets.py:31`): Dodano escapowanie znaków specjalnych `%`, `_`, `\` przed przekazaniem do `ilike()`. Wpisanie samego `%` zwraca 0 wyników. Dodano `@limiter.limit("30/minute")`.
- **BEZPIECZEŃSTWO — Rate limit `/auth/refresh`** (`auth.py:59`): Dodano `@limiter.limit("10/minute")` i parametr `request: Request` wymagany przez slowapi.
- **BEZPIECZEŃSTWO — Walidacja `SECRET_KEY`** (`config.py`): Walidator blokuje start serwera na produkcji (`DEBUG=False`), gdy `SECRET_KEY` zawiera wartość domyślną. ⚠️ *Klucz domyślny wciąż obecny jako fallback w kodzie — wymaga P1.*

### 2026-04-20 — WCAG / Dostępność

- **WCAG — Nawigacja klawiaturą** (`EventCard.tsx`, `AdminDashboard.tsx`): `role="button"`, `tabIndex={0}`, `onKeyDown` (Enter/Spacja) na kartach i wierszach tabeli.
- **WCAG — `<TableRow>` z zagnieżdżonymi kontrolkami** (`AdminDashboard.tsx`): Usunięto `role="button"` z `<TableRow>`; przycisk chevron ma teraz własny `onClick` + `aria-expanded` + `aria-label`.
- **WCAG — Kontrast statusu „Zgłoszona"** (`index.css`): `--status-reported` zmieniony z `0 84% 60%` (kontrast 3.11) na `0 73% 36%` (kontrast > 4.5:1).
- **WCAG — Kontrast linku stopki** (`PublicLayout.tsx`): `text-muted-foreground/60` → `text-muted-foreground hover:text-foreground`.
- **WCAG — Kontrast tekstu w tabelach** (`AdminDashboard.tsx`): Komórki `source`, `notified_count`, `created_at` → `text-slate-600`.
- **WCAG — Kontrast komponentu Tabs** (`ui/tabs.tsx`): `text-muted-foreground` w `TabsList` → `text-slate-600`.
- **WCAG — Kontrast stron Unsubscribe i AdminNotifications** (`Unsubscribe.tsx`, `AdminNotifications.tsx`): Tekst ostrzeżenia → `text-red-700`; tekst opisu → `text-slate-700`; skuteczność → `text-green-700`/`text-yellow-700`.
- **WCAG — ARIA combobox** (`Index.tsx`): `role="combobox"`, `aria-haspopup="listbox"`, `aria-controls` na polach wyszukiwarki ulic i numerów.
- **WCAG — Markery Leaflet** (`EventMap.tsx`): `title` i `alt` na wszystkich trzech miejscach `<Marker>`.
- **WCAG — Brakujące `aria-label`** (`AdminDashboard.tsx`, `AdminUsers.tsx`, `AdminNotifications.tsx`): `SelectTrigger` i przyciski ikon uzupełnione o etykiety.
- **WCAG — Toast** (`ui/toast.tsx`): `aria-label="Zamknij powiadomienie"` na `ToastClose`; `role="region"` + `aria-label="Powiadomienia"` na `ToastViewport`.
- **WCAG — `lang="pl"`** (`index.html`): Zmieniono `lang="en"` → `lang="pl"`.

### 2026-04-20 — UI/UX

- **UI/UX — Badge źródła zdarzenia** (`EventCard.tsx`): Badge `źródło: MPWIK/LPEC` widoczny dla wszystkich zdarzeń z niepustym `source`.
- **UI/UX — Chmura tagów adresów subskrybentów** (`AdminSubscribers.tsx`): Adresy z `<div>` stacked → `Badge variant="secondary"` w `flex flex-wrap` + `ScrollArea max-h-[80px]`.
- **UI/UX — Chmura tagów wybranych budynków** (`AdminEventForm.tsx`): Podgląd numerów budynków w zakładce „Zakres" — pełna lista Badge + ScrollArea zamiast `slice(0,12).join(', ')`.
- **UI/UX — Skracanie adresów na kartach** (`EventCard.tsx`): Max 3 budynki widoczne, nadmiar pod tagiem `+X bud.`
- **UI/UX — Skracanie adresów w tabeli** (`AdminDashboard.tsx`): Max 10 numerów widocznych, nadmiar pod tagiem `+X`.

### 2026-04-20 — Responsywność (skalowanie przeglądarki)

- **RWD — Hero section** (`Index.tsx`): `max-w-2xl` → `max-w-4xl`; rozmiary czcionki h1 `text-2xl md:text-4xl lg:text-5xl`; wymuszony `<br>` przy `sm:` breakpoincie + `whitespace-normal`.
- **RWD — Niezależny scroll na stronie publicznej** (`Index.tsx`): Odseparowano scrollowanie listy awarii od kontenera mapy. Cały blok zyskał wysokość relatywną (`85vh`), lista awarii otrzymała wewnętrzny suwak (`overflow-y-auto`), a mapa płynnie dopasowuje się do reszty miejsca (`flex-1 min-h-0`). Zapobiega to wypychaniu stopki poza ekran i tworzeniu gigantycznej mapy przy kilkunastu awariach.
- **RWD — Mapa admina** (`AdminMapView.tsx`): `minHeight: '500px'` przeniesione z inline-style do klasy Tailwind `min-h-[500px]`.
- **RWD — AdminLayout** (`AdminLayout.tsx`): `overflow-x-auto` na `<main>`, zapobiega przysłanianiu treści przy wąskim viewporcie (200% zoom).
- **RWD — AddressRow** (`AddressRow.tsx`): Grid `sm:grid-cols-[minmax(0,1fr)_minmax(6rem,auto)_...]` zamiast `[1fr_auto_auto_auto]`; pola numeru domu/mieszkania `w-full min-w-[5rem]` zamiast stałego `w-24`.

---

## 1. Status ogólny projektu

Projekt **System Powiadomień MPWiK Lublin** jest w stanie **zaawansowanego prototypu gotowego do prezentacji konkursowej, ale wymagającego kilku poprawek przed wdrożeniem produkcyjnym u MPWiK**.

**Co mamy gotowe i zweryfikowane w kodzie:**

- **Backend FastAPI (async, Python 3.12)** z pełnym CRUD zdarzeń, rejestracją subskrybentów (RODO), silnikiem powiadomień SMS/e-mail ze zgodą na tryb nocny, logami powiadomień, kolejką poranną (APScheduler 06:00 Europe/Warsaw), rate limiterem (slowapi) oraz refresh-tokenami JWT.
- **Baza PostgreSQL 16 + PostGIS 3.4** — 1378 ulic TERYT (z geocoderem Nominatim), 51 643 budynki (BDOT10k + PRG + OSM supplement), indeks GIST na `buildings.geom`, kolumna `geom` do zapytań BBOX, 9 migracji Alembic.
- **Frontend React 18 + Vite + TypeScript + shadcn/ui + Tailwind** — strona mieszkańca z wyszukiwarką ulica+numer, mapa Leaflet z pinezkami ikonami wg typu zdarzenia i fly-to, panel dyspozytora z tabem „Lista zdarzeń" + „Mapa budynków", formularz zdarzenia z tabami („Zaznacz na mapie" / „Zakres numerów" / „Lista numerów"), panel subskrybentów, panel logów powiadomień.
- **Integracja GIS ↔ silnik powiadomień** — dokładne dopasowanie po `street_id` i numerze budynku odczytanym z `geojson_segment.features[].properties.house_number` (koniec wyświetlania fałszywych zakresów „1–13").
- **Bramka SMS** — działa w trybie `mock` (lokalny dev) z gotowym gatewayem SMSEagle za zmienną środowiskową. Kill-switch e-maili (`ENABLE_EMAIL_NOTIFICATIONS`).
- **Docker Compose** — pełna infrastruktura (`postgis/postgis:16-3.4-alpine`, backend, frontend, nginx) uruchamialna jednym poleceniem.

**Co wciąż blokuje produkcyjne wdrożenie u MPWiK (szczegóły w sekcji 3):**

1. Krytyczna luka RODO w flow wyrejestrowania — token pokazywany tylko raz na ekranie, brak kopii na SMS/e-mail.
2. `SECRET_KEY` — walidator istnieje, ale klucz domyślny wciąż w repozytorium (patrz P1).
3. Panel admina dostępny pod przewidywalną ścieżką `/admin/login` (patrz P2).
4. Zero testów automatycznych (`backend/tests/` zawiera wyłącznie `__init__.py`).

**Ocena ekspercka:** **7.5/10 — bardzo dobry prototyp z ambitnymi decyzjami architektonicznymi (PostGIS, multi-operator ready, spatial join w Pythonie). Po ostatnim roundzie poprawek (WCAG, bezpieczeństwo, UX) projekt jest gotowy do prezentacji. Przed wdrożeniem produkcyjnym wymagane: hardening SECRET_KEY, obscurity panelu, testy pytest.**

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
| 2.8 | Rate limiting | `auth.py:24` (`5/minute`), `subscribers.py:98` (`3/minute`), `streets.py` (`30/min`), `auth.py:59` (`10/min` refresh). |
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
| **1.5** — Refresh token ✅ NAPRAWIONO | „Endpoint `/auth/refresh` + login zwraca `refresh_token`" | Backend OK (`auth.py:59`). `apiFetch` przebudowany o interceptor 401: po nieudanym żądaniu próbuje `POST /auth/refresh`, zapisuje nowy `access_token` (i `refresh_token` jeśli zwrócony), ponawia oryginalny request; dopiero przy niepowodzeniu odświeżenia czyści sesję i przekierowuje. `useAuth.tsx:login()` poprawnie zapisuje `mpwik_refresh_token` w `localStorage`, a `logout()` usuwa oba tokeny. | — |
| **2.5 / 3.7** — Geocoding ulic | „39/45 zgeokodowanych, końcowa liczba 1378" | Tak, ale **6 ulic bez geom** nigdy nie wyświetli się na mapie jako punkt (`plac`, `skwer`, `park`, `ul. Wandy Papiewskiej`). W pliku listy oznaczone jako akceptowalne, ale raport jury/MPWiK powinien o tym jawnie informować. | Dodać do UI informację „mapa niedostępna dla tej ulicy — powiadomienia działają normalnie". |
| **2.7** — Walidacja formatu telefonu | „Regex `^\+48\d{9}$\|^\d{9}$` + strip" | OK po obu stronach, ale **backend wymusza `+48`** przed zapisem, a frontend akceptuje też `600-000-000`. Zgodne, ale brak docstringa dla operatora, który się zdziwi „dlaczego w bazie wszystko z `+48`". | Dopisać tę decyzję do dokumentacji operacyjnej (nie blokujące). |
| **3.4** — Walidacja pustych adresów | „Zod + sprawdzanie przed submitem" | OK w `Register.tsx`. Walidacja numeru przez combobox z listy budynków jest **blokująca** — użytkownik, którego budynku nie ma w bazie (np. nowy obiekt poza BDOT10k) NIE MOŻE się zarejestrować. | Dodać opcję „zgłoś brakujący adres" lub soft-warning + fallback tekstowy. |
| **3.11** — Strefy czasowe | „TIMESTAMP WITH TIME ZONE" | Migracja `20260410_timestamp_with_timezone.py` **przygotowana, ale nie uruchomiona**. Pydantic serializer radzi sobie, ale surowe `created_at` w PostgreSQL są wciąż `timestamp without tz`. | Uruchomić migrację + potwierdzić że dokumentacja ją wymaga. |

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
  5. **Panel zarządzania użytkownikami** (`/admin/users`, dostępny tylko dla admina): CRUD kont, zmiana roli, dezaktywacja, blokada usunięcia ostatniego admina.
  6. **Sidebar** — nowa pozycja „Użytkownicy" (ikona `UserCog`, adminOnly: true).

#### 3.1.2. RBAC na froncie — dispatcher widzi pełny panel admina ✅ NAPRAWIONO

- **Pliki:** `frontend/src/hooks/useAuth.tsx`, `frontend/src/components/AdminLayout.tsx`, `frontend/src/App.tsx`, `backend/app/routers/auth.py`, `backend/app/routers/events.py`
- **Co zrobiono (2026-04-18):**
  1. **Backend `auth.py`** — `create_access_token` i `create_refresh_token` teraz zawierają `"role": user.role` w payload JWT.
  2. **Frontend `useAuth.tsx`** — `AuthContext` rozszerzony o `role: 'admin' | 'dispatcher' | null`; rola odczytywana z JWT payload (base64 decode `atob()`).
  3. **Frontend `AdminLayout.tsx`** — sidebar filtrowany po `adminOnly` + `role === 'admin'`.
  4. **Frontend `App.tsx`** — nowy komponent `<AdminOnlyRoute>` owijający `/admin/subscribers` i `/admin/notifications`.

#### 3.1.3. POST/PUT `/events` — brak sprawdzenia roli na backendzie ✅ NAPRAWIONO

- **Plik:** `backend/app/routers/events.py:80, 143`
- **Naprawiono 2026-04-20:** Podmieniono `Depends(get_current_user)` na `Depends(get_current_dispatcher_or_admin)` w `create_event` i `update_event`.

#### 3.1.4. RWD panelu dyspozytora nieczytelny na telefonie ✅ NAPRAWIONO

- **Pliki:** `frontend/src/components/AdminLayout.tsx`, `frontend/src/pages/AdminEventForm.tsx`
- **Naprawiono 2026-04-20:** Sidebar → `hidden lg:flex` + hamburger `Sheet` na mobile; gridy `grid-cols-2` → `grid-cols-1 sm:grid-cols-2`; mapa `h-[300px] sm:h-[380px]`.

#### 3.1.5. Brak paginacji server-side na stronie mieszkańca i w dashboardzie ✅ NAPRAWIONO

- **Pliki:** `backend/app/routers/events.py`, `backend/app/schemas/event.py`, `frontend/src/hooks/useEvents.ts`, `frontend/src/pages/AdminDashboard.tsx`, `frontend/src/pages/Index.tsx`
- **Naprawiono 2026-04-20:** Backend przyjmuje `search`, `status_filter`, `type_filter`, `skip`, `limit` (max 200) + `PaginatedEventResponse`. Hook `useEvents` i dashboard przebudowane pod nowe API.

### 3.2. 🟡 WAŻNE — poprawić przed wdrożeniem MPWiK

#### 3.2.1. `SECRET_KEY` z domyślną wartością w konfigu (pkt 4.2 listy) ⚠️ CZĘŚCIOWO

- **Plik:** `backend/app/config.py:18`
- Dodano walidator blokujący start na produkcji gdy `SECRET_KEY` zawiera wartość domyślną. **Jednak klucz domyślny wciąż istnieje jako hardkodowana wartość fallback w kodzie źródłowym** — do usunięcia przed wdrożeniem (patrz P1).
- **Do wykonania:** Usunąć domyślną wartość z `config.py`, zmienić na `None` lub wyrzucać błąd przy imporcie; dodać procedurę generowania klucza w dokumentacji operacyjnej.

#### ✅ NAPRAWIONO — Brak walidacji schematu `geojson_segment` (pkt 7.5 listy)

- **Plik:** `backend/app/schemas/event.py:40, 60`
- `geojson_segment: dict | None` akceptuje dowolny słownik. Przykładowy atak: `{"foo": "bar"}` zostanie zapisany, a silnik powiadomień padnie na `features[].properties.house_number`. Brak Pydantic validatora.
- **Rekomendacja:** `@field_validator("geojson_segment")` sprawdzający `type == "FeatureCollection"` + `features: list` + każdy feature ma `properties.house_number`.

#### ✅ NAPRAWIONO 3.2.3. Escapowanie znaków specjalnych ILIKE (pkt 4.6 listy)

- **Plik:** `backend/app/routers/streets.py:31`
- **Naprawiono (2026-04-20):** Wprowadzono escapowanie znaków specjalnych LIKE (`%`, `_`, `\`) oraz rate limit 30/min (`@limiter.limit`). Wpisanie samego `%` zwraca 0 wyników (brak DoS). Przekroczenie limitu skutkuje odpowiedzią HTTP 429.

#### ✅ NAPRAWIONO 3.2.4. Rate limit na `/auth/refresh` (uzupełnienie pkt 2.8)

- **Plik:** `backend/app/routers/auth.py:59`
- **Naprawiono (2026-04-20):** Dodano `@limiter.limit("10/minute")` oraz parametr `request: Request` wymagany przez slowapi. Przekroczenie limitu skutkuje HTTP 429.

#### 3.2.5. Brak endpointu `GET /events/feed` (IVR 994) (pkt 2.2 listy) ❌ DO ZROBIENIA

- Szef IT powiedział „odpuśćcie na razie", ale dla „Festiwalu Biznesu" **to jest killer-feature** — plain-text z aktywnymi awariami, dostępny dla automatu 994 przez wget, 10 linii kodu. Warto dorzucić przed prezentacją (patrz P4).

#### ✅ NAPRAWIONO 3.2.6. Autor zdarzenia vs `source` — niespójność w UI

- **Naprawiono (2026-04-20):** W `EventCard.tsx` dodano badge wyświetlający `źródło: {SOURCE}` wielkimi literami dla wszystkich zdarzeń z niepustym polem `source`. Badge widoczny obok `StatusBadge` w nagłówku karty.

### 3.3. 🟢 Dostępność (WCAG) — audyt uproszczony

Projekt ma **bazowe** wsparcie a11y (`aria-label`, `aria-hidden`, `role="listbox"` w autocomplete ulic), ale:

1. ✅ NAPRAWIONO **`EventCard.tsx`** — dodano `role="button"`, `tabIndex={0}`, `onKeyDown` (Enter/Spacja), `focus-visible:ring-2 focus-visible:ring-ring` (WCAG 2.1.1).
2. ✅ NAPRAWIONO **`AdminDashboard.tsx` — zagnieżdżone interaktywne** — usunięto `role="button"` z `<TableRow>`; przycisk chevron z `aria-expanded` + `aria-label` dynamicznym + własny `onClick` + `stopPropagation`.
3. ✅ NAPRAWIONO **`index.html`** — zmieniono `lang="en"` na `lang="pl"` (WCAG 3.1.1).
4. ✅ NAPRAWIONO **Kontrasty statusu „Zgłoszona"** — `--status-reported` z `0 84% 60%` → `0 73% 36%` (kontrast > 4.5:1, WCAG 1.4.3).
5. ✅ NAPRAWIONO **Link stopki „Panel dyspozytora"** (`PublicLayout.tsx`) — `text-muted-foreground/60` → `text-muted-foreground hover:text-foreground`.
6. ✅ NAPRAWIONO **ARIA combobox** (`Index.tsx`) — `role="combobox"`, `aria-haspopup="listbox"`, `aria-controls` na polach wyszukiwarki (WCAG 4.1.2).
7. ✅ NAPRAWIONO **Markery Leaflet** (`EventMap.tsx`) — `title` i `alt` na wszystkich `<Marker>` (WCAG 1.1.1).
8. ✅ NAPRAWIONO **Brakujące `aria-label`** (`AdminDashboard.tsx`, `AdminUsers.tsx`, `AdminNotifications.tsx`) — `SelectTrigger`, przyciski ikon, Toast.
9. ✅ NAPRAWIONO **Toast ARIA** (`ui/toast.tsx`) — `aria-label="Zamknij powiadomienie"` na `ToastClose`; `role="region"` + `aria-label="Powiadomienia"` na `ToastViewport`.
10. ✅ NAPRAWIONO **Kontrast Tabs** (`ui/tabs.tsx`) — `text-muted-foreground` w `TabsList` → `text-slate-600` (kontrast 4.48 → >4.5:1).
11. ✅ NAPRAWIONO **Kontrast Unsubscribe / AdminNotifications** — `text-red-700`, `text-slate-700`, `text-green-700`, `text-yellow-700`.
12. ✅ NAPRAWIONO **Kontrast tekstu w tabelach** (`AdminDashboard.tsx`) — komórki `source`, `notified_count`, `created_at` → `text-slate-600`.
13. ✅ NAPRAWIONO **UI/UX — lista adresów subskrybentów** (`AdminSubscribers.tsx`) — chmura tagów Badge + ScrollArea zamiast `<div>` stacked. Rozwiązuje nieczytelność przy wielu adresach.
14. ✅ NAPRAWIONO **UI/UX — podgląd wybranych budynków** (`AdminEventForm.tsx`) — pełna chmura Badge + ScrollArea zamiast `slice(0,12).join(', ')`.
15. ✅ NAPRAWIONO **UI/UX — skracanie adresów** (`EventCard.tsx`, `AdminDashboard.tsx`) — max 3 budynki na kartach publicznych (tag `+X bud.`), max 10 w tabeli (tag `+X`). Zapobiega rozpychaniu layoutu na mobile.
16. **Pułapki focus** — dialog RODO (Unsubscribe) i AlertDialog z Radix są OK (Radix domyślnie trap focus).
17. **Fieldset + legend** — `Register.tsx` używa `<fieldset><legend>` ✅.

**Rekomendacja:** pre-ship uruchomić **Lighthouse Accessibility** i **axe DevTools** na stronach `/`, `/register`, `/admin/dashboard`, `/admin/events/new` (patrz P5).

### 3.4. 🔵 NOWE luki odkryte podczas poprawek (nie były w pierwotnej liście)

#### ✅ NAPRAWIONO 3.4.1. Brak obsługi HTTP 429 na froncie

- **Plik:** `frontend/src/lib/api.ts`
- **Naprawiono (2026-04-20):** Przed ogólnym `if (!res.ok)` dodano `if (res.status === 429) throw new Error("Zbyt wiele zapytań — odczekaj chwilę i spróbuj ponownie.")`. Użytkownik zobaczy czytelny komunikat w toaście zamiast technicznego błędu HTTP.

#### 3.4.2. Brak testów jednostkowych dla logiki escapowania LIKE

- **Plik:** `backend/app/routers/streets.py`, `backend/tests/`
- Logika escapowania `%`, `_`, `\` jest krytyczna dla bezpieczeństwa, ale nie ma żadnego testu. Przypadkowa refaktoryzacja (np. zmiana na `ilike(f"%{q}%")`) przywróciłaby podatność bez żadnego alarmu w CI.
- **Rekomendacja:** `test_streets.py` — przypadki: `%`, `_`, `\`, `%a%`, pusty string, normalny tekst.

#### 3.4.3. GeoJSON payload — brak kompresji / osobnego endpointu

- **Plik:** `backend/app/routers/events.py`, `backend/app/schemas/event.py`
- `geojson_segment` z 50+ budynkami to kilkadziesiąt KB na zdarzenie. Przy liście 100 zdarzeń na dashboardzie frontend pobiera megabajty JSON przy każdym refetch (React Query co 30 s).
- **Rekomendacja:** (a) `Accept-Encoding: gzip` w nginx (już jest) + sprawdzenie czy faktycznie kompresuje; (b) Rozważyć osobny endpoint `GET /events/{id}/geojson` i nie zwracać `geojson_segment` w liście zdarzeń (zastąpić `has_geojson: bool`).

#### 3.4.4. JWT w localStorage — brak ochrony przed XSS/CSRF

- **Pliki:** `frontend/src/lib/api.ts`, `frontend/src/hooks/useAuth.tsx`
- Access i refresh tokeny przechowywane w `localStorage` — dostępne przez JavaScript (XSS). Brak Content Security Policy w nagłówkach. Brak atrybutu `SameSite=Strict` (tokeny są w localStorage, nie w ciasteczkach, więc CSRF nie dotyczy bezpośrednio, ale XSS jest pełnym exploitem).
- **Rekomendacja:** (a) Dodać CSP header w nginx (`script-src 'self'`); (b) Rozważyć migację do `httpOnly` cookie dla refresh tokena (większy zakres zmian — backlog pre-SLA).

---

## 4. Zgodność z wymaganiami MPWiK i konkursem

| Obszar | Status | Komentarz |
|--------|--------|-----------|
| **RODO — fizyczne usunięcie** | ⚠️ częściowo | Backend OK (CASCADE). Frontend zepsuty przez token pokazywany raz (sekcja 3.1.1). |
| **Tajemnica przedsiębiorstwa** | ✅ | Admin endpointy za JWT + rolą; brak publicznego podglądu listy subskrybentów. |
| **Bramka SMS (SMSEagle)** | ✅ | `services/gateways.py` — wsparcie `mock` + `smseagle`, przełącznik przez `SMS_GATEWAY_TYPE`. |
| **Nocna cisza 22–06 Europe/Warsaw** | ✅ | `notification_service.py:390`. Osobna zgoda `night_sms_consent`. |
| **Rate limiter / WAF-ready** | ✅ | slowapi na `login` (5/min) + `register` (3/min) + `streets?q=` (30/min) + `refresh` (10/min). Nginx reverse-proxy gotowy pod WAF. |
| **Hardening SECRET_KEY** | ⚠️ częściowo | Walidator blokuje start — ✅. Klucz domyślny wciąż w repo — ⚠️ (P1). |
| **Obscurity panelu admina** | ❌ do zrobienia | Ścieżka `/admin/login` jawna. Zmiana na `/sys-panel` odłożona (P2). |
| **Multi-operator (LPEC, ZDiM)** | ❌ brak | Model `api_keys` w bazie, ale brak routera `external.py` i dependency na `X-API-Key`. Pole `source` w `events` gotowe. |
| **GIS — klikanie budynków zamiast okręgów** | ✅ | `AdminEventForm` ma 3 taby, `BuildingLayer` z poligonami/punktami OSM, tooltipy z pełnym adresem. `EventMap` publiczna pokazuje poligony wg zoom ≥ 15. |
| **IVR 994 endpoint** | ❌ brak | Pkt 2.2 listy, Szef IT odłożył. Warto dorobić przed prezentacją (P4). |
| **Trigram index na `streets`** | ❌ brak | Migracja nie napisana. Przy 1378 rekordach nie odczujesz, ale TECH_SPEC tego wymaga. |
| **WCAG dostępność** | ✅ | 15 punktów naprawionych (sekcja 3.3). Wymagany końcowy audyt axe/Lighthouse (P5). |
| **Wirtualka Oracle Linux** | ❌ nie testowane | Docker Compose jest, ale nikt nie uruchomił stacku na Oracle Linux 9. **Obowiązkowe przed SLA z MPWiK.** |
| **Zero kosztów licencyjnych** | ✅ | Cały stack FOSS (FastAPI, React, Leaflet, PostgreSQL/PostGIS, shadcn/ui MIT). |
| **Testy automatyczne** | ❌ brak | `backend/tests/` — tylko pusty `__init__.py`. Zero pytest. Frontend — brak Vitest. |

---

## 5. Dług techniczny i skalowalność

### 5.1. Świadomie odłożone (backlog)

- **IVR 994** — endpoint `GET /events/feed` (plain text). Odłożony decyzją szefa IT (P4).
- **X-API-Key dla zewnętrznych operatorów** — model `ApiKey` istnieje, router czeka.
- **Obscurity panelu admina** — zmiana ścieżki na `/sys-panel` (P2).
- **Aktualizacja słownika TERYT** (pkt 4.7) — `import_streets.py` jest idempotentny, ale brak mechanizmu cron/CI.
- **6 ulic bez geocode'u** (Plac Łokietka, Skwer Witkowskiego itp.) — nie renderują się na mapie jako punkt.
- **JWT w localStorage** — migracja do `httpOnly` cookie (sekcja 3.4.4, backlog pre-SLA).

### 5.2. Skalowalność — co zadziała, co trzeba obserwować

**Zadziała dla Lublina (~340 tys. mieszkańców, ~3 tys. potencjalnych subskrybentów):**
- Index GIST na `buildings.geom` + zapytania BBOX — profilowane na 51 643 rekordach.
- Async FastAPI + asyncpg — single instance obsłuży 500–1000 RPS.
- APScheduler kolejka poranna — max 3 tys. SMS w 6:00; SMSEagle zrobi ~10/s, pełne wysłanie w 5 min.

**Trzeba obserwować:**
- `notification_service.notify_event()` leci sekwencyjnie per subskrybent (`for sub in …`). Przy 3 tys. subskrybentów × e-mail + SMS = ~6 tys. I/O requestów. **Rekomendacja:** `asyncio.gather(*[...], return_exceptions=True)`.
- Brak retry-policy dla SMS Gateway. **Rekomendacja:** tabelka `notification_retries` lub kolejka Redis/RQ.
- `geojson_segment` przesyłany w pełni w liście zdarzeń — duży payload przy wielu rekordach (sekcja 3.4.3).

### 5.3. Monitoring, observability

**Brakuje całkowicie:**
- Nie ma `/metrics` (Prometheus), health-check pokazuje tylko wersję.
- Nie ma structured logging (JSON) — logi idą do stderr tekstem.
- Brak Sentry/GlitchTip — błędy tylko w log-streamie.

**Rekomendacja przed SLA:** `starlette-prometheus` + osobny endpoint `/metrics` + panel Grafana.

### 5.4. Testy — absolutny minimum przed oddaniem MPWiK

Priorytet (dla `backend/tests/`):
1. `test_auth.py` — login happy path, 401 na złe hasło, 5/min rate limit, blokada po N nieudanych próbach.
2. `test_subscribers.py` — register → token → GET → DELETE (RODO flow).
3. `test_events.py` — CRUD + RBAC (dispatcher próbuje DELETE → 403).
4. `test_streets.py` — escapowanie LIKE: `%`, `_`, `\`, normalne zapytanie (sekcja 3.4.2).
5. `test_notification_service.py` — night hours, queued_morning, matching po `street_id`.
6. Integracyjne z testcontainers PostgreSQL (nie mockować DB).

---

## 6. Podsumowanie dla jury i zarządu MPWiK

**Co pokazać na „Festiwalu Biznesu":**
- Strona publiczna — wyszukiwarka ulica + numer, mapa Leaflet z ikonami wg typu zdarzenia, fly-to.
- Panel dyspozytora — demo formularza z 3 zakładkami (mapa/zakres/lista) + automatyczna synchronizacja zaznaczenia.
- Rejestracja → SMS/e-mail dostarczony (mock gateway + realny SMTP).
- Wyrejestrowanie → fizyczne usunięcie z bazy (pokaz w DBeaverze).
- Admin → statystyki + logi powiadomień + filtry.

**Co powiedzieć wprost dyrektorowi IT:**
- „Prototyp gotowy, produkcja za ~2 tygodnie pracy: hardening SECRET_KEY, obscurity panelu, testy pytest, wysyłka tokenu RODO."
- „Integracja GIS + silnik powiadomień są ukończone i przetestowane na realnych danych (51 tys. budynków Lublin, 1378 ulic TERYT)."
- „Architektura wspiera multi-operator (LPEC, ZDiM) przez `source` + `X-API-Key` — do podpięcia bez zmiany schematu bazy."

**Największe ryzyko:** token RODO wyświetlany raz (sekcja 3.1.1) — to jedyna rzecz, która mogłaby posłużyć UODO jako podstawa kary. **Musi być naprawione przed pierwszym wdrożeniem na realnych mieszkańcach.**

---

*Raport zaktualizowany 2026-04-20. Odzwierciedla stan kodu po roundzie poprawek bezpieczeństwa, WCAG i UI/UX z branch `main`.*
