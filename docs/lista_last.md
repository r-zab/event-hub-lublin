# Lista zadań końcowych — MPWiK Lublin System Powiadomień

**Wygenerowano:** 2026-05-02  
**Deadline prezentacja:** 7 maja 2026  
**Deadline wdrożenie MVP:** 14 maja 2026  
**Gala:** 28 maja 2026

---

## 1. NIEUKOŃCZONE ZADANIA (z roadmap_finalna_maj.md)

> Zadania z tygodnia 1 i 2 są w całości ukończone (✅). Poniżej tylko nieoznaczone checkmarkami z tygodnia 3.

### Przygotowanie do prezentacji (do 7 maja)

- [ ] **T3.3 (U)** — Tablety RWD: testy na 10.1″ i 11″ (Chrome DevTools), pionowo i poziomo. Naprawa znalezionych regresji. Pliki: całość frontendu.
- [ ] **T3.4 (U)** — OWASP/MITRE mapping w dokumentacji: sekcja w `docs/security_mapping.md` mapująca zabezpieczenia: A01 (RBAC), A03 (Pydantic + escape LIKE), A05 (HSTS-ready), A07 (rate-limit + 2FA). Wymagane przez Piotra i Kacpra do korelacji z raportami WAF Fortinet.
- [ ] **T3.8 (U)** — Storyboard demo na galę: `docs/demo_scenariusz_gala.md` — 10-minutowa narracja z timestampami, kto co klika, jakie ataki demonstrujemy (SQL injection, brute-force, maskowanie RODO w terminalu).

### Finalizacja MVP (do 14 maja)

- [ ] **Hardening — HTTPS + HSTS w nginx** — `frontend/nginx.conf` nasłuchuje TYLKO na porcie 80 (HTTP). Produkcyjny Nginx powinien dodawać nagłówek `Strict-Transport-Security` gdy WAF przekazuje `X-Forwarded-Proto: https`. Plik: `frontend/nginx.conf`. *(Zadanie z tabeli 4.2 sekcji roadmapy — statusem TODO T3.1, niezrealizowane mimo zamknięcia T3.1).*
- [ ] **Definicja sukcesu p.6** — Piotr + Kacper otrzymują dostęp do stagingu i potwierdzają „akceptuję" przed 14.05. *(Warunek organizacyjny — wymaga koordynacji.)*

---

## 2. BEZPIECZEŃSTWO I STABILNOŚĆ

> Poniższe zadania techniczne są krytyczne dla stabilności MVP przed prezentacją 7 maja i uruchomieniem 14 maja. Ocena na podstawie analizy kodu (`api_key.py`, `masking.py`, `setup_dev_users.py`, `nginx.conf`, `auth.py`, `config.py`).

### Bezpieczeństwo / DevOps

- [ ] **[KRYTYCZNE] Zmiana domyślnych haseł w `setup_dev_users.py`**  
  Skrypt tworzy konta z hasłami `admin123` i `lublin123` (7–8 znaków) — niezgodne z polityką 12+ znaków (T1.3) i wdrożoną walidacją Pydantic. Deployment guide (krok 9.6) instruuje uruchomienie tego skryptu na serwerze produkcyjnym.  
  **Ryzyko:** konto administratora z hasłem poniżej polityki bezpieczeństwa MPWiK → bezpośrednia podatność A07 (Auth Failures).  
  **Naprawa:** Zastąpić hasła w skrypcie silnymi (≥12 znaków, A-Z/a-z/0-9) lub usunąć skrypt i opisać procedurę ręcznego tworzenia konta przez `POST /admin/users`. Pliki: `backend/scripts/setup_dev_users.py`, `docs/deployment_oracle_linux_9.md`.

- [x] **[KRYTYCZNE] Klucze Cloudflare Turnstile — produkcja vs. testowe** ✅  
  Aktualnie `VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA` (testowy klucz Cloudflare, akceptuje każdy token bez walidacji sieciowej). Na środowisku produkcyjnym captcha nie chroni formularzy rejestracji i wyrejestrowania.  
  **Ryzyko:** Brak ochrony anty-botowej mimo widocznego widżetu → podatność na masową automatyczną rejestrację.  
  **Naprawa:** Usunięto testowe klucze z `.env.example` (zastąpione placeholderami z ostrzeżeniem); dodano sekcję „Konfiguracja Cloudflare Turnstile" w `docs/deployment_oracle_linux_9.md` z krokami rejestracji domeny i wklejenia kluczy. Pliki: `.env.example`, `docs/deployment_oracle_linux_9.md`.

- [x] **[WAŻNE] Model `ApiKey` — zaimplementowano router CRUD** ✅  
  Dodano `backend/app/schemas/api_key.py` (schematy `ApiKeyCreate`, `ApiKeyResponse`, `ApiKeyCreateResponse`) oraz `backend/app/routers/api_keys.py` z endpointami `GET /`, `POST /`, `PATCH /{key_id}/revoke` zabezpieczonymi rolą `admin`. Klucz generowany przez `secrets.token_urlsafe(32)`, w bazie przechowywany wyłącznie SHA-256 hash. Surowy klucz zwracany jednorazowo w odpowiedzi `POST`. Router zarejestrowany w `main.py` pod prefixem `/api/v1/admin/api-keys`.

- [ ] **[WAŻNE] Brak nagłówka HSTS i bezpiecznych nagłówków HTTP w Nginx**  
  `frontend/nginx.conf` nie ustawia nagłówków: `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`. WAF Fortinet może je dodawać, ale poza WAF-em (lub przy bezpośrednim dostępie SSH/staging) serwer odpowiada bez hardened headers.  
  **Ryzyko:** A05:2021 Security Misconfiguration — brak ochrony przed clickjacking, MIME sniffing.  
  **Naprawa:** Dodać blok `add_header` do `nginx.conf`. Pliki: `frontend/nginx.conf`.

- [ ] **[WAŻNE — P8] Brak blokady IP po wielokrotnych nieudanych próbach logowania**  
  `POST /auth/login` ma rate-limit 5/min (SlowAPI), ale nie ma: (a) blokady IP po N próbach, (b) alertu e-mail do admina, (c) CAPTCHA na stronie logowania.  
  **Ryzyko:** Atakujący może wolno brute-force'ować login (1 próba co 12s = 5/min → 7200 prób na dobę).  
  **Status:** `🟡 Do weryfikacji` — sprawdzić czy WAF Fortinet po integracji pokrywa ten przypadek (GeoIP + IP reputation block). Jeśli tak — wystarczy to udokumentować w `security_mapping.md`.  
  **Naprawa minimalna:** Dodać logowanie nieudanych prób (`logger.warning("Nieudane logowanie: %s z IP %s")`) i wskazać w dokumentacji że WAF obsługuje blokadę. Pliki: `backend/app/routers/auth.py`.

---

## 3. WDROŻENIE (DEPLOYMENT) — Oracle Linux 9.6 na Oracle VM

> Pełna procedura w `docs/deployment_oracle_linux_9.md`. Poniżej lista kontrolna kroków z zaznaczeniem statusu.

### Przygotowanie serwera

- [ ] Zainstalować Docker CE i Git (`sudo dnf install -y git docker-ce docker-ce-cli containerd.io docker-compose-plugin`)
- [ ] Włączyć i uruchomić daemon Docker (`sudo systemctl enable --now docker`)
- [ ] Dodać użytkownika do grupy docker (`sudo usermod -aG docker $USER && newgrp docker`)
- [ ] Skonfigurować firewalld: otworzyć port 80, **nie otwierać** 8000/5432/5433
- [ ] Zweryfikować SELinux — dodać `:z` do bind-mountów katalogów hosta jeśli użyte

### Konfiguracja środowiska

- [ ] Skopiować `.env.example` → `.env` i wypełnić wszystkie wymagane wartości:
  - [ ] `POSTGRES_PASSWORD` — min. 20 znaków, unikalny
  - [ ] `SECRET_KEY` — wygenerować: `openssl rand -hex 32`
  - [ ] `DEBUG=false`
  - [ ] `CORS_ORIGINS` — adres IP lub domena serwera
  - [ ] `SMS_GATEWAY_TYPE=smseagle` + `SMS_GATEWAY_URL` + `SMS_GATEWAY_API_KEY`
  - [ ] `TRUSTED_PROXIES` — IP WAF Fortinet
  - [ ] `VITE_TURNSTILE_SITE_KEY` — **klucz produkcyjny** (nie testowy `1x000...`)
- [ ] Upewnić się że oba Dockerfile używają `python:3.12-slim-bookworm` (nie `slim` bez tagu)
- [ ] Zweryfikować `frontend/.dockerignore` zawiera `node_modules` (bez tego build zwraca `vite: Permission denied`)

### Uruchomienie stosu

- [ ] Przesłać pliki GIS na serwer (nie są w repo): `budynki_surowe.geojson`, `adresy_surowe.geojson`, `streets_lublin__final.geojson`
- [ ] `docker compose -f docker-compose.prod.yml up -d --build` (pierwsze budowanie 5–15 min)
- [ ] Zweryfikować że 3 kontenery mają status `running`/`healthy`
- [ ] Potwierdzić sekwencję startową w logach backendu: `PostgreSQL ready → Alembic migrations → Application startup complete`

### Import danych (kolejność obowiązkowa)

- [ ] Zbudować obraz skryptów GIS: `docker build -f backend/Dockerfile.scripts -t mpwik-scripts ./backend`
- [ ] Importować ulice (oczekiwany wynik: `COUNT(*) = 1378`)
- [ ] Importować budynki (oczekiwany wynik: `COUNT(*) ≈ 46596`)
- [ ] *(Opcjonalnie)* Uzupełnić z OSM (`lubelskie-*.osm.pbf`, wynik: `≈ 51644`)
- [ ] Uzupełnić kolumnę `geom` — sprawdzić przez `\d buildings | grep geom`; jeśli brak — wykonać ręczny SQL z kroku 9.5

### Konta użytkowników

- [ ] ⚠️ **NIE uruchamiać `setup_dev_users.py` na produkcji z domyślnymi hasłami** (patrz sekcja 2)
- [ ] Stworzyć konto administratora ręcznie: `POST /api/v1/admin/users` z hasłem ≥12 znaków (A-Z/a-z/0-9)
- [ ] Zmienić hasła dyspozytorów po pierwszym logowaniu

### Weryfikacja końcowa

- [ ] `curl -I http://localhost` → `HTTP/1.1 200 OK`
- [ ] `curl -s http://localhost/api/v1/events | head -c 100` → JSON (nie błąd)
- [ ] Sprawdzić liczniki w bazie: streets `1378`, buildings `≥46596`, buildings_z_geom = buildings, users `≥1`
- [ ] Przetestować 2FA rejestracji end-to-end (init → SMS/email token → verify)
- [ ] Przetestować logowanie jako admin i dyspozytor, sprawdzić izolację sesji

### Autostart i monitoring

- [ ] Kontenery z `restart: unless-stopped` — zrestartować serwer i zweryfikować autostart
- [ ] Sprawdzić `docker system df` — miejsce na dysku przed wdrożeniem

---

## 4. ZALEŻNOŚCI — Alembic i schematy FastAPI

### Zadania wymagające nowej migracji Alembic

| Zadanie | Migracja wymagana? | Uwagi |
|---|---|---|
| T3.3 Tablety RWD | ❌ Nie | Czysto frontendowe zmiany CSS/layout |
| T3.4 OWASP mapping | ❌ Nie | Tylko dokumentacja |
| T3.8 Storyboard | ❌ Nie | Tylko dokumentacja |
| HTTPS/HSTS nginx | ❌ Nie | Zmiana `nginx.conf` |
| Turnstile prod keys | ❌ Nie | Zmiana `.env` |
| ApiKey router (jeśli dodany) | ✅ **Tak** | Tabela `api_keys` istnieje (migracja `20260329_initial_tables.py` lub późniejsza), ale jeśli dodasz endpoint zarządzania — sprawdź czy tabela istnieje: `\d api_keys`. Schemat Pydantic (`schemas/api_key.py`) też **nie istnieje** i trzeba go dodać. |
| Nginx bezpieczne nagłówki | ❌ Nie | Zmiana `nginx.conf` |
| setup_dev_users hasła | ❌ Nie | Zmiana skryptu Pythona |

### Zadania wymagające aktualizacji schematów FastAPI

| Zadanie | Schemat wymagany? | Uwagi |
|---|---|---|
| ApiKey router (jeśli dodany) | ✅ **Tak** | Brak `backend/app/schemas/api_key.py` — trzeba stworzyć `ApiKeyCreate`, `ApiKeyResponse` |
| Pozostałe zadania z sekcji 1–2 | ❌ Nie | Istniejące schematy są kompletne |

### Stan migracji — ocena

Wszystkie modele dodane w tygodniach 1–3 mają poprawne migracje Alembic:
- `PendingSubscriber` → `20260424_add_pending_subscribers.py` ✅
- `StreetAuditLog` → `20260425_add_street_audit_log.py` ✅
- `EventType` → `20260425b_add_event_types.py` ✅
- `MessageTemplate` → `20260425c_add_message_templates.py` ✅
- `department` na `User`/`Event` → `20260425d_add_department_fields.py` ✅
- `Department` → `20260426_add_departments.py` ✅

**Zalecenie przed wdrożeniem:** uruchomić na świeżej bazie `alembic upgrade head` i sprawdzić czy wszystkie 22 migracje aplikują się bez błędów (szczególnie kolejność dependencies — wstępna weryfikacja na środowisku dev).

---

## Podsumowanie statusu — matryca ryzyk

| ID | Zadanie | Kategoria | Deadline | Status |
|---|---|---|---|---|
| T3.3 | Tablety RWD | UX | 7 maja | ☐ Do zrobienia |
| T3.4 | OWASP/MITRE mapping | Dokumentacja/Security | 7 maja | ☐ Do zrobienia |
| T3.8 | Storyboard demo gala | Prezentacja | 7 maja | ☐ Do zrobienia |
| S1 | Hasła setup_dev_users.py | Bezpieczeństwo | 14 maja | ☐ **Krytyczne** |
| S2 | Klucze Turnstile produkcja | Bezpieczeństwo | 14 maja | ✅ Zrealizowane |
| S3 | ApiKey router / decyzja | Architektura | 14 maja | ✅ Zrealizowane |
| S4 | HSTS + bezpieczne nagłówki nginx | Bezpieczeństwo | 14 maja | ☐ Ważne |
| S5 | Blokada IP po nieudanych loginach (P8) | Bezpieczeństwo | 14 maja | ☐ Do weryfikacji |
| D1 | Pełny smoke-test migracji na świeżej bazie | DevOps | 14 maja | ☐ Do weryfikacji |
| D2 | Turnstile klucze prod w `.env` serwera | DevOps | 14 maja | ☐ **Krytyczne** |
| D3 | Piotr + Kacper: dostęp staging + akceptacja | Organizacyjne | 14 maja | ☐ Do weryfikacji |

---

## Changelog

| Data | Opis | Pliki |
|---|---|---|
| 2026-05-05 | **RWD Mobile — runda 3: scroll do mapy po kliknięciu zdarzenia + naprawa paska nawigacji w landscape.** (1) `Index.tsx`: po kliknięciu kafelka zdarzenia na mobile (`useIsMobile()`), strona płynnie scrolluje do sekcji mapy (`mapRef.scrollIntoView({ behavior:'smooth', block:'start' })`) z opóźnieniem 80 ms (daje React czas na aktualizację stanu focusMapa przed scrollem). (2) `PublicLayout.tsx`: naprawa layoutu landscape — zmieniono breakpoint nawigacji z `sm:` (640 px) na `md:` (768 px) we wszystkich klasach; wcześniej telefon w poziomie (667 px, co aktywuje `sm:`) pokazywał pełny poziomy pasek z dużymi etykietami; teraz w landscape telefon nadal używa kompaktowego layoutu (ikona + 10 px etykieta skrócona, flex-col per item); na md+ (tablety i desktop) — pełna etykieta w flex-row. Header: `h-16` → `h-12 md:h-16` (48 px zamiast 64 px w portrait i landscape, oszczędza 16 px ekranu). Logo: `text-lg` → `text-base md:text-lg`, `h-6` → `h-5 md:h-6`; tekst "Powiadomienia MPWiK" ukryty poniżej md (na telefonach w obu orientacjach). Build ✅ (5.68 s). | `frontend/src/pages/Index.tsx`, `frontend/src/components/PublicLayout.tsx` |
| 2026-05-05 | **RWD Mobile — runda 2: naprawa mapy na mobile, expandowalny opis, nav z tekstem, mniejszy admin dashboard.** (1) `Index.tsx`: krytyczna naprawa mapy — mapa miała `flex-1` (flex-basis:0%) w flex-col z `h-auto` parentem, co powodowało kolaps do 0px pomimo `h-[55vh]`; zmieniono na `h-[60vh] lg:flex-1 lg:h-full` bez `flex-1` na mobile. Lista: `max-h-[70vh]` → `max-h-[45vh]` żeby mapa była widoczna bez scroll; `border-r` → `border-b lg:border-b-0 lg:border-r`. (2) `EventCard.tsx`: opis (description) teraz expandowalny — gdy tekst > 100 znaków, wyświetlane `line-clamp-2` z przyciskiem "Rozwiń opis" / "Zwiń opis" (stopPropagation, nie triggeruje focusMapa). (3) `PublicLayout.tsx`: nawigacja na mobile teraz ZAWSZE pokazuje tekst — dodano `short` label (Mapa, Rejestr., Wyrej., O syst.), ikona + short label w flex-col na mobile (`text-[10px]`), pełny label w flex-row na `sm:` (`text-xs`); padding zmniejszony: `px-1.5 py-1` mobile / `px-2.5 py-1.5` sm. (4) `AdminDashboard.tsx`: kafelki stat — padding `p-5` → `p-3 sm:p-5`, liczba `text-3xl` → `text-2xl sm:text-3xl`, ikona `h-9 w-9` → `h-7 w-7 sm:h-9 sm:w-9`, heading `text-2xl` → `text-xl sm:text-2xl`. Build ✅ (7.57 s). | `frontend/src/pages/Index.tsx`, `frontend/src/components/EventCard.tsx`, `frontend/src/components/PublicLayout.tsx`, `frontend/src/pages/AdminDashboard.tsx` |
| 2026-05-05 | **RWD Mobile — pełna przebudowa responsywności strony publicznej.** (1) `EventCard`: usunięto mechanizm Popover z auto-zamknięciem po 5 s (zasłaniał mapę i listę na telefonach); zastąpiono go Collapsible inline — przycisk `+X bud.` rozwija pełną listę adresów w karcie bez nakładki. `CardHeader` zmieniony z `flex-row` na `flex-col sm:flex-row`; badge źródła ukryty na mobile (`hidden sm:inline-flex`); nazwa ulicy używa `break-words` zamiast `break-all`; padding karty lokalnie nadpisany na `p-4 sm:p-6`. (2) `EventMap`: legenda na mobile (viewport < 768 px) zastąpiona małym przyciskiem `Info` (h-10 w-10, kciuk-friendly) otwierającym Sheet od dołu z pełną listą typów; na desktop bez zmian (legenda absolute, `max-w-[14rem]`, `pointer-events-auto`); usunięto `pointer-events-none`. (3) `Index.tsx`: hero zmniejszony z `py-12` → `py-6 sm:py-10 lg:py-12`; H1 z `text-2xl` → `text-xl sm:text-2xl`; główny grid z `h-[80vh]` → `h-auto lg:h-[80vh]`; sidebar listy z `h-[50%]` → `max-h-[70vh] lg:max-h-none`; kontener mapy z `h-[50%]` → `h-[55vh] lg:h-full`; padding kontenera listy `p-3 sm:p-4`. (4) `PublicLayout`: dodano `aria-label` do każdego linku nawigacji. Build ✅ bez błędów TypeScript (7.14 s). | `frontend/src/components/EventCard.tsx`, `frontend/src/components/EventMap.tsx`, `frontend/src/pages/Index.tsx`, `frontend/src/components/PublicLayout.tsx` |
| 2026-05-02 | **Poprawka błędów sprintu UI/UX: usunięcie daty dla statusu 'usunięta', wymuszenie re-renderowania GeoJSON (reaktywne kolory), nowy format wiadomości planowych i odblokowanie zmiany działu.** (1) Modal edycji: pole "Szacowany czas usunięcia" całkowicie usunięte z renderowania gdy `status === 'usunieta'` (warunkowe JSX, nie `hidden`). (2) Generator wiadomości (`generateMessage`): dla scenariusza zmiany statusu na 'usunieta' — fragment "Szacowany czas naprawy" jest pomijany; wiadomość kończy się na zmianie statusu i przeprosinach. (3) EventMap: dodano `eventsFingerprint` (djb2-style hash po `id * status.length` wszystkich zdarzeń) — każda zmiana statusu dowolnego zdarzenia powoduje odtworzenie wszystkich warstw GeoJSON. Wydzielono `getBuildingStyle(eventStatus, color)` — gdy status == 'usunieta', zwraca `{stroke:false, fillOpacity:0, weight:0}` (poligon przezroczysty, powrót do koloru mapy). (4) Generator wiadomości: format planowych wyłączeń ujednolicony we wszystkich trzech scenariuszach (zmiana statusu, aktualizacja czasu/opisu, nowe zdarzenie) — "Od: X / Do: Y" zastąpione przez "Czas rozpoczęcia planowego wyłączenia: X, czas zakończenia: Y". | `frontend/src/components/EventMap.tsx`, `frontend/src/pages/AdminEventForm.tsx` |
| 2026-05-02 | **Sprint UI/UX: Dynamiczna legenda, reaktywne kolory budynków, poprawka formatowania planowych wyłączeń, warunkowe ukrywanie daty zakończenia oraz odblokowanie edycji działu.** (1) Legenda mapy generowana dynamicznie z typów aktualnie widocznych zdarzeń. (2) Klucz GeoJSON wzbogacony o `event.status` i `event.event_type` — warstwa Leaflet jest odtwarzana przy każdej zmianie statusu/typu, co gwarantuje natychmiastową zmianę koloru poligonów bez odświeżania strony. (3) Formatowanie w `EventCard` dla `planowane_wylaczenie` zmienione z "Planowane: X – Y" na "Czas rozpoczęcia planowego wyłączenia: X, czas zakończenia: Y". (4) Sekcja szacowanego czasu zakończenia ukryta gdy `event.status === 'usunięta'` (dotyczy karty na liście). (5) Selektor działu widoczny również w trybie edycji zdarzenia; przy ładowaniu formularza pre-populowany z `event.created_by_department`; wartość wysyłana w `PUT /events/{id}`; backend (`EventUpdate`) rozszerzony o pole `created_by_department` — admini mogą je zmieniać, dyspozytorzy są nadal wymuszani do własnego działu. | `frontend/src/components/EventCard.tsx`, `frontend/src/components/EventMap.tsx`, `frontend/src/pages/AdminEventForm.tsx`, `backend/app/schemas/event.py` |
| 2026-05-02 | **Backend: Wdrożono automatyczne przypisywanie budynków (geokodowanie) dla zdarzeń z zewnętrznego API. Backend przelicza zakresy 'od-do' i twardo wiąże je z fizycznymi obrysami w bazie, co gwarantuje spójność wyświetlania na mapie.** Nowy plik `backend/app/services/event_service.py` z funkcją `assign_buildings_by_range(db, event_id, street_name, street_id, number_from, number_to)`: zapytanie do `buildings` (po `street_id` lub `street_name` ilike), filtrowanie przez `is_in_range`, budowa GeoJSON FeatureCollection z `geojson_polygon`/`geojson_point`, zapis do `event.geojson_segment`. Wywoływana w `POST /events` i `PUT /events/{id}` gdy `house_number_from` i `house_number_to` są ustawione a `geojson_segment` jeszcze pusty. Dla zdarzeń klikanych przez dyspozytora (już mają geojson_segment) — bez zmian. | `backend/app/services/event_service.py`, `backend/app/routers/events.py` |
| 2026-05-02 | **Frontend: Naprawiono wyświetlanie treści wiadomości (`custom_message`) oraz dodano fallback centrowania mapy dla zdarzeń zewnętrznych (API), zapobiegając błędom przy braku przypisanych poligonów.** Dodano `custom_message?: string | null` do interfejsu `EventItem` w `mockData.ts`. W `EventCard` i `EventMap` opis renderuje się przez `event.custom_message \|\| event.description` — pokrywając zarówno zdarzenia wewnętrzne jak i zewnętrzne (LPEC). W `MapController` usunięto guard blokujący `flyTo` gdy `getMarkerPosition` zwracał centrum Lublina — teraz kliknięcie zawsze centruje mapę na markerze zdarzenia (zoom 16). | `frontend/src/data/mockData.ts`, `frontend/src/components/EventCard.tsx`, `frontend/src/components/EventMap.tsx` |
| 2026-05-02 | **Backend: Wdrożono podwójną autoryzację (Dual Auth) dla routera zdarzeń. Endpoint `POST /events` akceptuje teraz zarówno tokeny JWT (Single Session dla UI), jak i nagłówek `X-API-Key` (dla integracji zewnętrznych, np. LPEC). Zaimplementowano `get_current_user_or_api_key` w `dependencies.py`: najpierw sprawdza nagłówek `X-API-Key` (SHA-256 hash vs. tabela `api_keys`, `is_active=True`), a przy braku klucza weryfikuje JWT przez wydzieloną funkcję `_validate_jwt`. Endpoint `create_event` obsługuje oba tryby: autoryzacja kluczem API pomija wymuszenie działu i blokadę duplikatów (systemy zewnętrzne), `created_by=None` i `changed_by=None` w historii.** | `backend/app/dependencies.py`, `backend/app/routers/events.py` |
| 2026-05-02 | **Backend: Zaimplementowano moduł zarządzania kluczami API dla systemów zewnętrznych. Dodano endpointy CRUD w `/admin/api-keys` zabezpieczone rolą administratora oraz generowanie kluczy z zapisem ich bezpiecznego hasha w bazie.** Nowe pliki: `backend/app/schemas/api_key.py` (schematy `ApiKeyCreate`, `ApiKeyResponse`, `ApiKeyCreateResponse`), `backend/app/routers/api_keys.py` (`GET /`, `POST /`, `PATCH /{key_id}/revoke`). Klucz generowany `secrets.token_urlsafe(32)`, w bazie SHA-256 hash, surowy klucz zwracany jednorazowo. Zarejestrowano w `main.py` pod `/api/v1/admin/api-keys`. | `backend/app/schemas/api_key.py`, `backend/app/routers/api_keys.py`, `backend/app/main.py` |
| 2026-05-02 | **Naprawa regresji bezpieczeństwa — maskowanie PII w widoku subskrybentów.** Pola `email` i `phone` były zwracane jawnym tekstem w endpoincie `GET /admin/subscribers` i w eksporcie CSV. Dodano `field_validator("phone", "email", mode="after")` w schemacie `AdminSubscriberItem` wywołujący `mask_recipient()` z `app.utils.masking`; analogiczne wywołanie dodano bezpośrednio w pętli eksportu CSV. Baza danych niezmieniona — maskowanie wyłącznie w warstwie odpowiedzi API (OWASP A02 / RODO Art. 25). | `backend/app/routers/admin.py` |
| 2026-05-02 | **Frontend: Naprawiono resetowanie stanu formularza zdarzeń po dodaniu do kolejki oraz usunięto problem ze znakami specjalnymi w podglądzie wiadomości.** | `frontend/src/pages/AdminEventForm.tsx` |
| 2026-05-02 | **Backend: Dodano blokadę duplikowania aktywnych zdarzeń. Wdrożono mechanizm Single Session per User (dodano session_id do JWT i modelu User) blokujący jednoczesne logowania.** | `backend/app/routers/events.py`, `backend/app/routers/auth.py`, `backend/app/dependencies.py`, `backend/app/models/user.py`, `backend/alembic/versions/20260502_add_session_id_to_users.py` |
| 2026-05-02 | **Backend: Naprawiono logikę Single Session - od teraz każde pomyślne logowanie w auth.py generuje nowy session_id, wymuszając wylogowanie z poprzednich sesji.** Dodano `await db.refresh(user)` po `db.commit()` i zmieniono payload JWT na `user.session_id` (wartość potwierdzona przez DB), eliminując ryzyko rozbieżności między pamięcią procesu a bazą przy `expire_on_commit=False`. | `backend/app/routers/auth.py` |
| 2026-05-02 | **Frontend: Dodano wyświetlanie informacji o zalogowanym użytkowniku i jego roli w dolnej części paska bocznego.** Rozszerzono `useAuth` o pole `username` (z claim `sub` JWT); dodano blok z ikoną, nazwą użytkownika i rolą (+ dział jeśli przypisany) nad przyciskami Dostępność / Strona główna / Wyloguj. Działa zarówno na desktopowym sidebarz jak i w mobilnym drawer. | `frontend/src/hooks/useAuth.tsx`, `frontend/src/components/AdminLayout.tsx` |
| 2026-05-02 | **Backend/Baza: Naprawiono pustą migrację dla session_id. Poprawiono detekcję modeli w Alembic i wymuszono fizyczne dodanie kolumny session_id do tabeli users.** Prawdziwa przyczyna: `docker-compose.yml` montował tylko `./backend/app` — katalog `alembic/versions/` był poza live-mount, nowe migracje niewidoczne w kontenerze bez przebudowy obrazu. Dodano `./backend/alembic:/code/alembic` do sekcji volumes backendu. | `docker-compose.yml` |
| 2026-05-02 | **Backend: Uszczelniono mechanizm Single Session.** Wprowadzono `db.refresh(user)` po logowaniu w `auth.py` w celu synchronizacji UUID z bazą oraz dodano twardą walidację `session_id` z tokena względem bazy w `dependencies.py`, co wymusza wylogowanie starych sesji. | `backend/app/routers/auth.py`, `backend/app/dependencies.py` |
| 2026-05-02 | **Backend/Frontend: Wymuszono twardą walidację typów i logowanie dla session_id w dependencies.py. Na frontendzie dodano wyświetlanie informacji o zalogowanym użytkowniku i jego roli w pasku bocznym.** Zmieniono warunek single-session z permisywnego (`token_sid is not None`) na restrykcyjny (`not token_sid or not user.session_id or str(token_sid) != str(user.session_id)`), eliminując przepuszczanie tokenów bez pola `sid`. Dodano `logger.info` logujący obie wartości przed porównaniem. W `auth.py` jawnie konwertowano `session_id` na `str()`. W sidebarze przesunięto blok użytkownika nad linki nawigacyjne, dodając czytelne etykiety "Zalogowano jako:" i "Rola:". | `backend/app/dependencies.py`, `backend/app/routers/auth.py`, `frontend/src/components/AdminLayout.tsx` |
| 2026-05-02 | **Backend: Załatano krytyczną lukę Single Session.** Wymuszono na wszystkich routerach korzystanie z zaktualizowanej zależności w `dependencies.py`, która twardo weryfikuje session_id z tokena JWT w stosunku do aktualnego session_id w bazie danych PostgreSQL przy każdym żądaniu HTTP. Prawdziwy wektor ataku był w endpoincie `/auth/refresh`: frontend (`lib/api.ts`) automatycznie wzywał refresh przy 401, a stary endpoint generował nowy access token z aktualnym DB `session_id` — omijając walidację sesji. Naprawiono przez dodanie twardej walidacji `sid` refresh tokena względem `user.session_id` z bazy (`str(refresh_sid) != str(user.session_id)` → 401), zamykając pełen cykl single-session dla obu tokenów. | `backend/app/routers/auth.py` |
| 2026-05-02 | **Frontend: Poprawiono UX mechanizmu Single Session.** Dodano pełnoekranowy alert informujący o wylogowaniu z powodu logowania na innym urządzeniu, zastępując nagłe przekierowanie. `lib/api.ts` zamiast `window.location.href` dispatchuje `CustomEvent('mpwik:session-expired')`; `AuthProvider` nasłuchuje na ten event i ustawia flagę `sessionExpired`; `AdminLayout` renderuje blokujący ekran modal z komunikatem i przyciskiem "Przejdź do logowania", który czyści sesję i przekierowuje. | `frontend/src/lib/api.ts`, `frontend/src/hooks/useAuth.tsx`, `frontend/src/components/AdminLayout.tsx` |
| 2026-05-02 | **Frontend: Poprawiono wyświetlanie długich list budynków na kartach zdarzeń. Wdrożono skracanie listy do 3 pozycji z badge'em '+X bud.' otwierającym szczegółowy popover z pełną listą adresów.** Badge ostylowany w niebieskim kolorze (Tailwind `blue-100/700`); popover (Radix UI via shadcn) zawiera typ zdarzenia pogrubiony, pełną listę numerów i badge statusu. Kliknięcie badge'a nie propaguje eventu do karty (`stopPropagation`). | `frontend/src/components/EventCard.tsx` |
| 2026-05-02 | **Frontend: Rozszerzono mechanizm auto-zamykania dymków na mapie. Popupy pinezek oraz szczegółów budynków (Leaflet) znikają teraz automatycznie po 5 sekundach, zachowując pełną spójność UX z resztą aplikacji.** Przepisano `PopupAutoClose` — zastąpiono domknięcie `let timer` na `useRef` + `useMapEvents` (react-leaflet API). Nasłuchiwanie na `popupopen` uruchamia nowy `setTimeout(5 s)` z automatycznym `clearTimeout` poprzedniego; `popupclose` natychmiast anuluje timer gdy użytkownik zamknie popup ręcznie; `useEffect` cleanup czyści timer przy odmontowaniu komponentu. Obsługuje wszystkie typy: `<Popup>` react-leaflet (pinezki, polilinie) i natywny `bindPopup` GeoJSON (obrysy budynków). | `frontend/src/components/EventMap.tsx` |
| 2026-05-02 | **Frontend: Zoptymalizowano UX dymków (Popover na liście oraz Popup na mapie). Wdrożono kontrolowany stan z `setTimeout`, dzięki czemu szczegóły zdarzenia znikają automatycznie po 5 sekundach, co zapobiega zasłanianiu interfejsu dyspozytora. Dodano czyszczenie timerów zapobiegające wyciekom pamięci.** `EventCard`: tryb kontrolowany (`isOpen` + `useEffect` + `clearTimeout`), `PopoverAnchor` zamiast `PopoverTrigger` (brak konfliktów z toggle). `EventMap`: nowy komponent `PopupAutoClose` nasłuchuje na zdarzenie Leaflet `popupopen` i woła `map.closePopup()` po 5 s; `clearTimeout` + `map.off` w cleanup zapobiegają wyciekom. | `frontend/src/components/EventCard.tsx`, `frontend/src/components/EventMap.tsx`, `frontend/src/components/ui/popover.tsx` |
| 2026-05-02 | **Frontend: Wdrożono Popover na liście aktywnych zdarzeń. Po kliknięciu w zdarzenie wyświetla się dymek z pełną listą budynków w stylu identycznym z popupem mapy Leaflet.** Cała karta jest teraz `PopoverTrigger asChild`; kliknięcie jednocześnie otwiera dymek i centruje mapę (`onFocus`). `PopoverContent` ma zneutralizowany własny wygląd (`p-0 border-0 bg-transparent shadow-none`) i osadzone klasy Leaflet (`leaflet-popup-content-wrapper` / `leaflet-popup-content`, `width: 301px`) z identyczną strukturą: typ zdarzenia (`font-bold`), ulica + pełna lista numerów (`break-words`), `StatusBadge`, opis (`text-muted-foreground xs`). Badge `+X bud.` pozostaje jako wskaźnik wizualny (bez własnego popovera). | `frontend/src/components/EventCard.tsx` |
| 2026-05-02 | **System: Wdrożono globalny mechanizm nawigacji klawiaturą dla wszystkich list i wyszukiwarek (Strzałki + Enter + Escape).** Pokrycie: (1) Landing Page (`Index.tsx`) — wyszukiwarka ulic z wraparound, Enter po podświetleniu od razu wyzwala wyszukiwanie; (2) Formularz zdarzeń (`AdminEventForm.tsx`) — autocomplete ulicy oraz dwa dropdowny zakresu numerów (od/do) z pełną pętlą nawigacji; (3) Formularz rejestracji (`AddressRow.tsx`) — ulica + numer budynku; (4) Modal adresu (`BuildingAddressModal.tsx`) — ulica. Każda lista: podświetlenie aktywnej pozycji `bg-accent + font-semibold`, `scrollIntoView({ block: 'nearest' })`, `aria-activedescendant` na input, `aria-selected` na elementach listy. | `frontend/src/pages/Index.tsx`, `frontend/src/pages/AdminEventForm.tsx`, `frontend/src/components/AddressRow.tsx`, `frontend/src/components/BuildingAddressModal.tsx` |
| 2026-05-02 | **UX: Wdrożono pełną obsługę klawiatury (strzałki góra/dół, Enter, Escape) w komponentach wyszukiwania adresów.** Dodano nawigację klawiaturową (ArrowDown/ArrowUp/Enter/Escape), wizualne podświetlenie aktywnej pozycji (`bg-accent`) oraz `scrollIntoView` w komponentach `AddressRow` (pole ulicy + pole numeru budynku) i `BuildingAddressModal` (pole ulicy). Atrybuty ARIA (`aria-activedescendant`, `aria-selected`, `role="listbox/option"`) uzupełnione dla pełnej dostępności. | `frontend/src/components/AddressRow.tsx`, `frontend/src/components/BuildingAddressModal.tsx` |
| 2026-05-02 | **Frontend: Poprawiono walidację UI formularza rejestracji — zastąpiono natywne błędy HTML5 dla zgody RODO wbudowanymi komunikatami błędu, rozwiązując problem ze złym pozycjonowaniem dymków.** Dodano `noValidate` do `<form>`, usunięto atrybut `required` z checkboxa RODO, wprowadzono stan `gdprConsentError` z inline komunikatem błędu (`text-red-500`) wyświetlanym bezpośrednio pod tekstem zgody RODO. Brak zaznaczenia przy submit ustawia błąd inline (zamiast toastu); zaznaczenie checkboxa automatycznie go czyści. Atrybuty `aria-invalid` i `aria-describedby` zachowują dostępność. | `frontend/src/pages/Register.tsx` |
| 2026-05-02 | **Frontend: Ujednolicono wygląd popovera z listą budynków na karcie zdarzenia (styl zgodny z popupem mapy). Naprawiono błąd braku centrowania mapy przy ponownym kliknięciu w to samo zdarzenie na liście.** Popover otrzymał strukturę `space-y-1 text-sm min-w-[180px]` z `font-bold` tytułem, ulicą + pełną listą numerów, `StatusBadge` i opisem (muted-foreground xs). Fix centrowania: stan `focusedEventId: number\|null` zastąpiono `mapFocus: {id, trigger}\|null`; każde kliknięcie generuje nowy `trigger: Date.now()`, wymuszając re-run `useEffect` w `MapController` i wywołanie `flyTo`/`flyToBounds` nawet gdy `id` się nie zmienia. | `frontend/src/components/EventCard.tsx`, `frontend/src/components/EventMap.tsx`, `frontend/src/pages/Index.tsx` |
| 2026-05-02 | **Przygotowano repozytorium pod wdrożenie produkcyjnej ochrony Turnstile – usunięto testowe klucze z `.env.example` i zaktualizowano instrukcję `deployment_oracle_linux_9.md` o wymagane kroki konfiguracyjne.** W `.env.example` zastąpiono klucz `1x00000000000000000000AA` placeholderami `wprowadz_klucz_site_key` / `wprowadz_klucz_secret` z komentarzem ostrzegawczym; dodano brakującą zmienną `TURNSTILE_SECRET_KEY`. W dokumencie wdrożeniowym dodano nową podsekcję „Konfiguracja Cloudflare Turnstile" w sekcji 6 z krokami: logowanie do dash.cloudflare.com, rejestracja domeny, wklejenie kluczy do `.env`, nota o wymaganym przebudowaniu obrazu frontendu. Lokalny `.env` (środowisko deweloperskie) pozostał niezmieniony. | `.env.example`, `docs/deployment_oracle_linux_9.md`, `docs/lista_last.md` |
| 2026-05-02 | **Frontend: Zintegrowano WebSockets (ws_manager.py) dla widoku publicznego – lista zdarzeń odświeża się w czasie rzeczywistym po zmianach w panelu dyspozytora.** Stworzono hook `useEventWebSocket` (`hooks/useEventWebSocket.ts`): nawiązuje połączenie WS do `/api/v1/ws`, przy wiadomości `{"entity":"events"}` dispatchuje `mpwik:events:invalidate` — co `useEvents` obsługuje przez istniejący `addEventListener`. Połączenie zamykane przy odmontowaniu komponentu (brak wycieków pamięci); automatyczny reconnect z wykładniczym backoff (3 s → maks. 30 s). Polling co 60 sekund zachowany jako fallback. Backend posiadał już wywołania `ws_manager.broadcast` w `create_event`, `update_event` i `delete_event`. | `frontend/src/hooks/useEventWebSocket.ts`, `frontend/src/pages/Index.tsx` |
| 2026-05-02 | **Frontend: Poprawiono reaktywność mapy dyspozytora – poligony budynków aktualizują swój kolor (zielony/czerwony) natychmiast po usunięciu lub edycji adresu, bez konieczności odświeżania strony.** Przyczyną było to, że `layerKey` w `BuildingsLayer` zawierał tylko ID budynków (`b.id`), więc React-Leaflet nie remontował warstwy GeoJSON gdy zmieniała się tylko właściwość `has_address`. Rozwiązanie: klucz rozszerzono o flagę `has_address` (`${b.id}:${b.has_address ? 1 : 0}`), co wymusza odmontowanie i ponowne zamontowanie warstwy przy każdej zmianie stanu adresowego budynku. | `frontend/src/components/AdminMapView.tsx` |
| 2026-05-02 | **Backend: Poprawiono wyświetlanie nazw zdarzeń w powiadomieniach — zamieniono kody systemowe na polskie nazwy.** Dodano relację `event_type_obj` (viewonly, lazy="raise") z `Event` do `EventType` (join po `event_type` → `code`). Scentralizowano rozproszone słowniki mapujące kody na nazwy w `notification_service.py` do trzech modułowych stałych (`_EVENT_TYPE_SMS_LABEL`, `_EVENT_TYPE_EMAIL_SUBJECT_LABEL`, `_EVENT_TYPE_EMAIL_BODY_LABEL`). Nowy helper `_event_label(event, variant)` stosuje trzypoziomowy fallback: (1) hardkodowany słownik dla znanych typów z kontekstowym brzmieniem, (2) `event_type_obj.name_pl` z bazy danych (dla typów dodanych przez admina), (3) czytelny format kodu (podkreślenia → spacje, capitalize). Wszystkie funkcje `build_sms_message`, `build_email_subject`, `build_email_body`, `build_sms_retroactive_message`, `build_email_retroactive_body` używają helpera. `notify_event()` i `notify_new_subscriber_about_active_events()` ładują relację przez `selectinload(Event.event_type_obj)`. Endpoint IVR `/feed` również zaktualizowany. | `backend/app/models/event.py`, `backend/app/services/notification_service.py`, `backend/app/routers/events.py` |
