# Stan projektu — System Powiadomień MPWiK Lublin

**Data raportu:** 2026-04-18 (aktualizacja: 2026-04-20 — pełny audyt kodu)
**Autor:** Audyt ekspercki (Główny Architekt Systemów + Audytor Bezpieczeństwa/UX)
**Odbiorca:** Zarząd MPWiK Lublin, Dyrektor IT, Jury „Festiwalu Biznesu".

---

## 🔥 PRIORYTETY (DO ZROBIENIA)

Punkty wymagające natychmiastowej uwagi przed wdrożeniem produkcyjnym:

| # | Priorytet | Opis | Plik |
|---|-----------|------|------|
| P1 | 🔴 KRYT. | **SECRET_KEY — dokończenie hardeningu** — walidator blokuje start na produkcji, ale klucz domyślny wciąż istnieje w repozytorium i w `.env`. | `backend/app/config.py`, `backend/.env` |
| P2 | 🔴 KRYT. | **`DELETE /events/{id}` — brak kontroli roli** — endpoint używa `get_current_user` zamiast `get_current_dispatcher_or_admin`. Każdy zalogowany użytkownik może usunąć dowolne zdarzenie. | `backend/app/routers/events.py:124` |
| P3 | 🔴 KRYT. | **Security by Obscurity — ukrycie panelu admina** — ścieżka `/admin/login` jawna w stopce i kodzie JS. Zmienić na `/sys-panel/login`. | `App.tsx`, `PublicLayout.tsx` |
| P4 | 🟡 WAŻNE | **Status zdarzeń niezgodny ze specyfikacją** — kod używa `w_naprawie`, CLAUDE.md definiuje `potwierdzona → trwajaca → zakonczono`. Brakuje stanów pośrednich. | `backend/app/schemas/event.py:24`, `frontend` |
| P5 | 🟡 WAŻNE | **`DEBUG=true` i `--reload` w produkcji** — `.env` ma `DEBUG=true`, docker-compose uruchamia uvicorn z `--reload`. Loguje wszystkie zapytania SQL. | `backend/.env`, `docker-compose.yml:26` |
| P6 | 🟡 WAŻNE | **Port DB 5433 wystawiony na zewnątrz** — PostgreSQL dostępny bezpośrednio z hosta. W produkcji musi być usunięty. | `docker-compose.yml:12` |
| P7 | 🟡 WAŻNE | **Endpoint IVR 994** (`GET /events/feed`) — plain-text z aktywnymi awariami dla automatu telefonicznego. Killer-feature na Festiwal Biznesu, ~10 linii kodu. | `backend/app/routers/events.py` |
| P8 | 🟡 WAŻNE | **Testy penetracyjne `/auth/login`** — rate limit 5/min jest, ale brak blokady IP po N próbach, brak CAPTCHA, brak alertu e-mail do admina. | `backend/app/routers/auth.py` |
| P9 | 🟡 WAŻNE | **E-mail subskrybenta logowany plaintext** — `subscribers.py:175` loguje `email=%r`. Naruszenie RODO / zasady minimalizacji danych w logach. | `backend/app/routers/subscribers.py:175` |
| P10 | 🟢 NISKI | **Ostateczny audyt WCAG axe/Lighthouse** — po wszystkich poprawkach UI/UX wymagana pełna weryfikacja na stronach `/`, `/register`, `/admin/dashboard`, `/admin/events/new`. | — |
| P11 | 🟢 NISKI | **Testy jednostkowe escapowania LIKE** — logika w `streets.py` bez pokrycia testami; regresja przywróciłaby podatność DoS. | `backend/tests/test_streets.py` |
| P12 | ✅ GOTOWE | **Obsługa HTTP 429 na froncie** — dodano specjalny case przed `!response.ok`. | `frontend/src/lib/api.ts` |

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
- **BEZPIECZEŃSTWO — Obsługa HTTP 429** (`api.ts`): Przed ogólnym `if (!res.ok)` dodano `if (res.status === 429)` z czytelnym komunikatem dla użytkownika.

### 2026-04-20 — WCAG / Dostępność

- **WCAG — Nawigacja klawiaturą** (`EventCard.tsx`, `AdminDashboard.tsx`): `role="button"`, `tabIndex={0}`, `onKeyDown` (Enter/Spacja) na kartach i wierszach tabeli.
- **WCAG — `<TableRow>` z zagnieżdżonymi kontrolkami** (`AdminDashboard.tsx`): Usunięto `role="button"` z `<TableRow>`; przycisk chevron ma teraz własny `onClick` + `aria-expanded` + `aria-label`.
- **WCAG — Kontrast statusu „Zgłoszona"** (`index.css`): `--status-reported` zmieniony z `0 84% 60%` (kontrast 3.11) na `0 73% 36%` (kontrast > 4.5:1).
- **WCAG — Kontrast linku stopki** (`PublicLayout.tsx`): `text-muted-foreground/60` → `text-muted-foreground hover:text-foreground`.
- **WCAG — Kontrast tekstu w tabelach** (`AdminDashboard.tsx`): Komórki `source`, `notified_count`, `created_at` → `text-slate-600`.
- **WCAG — Kontrast komponentu Tabs** (`ui/tabs.tsx`): `text-muted-foreground` w `TabsList` → `text-slate-600`.
- **WCAG — Kontrast stron Unsubscribe i AdminNotifications** (`Unsubscribe.tsx`, `AdminNotifications.tsx`): Tekst ostrzeżenia → `text-red-700`; tekst opisu → `text-slate-700`.
- **WCAG — ARIA combobox** (`Index.tsx`): `role="combobox"`, `aria-haspopup="listbox"`, `aria-controls` na polach wyszukiwarki ulic i numerów.
- **WCAG — Markery Leaflet** (`EventMap.tsx`): `title` i `alt` na wszystkich trzech miejscach `<Marker>`.
- **WCAG — Brakujące `aria-label`** (`AdminDashboard.tsx`, `AdminUsers.tsx`, `AdminNotifications.tsx`): `SelectTrigger` i przyciski ikon uzupełnione o etykiety.
- **WCAG — Toast** (`ui/toast.tsx`): `aria-label="Zamknij powiadomienie"` na `ToastClose`; `role="region"` + `aria-label="Powiadomienia"` na `ToastViewport`.
- **WCAG — `lang="pl"`** (`index.html`): Zmieniono `lang="en"` → `lang="pl"`.

### 2026-04-20 — Autouzupełnianie zakresów i edytowalna treść powiadomień

- **UX — Autocomplete pola "Nr posesji do"** (`AdminEventForm.tsx`): Pole `houseTo` w zakładce „Zakres numerów" otrzymało dropdown identyczny jak `houseFrom` — lista numerów filtrowana prefiksem, zamykana kliknięciem poza komponent (`houseToWrapperRef`).
- **Feature — Edytowalny kafelek treści powiadomienia** (`AdminEventForm.tsx`): Nad przyciskami Submit pojawia się `Card` z podglądem treści SMS/E-mail. Treść jest auto-generowana na podstawie (typ, ulica, skrócone numery, szacowany czas, opis). Po ręcznej edycji flaga `isMessageEdited=true` blokuje nadpisywanie; przycisk „Przywróć automatyczny" resetuje flagę. Licznik znaków ostrzega gdy przekracza 160 znaków (ponad 1 SMS).
- **Feature — `custom_message` w backendzie** (`models/event.py`, `schemas/event.py`, migracja `20260420_add_custom_message_to_events.py`): Nowa kolumna `Text nullable` w tabeli `events`. Pole dodane do `EventBase` i `EventUpdate`.
- **Feature — Serwis powiadomień respektuje `custom_message`** (`notification_service.py`): W `notify_event` przy nowym zdarzeniu: jeśli `event.custom_message` jest ustawiony, użyty zostaje jako `sms_text` i `email_body` zamiast auto-generowanego szablonu.

### 2026-04-20 — UI/UX

- **UI/UX — Badge źródła zdarzenia** (`EventCard.tsx`): Badge `źródło: MPWIK/LPEC` widoczny dla wszystkich zdarzeń z niepustym `source`.
- **UI/UX — Chmura tagów adresów subskrybentów** (`AdminSubscribers.tsx`): Adresy z `<div>` stacked → `Badge variant="secondary"` w `flex flex-wrap` + `ScrollArea max-h-[80px]`.
- **UI/UX — Chmura tagów wybranych budynków** (`AdminEventForm.tsx`): Podgląd numerów budynków — pełna lista Badge + ScrollArea zamiast `slice(0,12).join(', ')`.
- **UI/UX — Skracanie adresów na kartach** (`EventCard.tsx`): Max 3 budynki widoczne, nadmiar pod tagiem `+X bud.`
- **UI/UX — Skracanie adresów w tabeli** (`AdminDashboard.tsx`): Max 10 numerów widocznych, nadmiar pod tagiem `+X`.

### 2026-04-20 — Responsywność (skalowanie przeglądarki)

- **RWD — Hero section** (`Index.tsx`): `max-w-2xl` → `max-w-4xl`; rozmiary czcionki h1 `text-2xl md:text-4xl lg:text-5xl`.
- **RWD — Niezależny scroll na stronie publicznej** (`Index.tsx`): Odseparowano scrollowanie listy awarii od kontenera mapy (`85vh`, `overflow-y-auto`, `flex-1 min-h-0`).
- **RWD — Mapa admina** (`AdminMapView.tsx`): `minHeight: '500px'` → klasa Tailwind `min-h-[500px]`.
- **RWD — AdminLayout** (`AdminLayout.tsx`): `overflow-x-auto` na `<main>`, zapobiega przysłanianiu treści przy wąskim viewporcie.
- **RWD — AddressRow** (`AddressRow.tsx`): Grid `sm:grid-cols-[minmax(0,1fr)_minmax(6rem,auto)_...]` zamiast stałych szerokości.

---

## 1. Status ogólny projektu

Projekt **System Powiadomień MPWiK Lublin** jest w stanie **zaawansowanego prototypu gotowego do prezentacji konkursowej, ale wymagającego poprawek przed wdrożeniem produkcyjnym**.

**Co mamy gotowe i zweryfikowane w kodzie:**

- **Backend FastAPI (async, Python 3.12)** z pełnym CRUD zdarzeń, rejestracją subskrybentów (RODO), silnikiem powiadomień SMS/e-mail ze zgodą na tryb nocny, logami powiadomień, kolejką poranną (APScheduler 06:00 Europe/Warsaw), rate limiterem (slowapi) oraz refresh-tokenami JWT.
- **Baza PostgreSQL 16 + PostGIS 3.4** — 1378 ulic TERYT, 51 643 budynki (BDOT10k + PRG + OSM), indeks GIST na `buildings.geom`, 10 migracji Alembic.
- **Frontend React 18 + Vite + TypeScript + shadcn/ui + Tailwind** — strona mieszkańca z wyszukiwarką ulica+numer, mapa Leaflet z pinezkami, panel dyspozytora z formularzem z 3 zakładkami, edytowalny podgląd treści SMS/e-mail, panel subskrybentów, panel logów powiadomień.
- **Integracja GIS ↔ silnik powiadomień** — dokładne dopasowanie po `street_id` i numerze budynku z `geojson_segment.features[].properties.house_number`.
- **Bramka SMS** — tryb `mock` (dev) + SMSEagle (produkcja) za zmienną środowiskową. Kill-switch e-maili.
- **Docker Compose** — pełna infrastruktura uruchamialna jednym poleceniem.

**Co blokuje produkcyjne wdrożenie:**

1. `DELETE /events` dostępny dla każdego zalogowanego użytkownika (P2 — krytyczna luka bezpieczeństwa).
2. `SECRET_KEY` — klucz domyślny wciąż w repozytorium (P1).
3. Panel admina pod przewidywalną ścieżką `/admin/login` (P3).
4. Zero testów automatycznych.

**Ocena ekspercka:** **7.5/10** — bardzo dobry prototyp z ambitnymi decyzjami architektonicznymi (PostGIS, multi-operator ready, spatial join w Pythonie). Gotowy do prezentacji konkursowej. Przed wdrożeniem produkcyjnym wymagane: naprawa P1-P3, hardening infrastruktury, testy pytest.

---

## 2. Weryfikacja listy poprawek

### 2.1. Pozycje w 100% zamknięte

| ID | Opis | Weryfikacja |
|----|------|-------------|
| 1.1 / 3.1 / 3.8 | Unsubscribe — flow z tokenem | `Unsubscribe.tsx` — dwuetapowy flow `GET` → dialog → `DELETE`. `subscribers.py:206` — fizyczne usuwanie, CASCADE na adresy. |
| 1.2 / 1.3 | Unique email/phone | Partial unique index `WHERE … IS NOT NULL` (migracja `20260417`) + HTTP 409 w `subscribers.py:117`. |
| 1.4 | `DELETE /events` (admin-only UI) | Frontend blokuje UI dla dyspozytora. ⚠️ Backend wymaga P2 — patrz niżej. |
| 1.6 | Nocna cisza w CET/CEST | `notification_service.py` — `datetime.now(ZoneInfo("Europe/Warsaw")).hour`. |
| 1.7 | Edycja zdarzenia ładuje dane | `App.tsx:47` — route `/admin/events/edit/:id`; form ładuje przez `getEvent(id)`. |
| 1.8 | `notify_event` obsługa błędów | `events.py:27` — `_log_task_exception` callback; pętla per-subskrybent w try/except. |
| 2.1 | Endpointy `/admin/stats\|subscribers\|notifications` | `admin.py` — 3 endpointy + `dependencies=[Depends(get_current_admin)]` na routerze. |
| 2.4 | `get_current_admin` RBAC | `dependencies.py:63` — HTTP 403 dla non-admin. |
| 2.6 | Scheduler porannej kolejki | `main.py:60` — `AsyncIOScheduler(tz="Europe/Warsaw")`, cron 06:00. |
| 2.8 | Rate limiting | `auth.py:24` (5/min), `subscribers.py:98` (3/min), `streets.py` (30/min), `auth.py:59` (10/min refresh). |
| 3.2 | `notified_count` w `EventResponse` | `events.py:55` — `event.notified_count = len(event.notifications)`. |
| 3.3 | Auto-redirect na 401 | `api.ts` — clear tokenów + redirect `/admin/login`. |
| 3.4 | Walidacja pustych adresów | `Register.tsx:112` + Zod schema. |
| 3.5 / 3.6 | Panel subskrybentów i logów | `AdminSubscribers.tsx`, `AdminNotifications.tsx` — React Query + paginacja server-side. |
| 3.7 | Geocoding ulic | `scripts/geocode_streets.py` — 1372/1378 ulic zgeokodowanych. |
| 3.11 | Strefy czasowe UTC → Europe/Warsaw | `schemas/event.py:9` `_utc_iso`, `lib/utils.ts` `parseUTC`. |
| 4.3 | CORS z `settings.CORS_ORIGINS` | `main.py:93` — parsowanie `,` + strip. ⚠️ Fallback `["*"]` gdy puste — patrz sekcja 3.5. |
| 4.9 | Kolumna „Źródło" w tabeli | `AdminDashboard.tsx:194`. |
| 4.12 | Notify tylko przy zmianie status/estimated_end | `events.py:195` — warunek `status_changed or estimated_end_changed`. |
| 4.13 | Konfiguracja logowania | `main.py:25` — `logging.config.dictConfig`, bez `print()`. |
| 4.15–4.18 | Retroaktywne powiadomienia + mapa + DELETE z powiadomieniem | Zweryfikowane w `notification_service.py` + `events.py`. |
| 7.1–7.4, 7.6–7.12 | Synchronizacja GIS ↔ notyfikacje | `AdminEventForm.tsx` — 3 taby spójne, `formatEventNumbers` w `lib/utils.ts`. |

### 2.2. Pozycje wymagające uzupełnienia przed oddaniem

| ID | Stan faktyczny | Co dopisać |
|----|----------------|------------|
| **1.5** Refresh token | Backend OK. `apiFetch` ma interceptor 401. ⚠️ Brak mutex — dwa równoległe requesty mogą wywołać dwa jednoczesne odświeżenia tokenu (race condition). | Dodać singleton promise lub mutex na `tryRefreshToken()`. |
| **2.5 / 3.7** Geocoding ulic | 6 ulic bez `geom` (place, skwery) — nie renderują się na mapie jako punkt. | Dodać do UI informację „mapa niedostępna dla tej ulicy — powiadomienia działają normalnie". |
| **3.4** Walidacja pustych adresów | Walidacja numeru przez combobox **blokująca** — budynek spoza BDOT10k uniemożliwia rejestrację. | Dodać opcję „zgłoś brakujący adres" lub soft-warning + fallback tekstowy. |
| **3.11** Strefy czasowe | Migracja `20260410_timestamp_with_timezone.py` przygotowana, ale **nie uruchomiona**. `SubscriberAddress.created_at` wciąż `TIMESTAMP WITHOUT TIME ZONE`. | Uruchomić migrację. |

---

## 3. Luki i błędy — pełny audyt kodu (2026-04-20)

### 3.1. 🔴 KRYTYCZNE — naprawić przed wdrożeniem

#### 3.1.1. RODO — token wyrejestrowania wysyłany powitalną wiadomością ✅ NAPRAWIONO

- **Plik:** `backend/app/services/notification_service.py` — `send_welcome_with_unsubscribe_token()`
- Token wysyłany przez SMS (priorytet) lub e-mail po rejestracji. Logowany jako `channel='welcome'` w `NotificationLog`. UI ekranu sukcesu informuje o kanale wysyłki.

#### 3.1.2. `DELETE /events/{id}` — brak sprawdzenia roli ❌ DO NAPRAWY (P2)

- **Plik:** `backend/app/routers/events.py:124`
- Endpoint używa `Depends(get_current_user)` zamiast `get_current_dispatcher_or_admin`.
- **Efekt:** Każdy zalogowany użytkownik (także dyspozytor, który nie powinien mieć prawa usuwania) może wywołać `DELETE /events/{id}`.
- **Naprawa:** Zmienić na `Depends(get_current_dispatcher_or_admin)` lub `get_current_admin()` — zależnie od decyzji biznesowej, kto może usuwać zdarzenia.

#### 3.1.3. SECRET_KEY hardkodowany w repo i w `.env` ⚠️ CZĘŚCIOWO (P1)

- **Pliki:** `backend/app/config.py:18`, `backend/.env:13`
- Walidator blokuje start na produkcji — ale domyślna wartość wciąż istnieje jako fallback.
- **Naprawa:** Usunąć domyślną wartość z `config.py` (zmienić na `None`), usunąć z `.env`, dodać do `.gitignore` i procedurę generowania klucza w dokumentacji operacyjnej.

#### 3.1.4. RBAC na froncie — dispatcher widzi pełny panel admina ✅ NAPRAWIONO (2026-04-18)

#### 3.1.5. POST/PUT `/events` — brak sprawdzenia roli na backendzie ✅ NAPRAWIONO (2026-04-20)

#### 3.1.6. RWD panelu dyspozytora ✅ NAPRAWIONO (2026-04-20)

#### 3.1.7. Brak paginacji server-side ✅ NAPRAWIONO (2026-04-20)

---

### 3.2. 🟡 WAŻNE — poprawić przed wdrożeniem MPWiK

#### 3.2.1. Status zdarzeń niezgodny ze specyfikacją ❌ DO NAPRAWY (P4)

- **Plik:** `backend/app/schemas/event.py:24`
- Kod: `EventStatus = Literal["zgloszona", "w_naprawie", "usunieta"]`
- CLAUDE.md definiuje maszynę stanów: `zgloszona → potwierdzona → trwajaca → zakonczono / usunieta`
- Brakuje stanów `potwierdzona`, `trwajaca`, `zakonczono`; stan `w_naprawie` nie istnieje w specyfikacji.
- **Wpływ:** Dyspozytor nie może oznaczyć zdarzenia jako „potwierdzone" ani „zakończone" — tylko „w naprawie" lub „usunięte". Nieprawidłowe komunikaty statusu wysyłane do mieszkańców.
- **Naprawa:** Uzgodnić z MPWiK ostateczną listę stanów, napisać migrację SQL (`UPDATE events SET status = ...`), zaktualizować schemat i frontend.

#### 3.2.2. `DEBUG=true` i `--reload` w produkcji ❌ DO NAPRAWY (P5)

- **Pliki:** `backend/.env:51`, `docker-compose.yml:26`
- `DEBUG=true` powoduje logowanie WSZYSTKICH zapytań SQL przez SQLAlchemy (`echo=settings.DEBUG` w `database.py`).
- `--reload` w uvicorn to tryb deweloperski — wyłącza cachowanie, monitoruje pliki, spowalnia aplikację.
- **Naprawa:** Oddzielne `.env.dev` / `.env.prod`; w produkcji `DEBUG=false`, usunąć `--reload`.

#### 3.2.3. Port bazy danych 5433 wystawiony publicznie ❌ DO NAPRAWY (P6)

- **Plik:** `docker-compose.yml:12` — `ports: - "5433:5432"`
- PostgreSQL dostępny bezpośrednio z hosta lub sieci lokalnej.
- **Naprawa:** Usunąć sekcję `ports` dla usługi `db` w konfiguracji produkcyjnej. Backend komunikuje się z DB przez sieć Docker wewnętrznie.

#### 3.2.4. CORS domyślnie `["*"]` gdy zmienna środowiskowa jest pusta

- **Plik:** `backend/app/main.py:93-94`
- `_cors_origins = [...] or ["*"]` — jeśli `CORS_ORIGINS` nie jest ustawiony, zezwala na dowolną domenę.
- **Naprawa:** Wyrzucać błąd przy starcie gdy `CORS_ORIGINS` jest pusty w trybie produkcyjnym.

#### 3.2.5. E-mail subskrybenta w logach (RODO) ❌ DO NAPRAWY (P9)

- **Plik:** `backend/app/routers/subscribers.py:175`
- `logger.info("... email=%r ...")` — e-mail logowany w plaintext do stderr/pliku.
- **Naprawa:** Zastąpić `email=%r` przez `email_hash=%s` (SHA-256 pierwszych 8 znaków) lub usunąć z loga.

#### 3.2.6. `EventHistory` FK bez `ON DELETE SET NULL`

- **Plik:** `backend/app/models/event.py:70`, migracja inicjalna
- FK `changed_by → users.id` bez strategii `ondelete` — domyślnie RESTRICT.
- **Efekt:** Nie można usunąć użytkownika, który ma wpisy w historii zdarzeń.
- **Naprawa:** Migracja: `ALTER TABLE event_history ALTER CONSTRAINT ... SET ON DELETE SET NULL`.

#### 3.2.7. Brak indeksów na `notification_log`

- **Plik:** `backend/app/models/notification.py`
- Tabela `notification_log` nie ma żadnych indeksów poza PK.
- **Zapytania bez indeksu:** `.order_by(NotificationLog.sent_at.desc())` w `admin.py:213`; filtrowanie po `status = 'queued_morning'` w schedulerze.
- **Naprawa:** Migracja dodająca `CREATE INDEX idx_notif_sent_at ON notification_log (sent_at DESC)` i `CREATE INDEX idx_notif_status ON notification_log (status)`.

#### 3.2.8. Endpoint IVR 994 — brak ❌ DO ZROBIENIA (P7)

- Szef IT powiedział „odpuśćcie na razie", ale dla „Festiwalu Biznesu" to killer-feature — plain-text z aktywnymi awariami, dostępny dla automatu 994 przez wget, ~10 linii kodu.

#### 3.2.9. Trigram index na `streets` — brak

- **Plik:** `backend/app/models/street.py:29` — komentarz wspomina o indeksie, ale brak migracji.
- Przy 1378 rekordach brak odczuwalnego wpływu, ale TECH_SPEC tego wymaga.
- **Naprawa:** Migracja: `CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE INDEX idx_streets_fullname_trgm ON streets USING gin(full_name gin_trgm_ops)`.

#### ✅ NAPRAWIONO 3.2.10. Escapowanie LIKE-injection (`streets.py:31`)

#### ✅ NAPRAWIONO 3.2.11. Rate limit `/auth/refresh`

#### ✅ NAPRAWIONO 3.2.12. Niespójność `source` w UI (`EventCard.tsx`)

---

### 3.3. 🟢 Dostępność (WCAG) — audyt

1. ✅ NAPRAWIONO **`EventCard.tsx`** — `role="button"`, `tabIndex={0}`, `onKeyDown` (WCAG 2.1.1).
2. ✅ NAPRAWIONO **`AdminDashboard.tsx`** — usunięto `role="button"` z `<TableRow>`; chevron z `aria-expanded`.
3. ✅ NAPRAWIONO **`index.html`** — `lang="pl"` (WCAG 3.1.1).
4. ✅ NAPRAWIONO **Kontrasty statusu „Zgłoszona"** — kontrast > 4.5:1 (WCAG 1.4.3).
5. ✅ NAPRAWIONO **Link stopki** (`PublicLayout.tsx`) — wystarczający kontrast.
6. ✅ NAPRAWIONO **ARIA combobox** (`Index.tsx`) — `role="combobox"`, `aria-haspopup`, `aria-controls` (WCAG 4.1.2).
7. ✅ NAPRAWIONO **Markery Leaflet** (`EventMap.tsx`) — `title` i `alt` na `<Marker>` (WCAG 1.1.1).
8. ✅ NAPRAWIONO **Brakujące `aria-label`** (`AdminDashboard.tsx`, `AdminUsers.tsx`, `AdminNotifications.tsx`).
9. ✅ NAPRAWIONO **Toast ARIA** (`ui/toast.tsx`) — `role="region"`, `aria-label` na viewport.
10. ✅ NAPRAWIONO **Kontrast Tabs** (`ui/tabs.tsx`) — `text-slate-600` (kontrast > 4.5:1).
11. ✅ NAPRAWIONO **Kontrast Unsubscribe / AdminNotifications** — `text-red-700`, `text-slate-700`.
12. ✅ NAPRAWIONO **Kontrast tekstu w tabelach** (`AdminDashboard.tsx`) — `text-slate-600`.
13. ✅ NAPRAWIONO **Lista adresów subskrybentów** (`AdminSubscribers.tsx`) — Badge + ScrollArea.
14. ✅ NAPRAWIONO **Podgląd wybranych budynków** (`AdminEventForm.tsx`) — Badge + ScrollArea.
15. ✅ NAPRAWIONO **Skracanie adresów** (`EventCard.tsx`, `AdminDashboard.tsx`) — max 3/10, tag `+X`.
16. **⚠️ DO ZROBIENIA** — Mapa Leaflet (`AdminEventForm.tsx`) bez `aria-label` na kontenerze. Brak Error Boundary dla `<EventMap>`.
17. **Pułapki focus** — Radix Dialog/AlertDialog są OK (trap focus domyślnie).
18. **Fieldset + legend** — `Register.tsx` używa `<fieldset><legend>` ✅.

**Rekomendacja:** Uruchomić **Lighthouse Accessibility** i **axe DevTools** na stronach `/`, `/register`, `/admin/dashboard`, `/admin/events/new` (P10).

---

### 3.4. 🔵 Bezpieczeństwo — dług techniczny (backlog pre-SLA)

#### 3.4.1. JWT w localStorage — brak ochrony przed XSS

- **Pliki:** `frontend/src/lib/api.ts:8`, `frontend/src/hooks/useAuth.tsx:56`
- Access i refresh tokeny w `localStorage` — dostępne przez JavaScript (XSS).
- Brak Content Security Policy w nagłówkach (`index.html`, nginx).
- **Rekomendacja:** (a) CSP header w nginx (`script-src 'self'`); (b) refresh token w `httpOnly` cookie (większy zakres zmian — backlog pre-SLA).

#### 3.4.2. Token wyrejestrowania widoczny w URL i historii przeglądarki

- **Plik:** `frontend/src/pages/Unsubscribe.tsx:30` — `searchParams.get('token')`
- Token trafia do adresu URL, historii przeglądarki, logów serwera nginx.
- Token ma 64 znaki hex (2^256 przestrzeń) — atak brute-force niepraktyczny, ale token nie powinien być w URL.
- **Rekomendacja:** Przekazywać przez POST body lub fragment URL (`#token=...`).

#### 3.4.3. Race condition przy jednoczesnym odświeżeniu tokenu

- **Plik:** `frontend/src/lib/api.ts:18-37`
- Dwa równoległe requesty mogą oba wywołać `tryRefreshToken()` — drugi refresh może unieważnić token z pierwszego.
- **Rekomendacja:** Singleton promise — jeśli refresh jest w toku, kolejne requesty czekają na jego wynik.

#### 3.4.4. GeoJSON payload — brak kompresji / osobnego endpointu

- `geojson_segment` z 50+ budynkami to kilkadziesiąt KB na zdarzenie. Przy 100 zdarzeniach i React Query co 30 s = megabajty JSON.
- **Rekomendacja:** (a) Sprawdzić czy nginx faktycznie kompresuje gzip; (b) Nowy endpoint `GET /events/{id}/geojson`, w liście zastąpić `geojson_segment` polem `has_geojson: bool`.

#### 3.4.5. `api_keys` — tabela bez użycia (dead schema)

- **Pliki:** `backend/app/models/api_key.py`, migracja inicjalna
- Tabela `api_keys` istnieje w bazie, ale żaden router / dependency jej nie używa.
- Pole `source` w `events` jest gotowe pod multi-operatora, ale brak endpointów dla zewnętrznych operatorów (LPEC, ZDiM).
- **Rekomendacja backlog:** Zaimplementować `external.py` router z `X-API-Key` dependency lub usunąć martwą tabelę.

---

### 3.5. 🔵 Jakość kodu — dług techniczny

#### 3.5.1. `SubscriberAddress` bez unique constraint na (subscriber_id, street_id, house_number)

- **Plik:** `backend/app/models/subscriber.py`
- Brak unikalności na poziomie DB — użytkownik może zarejestrować ten sam adres wielokrotnie.
- Deduplikacja przy powiadomieniach odbywa się w kodzie (`notified_event_ids`), nie na poziomie bazy.
- **Naprawa:** `UniqueConstraint('subscriber_id', 'street_id', 'house_number')` + migracja.

#### 3.5.2. `any` w TypeScript (Leaflet / GeoJSON)

- **Pliki:** `AdminEventForm.tsx:177`, `EventMap.tsx`
- `feature?: any` w callbackach Leaflet obchodzi typowanie GeoJSON.
- **Naprawa:** Typować jako `GeoJSON.Feature<GeoJSON.Geometry>` z pakietu `@types/geojson`.

#### 3.5.3. `GeoAlchemy2` — kolumna `geom` bez typowania SA 2.0

- **Plik:** `backend/app/models/building.py:24-26`
- `geom = mapped_column(Geometry(...))` bez `Mapped[...]` — komentarz wyjaśnia przyczynę (brak integracji GeoAlchemy2 z SA 2.0 Mapped).
- **Status:** Znany dług, udokumentowany w kodzie. Akceptowalny do czasu aktualizacji GeoAlchemy2.

#### 3.5.4. Brak Error Boundary dla komponentu mapy

- **Plik:** `frontend/src/pages/Index.tsx:393`
- `<EventMap ...>` nie jest opakowany w `ErrorBoundary` — błąd Leaflet crashuje całą stronę publiczną.
- **Naprawa:** `<ErrorBoundary fallback={<MapError />}><EventMap .../></ErrorBoundary>`.

#### 3.5.5. Brak indeksu na `notification_log.sent_at` i `status`

- Opisano w 3.2.7. Powtórzono tutaj jako dług techniczny wpływający na wydajność panelu admina przy >10k logów.

---

## 4. Zgodność z wymaganiami MPWiK i konkursem

| Obszar | Status | Komentarz |
|--------|--------|-----------|
| **RODO — fizyczne usunięcie** | ✅ | Backend: CASCADE. Token RODO wysyłany powitalnym SMS/e-mail. |
| **RODO — minimalizacja danych w logach** | ⚠️ | E-mail logowany plaintext (P9). |
| **Tajemnica przedsiębiorstwa** | ✅ | Admin endpointy za JWT + rolą; brak publicznego podglądu subskrybentów. |
| **Bramka SMS (SMSEagle)** | ✅ | `services/gateways.py` — `mock` + `smseagle`, przełącznik przez `SMS_GATEWAY_TYPE`. |
| **Nocna cisza 22–06 Europe/Warsaw** | ✅ | `notification_service.py` — `ZoneInfo("Europe/Warsaw")`. Osobna zgoda `night_sms_consent`. |
| **Edytowalna treść SMS/e-mail** | ✅ | Dyspozytor może nadpisać szablon przez `custom_message` w formularzu zdarzenia. |
| **Rate limiter / WAF-ready** | ✅ | slowapi: `login` (5/min), `register` (3/min), `streets?q=` (30/min), `refresh` (10/min). |
| **Hardening SECRET_KEY** | ⚠️ | Walidator blokuje start ✅. Klucz domyślny wciąż w repo ⚠️ (P1). |
| **Obscurity panelu admina** | ❌ | Ścieżka `/admin/login` jawna (P3). |
| **Autoryzacja DELETE /events** | ❌ | Każdy zalogowany użytkownik może usunąć zdarzenie (P2 — KRYTYCZNE). |
| **Statusy zdarzeń zgodne ze spec** | ❌ | `w_naprawie` zamiast `trwajaca/potwierdzona/zakonczono` (P4). |
| **Multi-operator (LPEC, ZDiM)** | ❌ | Model `api_keys` w bazie, brak routera. Pole `source` gotowe. |
| **GIS — klikanie budynków** | ✅ | `AdminEventForm` — 3 taby, `BuildingLayer` z poligonami/punktami, tooltopy. |
| **IVR 994 endpoint** | ❌ | Szef IT odłożył. Killer-feature — warto dorobić przed prezentacją (P7). |
| **Trigram index na `streets`** | ❌ | Migracja nie napisana (przy 1378 rek. brak odczuwalnego wpływu). |
| **WCAG dostępność** | ✅ | 15 punktów naprawionych. Wymagany końcowy audyt axe/Lighthouse (P10). |
| **Infrastruktura — bezpieczeństwo** | ⚠️ | DB wystawiona (P6), DEBUG=true (P5), CORS fallback `*`. |
| **Wirtualka Oracle Linux** | ❌ | Docker Compose jest, ale nikt nie uruchomił stacku na Oracle Linux 9. Obowiązkowe przed SLA. |
| **Zero kosztów licencyjnych** | ✅ | Cały stack FOSS (FastAPI, React, Leaflet, PostgreSQL/PostGIS, shadcn/ui MIT). |
| **Testy automatyczne** | ❌ | `backend/tests/` — tylko pusty `__init__.py`. Zero pytest. Frontend — brak Vitest. |

---

## 5. Dług techniczny i skalowalność

### 5.1. Świadomie odłożone (backlog)

- **IVR 994** — endpoint `GET /events/feed` (plain text). Odłożony decyzją szefa IT (P7).
- **X-API-Key dla zewnętrznych operatorów** — model `ApiKey` istnieje, router czeka.
- **Obscurity panelu admina** — zmiana ścieżki na `/sys-panel` (P3).
- **JWT w httpOnly cookie** — refresh token powinien być w httpOnly cookie (sekcja 3.4.1, backlog pre-SLA).
- **Aktualizacja słownika TERYT** — `import_streets.py` jest idempotentny, ale brak mechanizmu cron/CI.
- **6 ulic bez geocode'u** (Plac Łokietka, Skwer Witkowskiego itp.) — nie renderują się na mapie jako punkt.
- **Statusy zdarzeń** — uzgodnienie z MPWiK i migracja (P4).

### 5.2. Skalowalność — co zadziała, co trzeba obserwować

**Zadziała dla Lublina (~340 tys. mieszkańców, ~3 tys. potencjalnych subskrybentów):**
- Index GIST na `buildings.geom` + zapytania BBOX — profilowane na 51 643 rekordach.
- Async FastAPI + asyncpg — single instance obsłuży 500–1000 RPS.
- APScheduler kolejka poranna — max 3 tys. SMS w 6:00; SMSEagle ~10/s, pełne wysłanie w ~5 min.

**Trzeba obserwować:**
- `notification_service.notify_event()` leci sekwencyjnie per subskrybent. Przy 3 tys. subskrybentów × e-mail + SMS = ~6 tys. I/O requestów. **Rekomendacja:** `asyncio.gather(*[...], return_exceptions=True)`.
- Brak retry-policy dla SMS Gateway. **Rekomendacja:** tabelka `notification_retries` lub kolejka Redis/RQ.
- `geojson_segment` w liście zdarzeń — duży payload (sekcja 3.4.4).
- `SubscriberAddress` bez unique constraint — możliwe duplikaty adresów (sekcja 3.5.1).

### 5.3. Monitoring, observability

**Brakuje całkowicie:**
- Nie ma `/metrics` (Prometheus); health-check pokazuje tylko wersję.
- Nie ma structured logging (JSON) — logi idą do stderr tekstem.
- Brak Sentry/GlitchTip — błędy tylko w log-streamie.

**Rekomendacja przed SLA:** `starlette-prometheus` + endpoint `/metrics` + panel Grafana.

### 5.4. Testy — absolutny minimum przed oddaniem MPWiK

1. `test_auth.py` — login happy path, 401 na złe hasło, 5/min rate limit.
2. `test_subscribers.py` — register → token → GET → DELETE (RODO flow).
3. `test_events.py` — CRUD + RBAC (dispatcher próbuje DELETE → 403 po naprawieniu P2).
4. `test_streets.py` — escapowanie LIKE: `%`, `_`, `\`, normalne zapytanie (P11).
5. `test_notification_service.py` — night hours, queued_morning, matching po `street_id`.
6. Integracyjne z testcontainers PostgreSQL (nie mockować DB).

---

## 6. Podsumowanie dla jury i zarządu MPWiK

**Co pokazać na „Festiwalu Biznesu":**
- Strona publiczna — wyszukiwarka ulica + numer, mapa Leaflet z ikonami wg typu zdarzenia, fly-to.
- Panel dyspozytora — demo formularza z 3 zakładkami (mapa/zakres/lista) + edytowalny podgląd treści SMS.
- Rejestracja → SMS/e-mail dostarczony (mock gateway + realny SMTP).
- Wyrejestrowanie → fizyczne usunięcie z bazy (pokaz w DBeaverze).
- Admin → statystyki + logi powiadomień + filtry.

**Co powiedzieć wprost dyrektorowi IT:**
- „Prototyp gotowy, produkcja za ~2–3 tygodnie pracy: naprawa krytycznej luki DELETE, hardening SECRET_KEY, obscurity panelu, testy pytest, ustalenie docelowych stanów zdarzeń z MPWiK."
- „Integracja GIS + silnik powiadomień są ukończone na realnych danych (51 tys. budynków Lublin, 1378 ulic TERYT). Dyspozytor może w pełni nadpisać treść każdego SMS/e-mail."
- „Architektura wspiera multi-operator (LPEC, ZDiM) przez `source` + `X-API-Key` — do podpięcia bez zmiany schematu bazy."

**Trzy największe ryzyka przed wdrożeniem produkcyjnym:**
1. **Luka autoryzacji DELETE** (P2) — każdy zalogowany użytkownik może usunąć zdarzenie. Naprawa: 1 linia kodu.
2. **SECRET_KEY w repo** (P1) — potencjalne fałszowanie tokenów JWT. Naprawa: usunięcie domyślnej wartości + procedura operacyjna.
3. **Statusy zdarzeń** (P4) — niezgodność ze specyfikacją uniemożliwia poprawne śledzenie cyklu życia awarii przez operatorów MPWiK.

---

*Raport zaktualizowany 2026-04-20. Odzwierciedla stan kodu po pełnym audycie eksperckim (backend, frontend, infrastruktura, bezpieczeństwo, WCAG) na branch `main`.*
