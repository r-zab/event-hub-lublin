# Roadmap finalna — Maj 2026 (System Powiadomień MPWiK Lublin)

**Data:** 2026-04-23
**Autor:** Senior Solution Architect / Bezpieczeństwo Systemów Krytycznych
**Bazuje na:** `docs/stan_projektu.md` + transkrypcje spotkania 23.04.2026 (cz.1 — WAF/Kacper, cz.2 — demo systemu/Piotr).
**Deadline operacyjny:** **14 maja 2026** (3 tygodnie). Gala: **28 maja 2026**.

---

## 1. Analiza stakeholderów

### 1.1. Piotr — Szef IT MPWiK

**Główna obawa:** *"lamerskie aplikacje wypisane tylko dzięki AI-owi"*. Nie ufa kodowi, którego autor nie rozumie. Spodziewa się hardeningu na poziomie produkcyjnym, nie demo.

**Priorytety (w kolejności):**
1. **Zero Trust wewnętrzny** — *"nie ufamy nikomu, nawet dyspozytor nie może wpisać do bazy głupkowatych ciągów znaków"*. Walidacja po stronie backendu, nawet dla zalogowanych ról.
2. **Anti-griefing rejestracji** — bez 2FA dowolny użytkownik może spamować numerami znajomych. *"Powstawiam mi głupkowate ulice, to będą dostawali smsy"*.
3. **Zachowanie historii** — kategoryczne: *"Usuń niech nie będzie. Tutaj przetrzymujemy te zdarzenia"*.
4. **Konfigurowalność** — listy wyboru zastąpione słownikami w DB (typy zdarzeń, kolory RGB, słownik komunikatów). System ma żyć po przekazaniu.
5. **Wymogi formalne** — WCAG 2.1, zgodność z polityką MPWiK (długość hasła 12+, prefix telefonu, polskie komunikaty).
6. **Akwizycja projektu** — chce projekt przejąć. Stawia to za Linuxem Oracle Linux 9 + za WAF-em Fortinet.

### 1.2. Kacper — Administrator/WAF

**Profil:** świeży specjalista, rozpracował FortiWeb sam. Patrzy z perspektywy operatora bezpieczeństwa, nie programisty.

**Priorytety:**
1. **Kompatybilność z WAF Fortinet** — system musi działać poprawnie za reverse proxy (X-Forwarded-Port/X-Real-IP, brak twardo zakodowanych URL-i sesyjnych blokujących `URL encryption`).
2. **Świadomość OWASP Top 10 + MITRE ATT&CK** — raporty WAF mapują ataki na te frameworki. Nasza aplikacja powinna używać tej samej terminologii w dokumentacji.
3. **Prefix telefonu** — sugestia operacyjna (UX), nie krytyczna.
4. **Granice segmentacji uprawnień** — *"Bądźmy szczerzy, że to się skończy średnio"* — przestroga przed nadmiernym RBAC. Aktualne rozwiązanie (admin/dispatcher) jest OK.

---

## 2. Gap Analysis — Demo vs. oczekiwania

| Obszar | Co pokazaliśmy | Czego oczekują | Gap |
|---|---|---|---|
| **Bezpieczeństwo aktywne** | Walidacja, rate-limit, RODO masking, RBAC | WAF blokuje aktywnie (FortiWeb: Suspicious→Denial, IP block, GeoIP blokowanie). Ich WAF blokował ataki 12×/dzień. | **Brak warstwy aktywnej obrony.** Pokażmy że system **jest gotowy do pracy ZA** WAF-em (X-Forwarded-For, trusted proxy, rate-limit jako uzupełnienie WAF, nie zamiennik). |
| **Anty-spam rejestracji** | Rate-limit 3/min, walidacja adresu | **2FA via SMS/email token** — Piotr wprost: *"Użyjcie tokenu rejestracji"*. Limit liczby adresów. Limit duplikatów ulic. | **3 brakujące mechanizmy** — najwyższy priorytet UX/security. |
| **Persystencja historii** | `DELETE /events` przenosi do statusu `usunieta` | Piotr: *"Przycisk usuń niech nie będzie"*. Czwarty kafelek "zamknięte zgłoszenia". | UI do poprawy: ukryć przycisk Usuń, dodać Zakończ + filtr widoku. |
| **Konfigurowalność operacyjna** | Hardkodowane typy zdarzeń, statusy, kolory | Słowniki w DB (event_types, message_templates) z możliwością dopisywania komunikatów typu *"woda niezdatna do picia"*, *"hydrant uszkodzony"*. | **Nowy model + migracja + UI admina.** |
| **Kontekst organizacyjny** | Brak pola "dział" przy zdarzeniu | TSK, TSW, TP — symbol działu (3 znaki) na zdarzeniu i userze. Filtrowanie po dziale. | **Nowy column + UI**. |
| **Polityka haseł** | min 8 znaków | min **12 znaków**, duże/małe/cyfry (bez znaków specjalnych na razie). | Walidator backend + frontend. |
| **CAPTCHA** | Brak | reCAPTCHA wygasa końcem 2026. Potrzebne rozwiązanie z dostępnością WCAG. | Niski priorytet — Piotr zostawia na "po MVP". |
| **Eksport danych** | Brak | Nice-to-have (CSV gridu zdarzeń). | Niski priorytet. |
| **Tablety RWD** | Mobile + desktop testowane | Tablety 10.1″ / 11″ pionowo i poziomo. | Tylko weryfikacja. |
| **WCAG** | 2.1 AA testowane axe | OK. Trzeba **uwypuklić w prezentacji** (nie zakładać że jury sprawdzi). | Sekcja w deck. |

### Kluczowe spostrzeżenia z demo WAF (cz.1) — wnioski dla nas

1. **WAF nie chroni przed `URL encryption`** w aplikacji ich e-booka (asseco DS), bo aplikacja ciągnie dane przez URL → **nasza aplikacja nie może popełnić tego samego błędu**. API ma używać POST + JSON body dla operacji wrażliwych (już mamy).
2. **CORS wyłączony w ich WAF** bo aplikacja ładuje third-party. **Nasza aplikacja powinna mieć restrykcyjny CORS** — pokazać to jako przewagę.
3. **Cookie Security ograniczony** u nich z powodu sesji multi-account. **My nie mamy tego problemu** — JWT bez ciastek, każdy user osobny token.
4. **Geo-IP blokowanie Rosji** — argument do dyskusji. Możemy pokazać że nasz `/auth/login` rate limit + nasłuchiwanie tylko na trusted proxy daje analogiczną ochronę bez pełnego WAF.
5. **MITRE/OWASP mapping** — Piotr koreluje raporty WAF z agencją rządową. **Nazwy podatności w naszej dokumentacji muszą być zgodne** (np. A01 Broken Access Control, A03 Injection).

---

## 3. Plan naprawczy — 3 tygodnie do 14 maja

**Legenda priorytetów:**
- **K** = Krytyczne (must-have, blokuje wdrożenie/oddanie)
- **W** = Ważne (oczekiwane przez Piotra, gap z demo)
- **U** = UX / "Wow Factor" (poprawia odbiór na gali)

### Tydzień 1 — 24.04 → 30.04 (Bezpieczeństwo i Anty-griefing)

| ID | Prio | Zadanie | Pliki / Komponenty | Oszacowanie |
|---|---|---|---|---|
| T1.1 | ✅ (K) | **2FA rejestracji subskrybenta** — endpoint `POST /subscribers/init` zwraca `pending_id` + wysyła 6-cyfrowy token SMS/email; `POST /subscribers/verify` finalizuje. Token TTL 24h, max 5 prób. | `routers/subscribers.py`, nowy model `PendingSubscriber`, migracja Alembic, `Register.tsx` (2-step wizard) | 1.5 dnia |
| T1.2 | ✅ (K) | **Limit liczby adresów per subskrybent** (max 5) + **deduplikacja** (street_id + house_number). Walidacja backend + UI. | `schemas/subscriber.py`, `Register.tsx` (`AddressRow.tsx`) | 0.5 dnia |
| T1.3 | ✅ (K) | **Polityka haseł 12+ znaków** — duże/małe/cyfry. Walidator Pydantic + komunikat 422 + wskaźnik siły hasła w UI tworzenia konta. | `schemas/user.py`, `AdminUsers.tsx` | 0.5 dnia |
| T1.4 | ✅ (K) | **Trusted Proxy / X-Forwarded-For** — konfiguracja FastAPI `ProxyHeadersMiddleware`, rate-limit slowapi po realnym IP zamiast IP łącza WAF. | `main.py`, `config.py` (`TRUSTED_PROXIES`) | 0.5 dnia |
| T1.5 | ✅ (W) | **Walidacja Zero Trust dyspozytora** — sanityzacja inputów `description`, `house_number_from/to`, `street_name`. Whitelist regex (cyfry + opcjonalne litery dla numerów: `^\d{1,4}[A-Za-z]?$`). | `schemas/event.py`, `schemas/street.py` | 0.5 dnia |
| T1.6 | ✅ (K) | **Token registration TTL** — komunikat w UI o ważności 24h. Cleanup cron: `clean_expired_pending_subscribers()` co 1h. | `notification_service.py`, `main.py` (scheduler) | 0.25 dnia |
| T1.7 | ✅ (W) | **Logowanie operacji dyspozytora** (audit log) — edycja/usuwanie adresów budynków na panelu dyspozytora. Zapis logów w `building_audit_log` z ID dyspozytora. | `routers/buildings.py` | 0.5 dnia |
| T1.8 | ✅ (U) | **Cloudflare Turnstile w `Register.tsx`** — zastąpiono captchę matematyczną widżetem Turnstile (`@marsidev/react-turnstile`, testowy sitekey). Przycisk „Wyślij kod" zablokowany do uzyskania tokenu. | `frontend/src/pages/Register.tsx`, `frontend/.env` | 0.25 dnia |
| T1.9 | ✅ (U) | **Cloudflare Turnstile w `Unsubscribe.tsx`** — zastąpiono captchę matematyczną Turnstile na kroku wpisywania tokenu wyrejestrowania. Wejście z linku URL pomija captchę (brak regresji UX). | `frontend/src/pages/Unsubscribe.tsx` | 0.25 dnia |

**Cel końca tygodnia 1:** Bezpieczeństwo na poziomie produkcyjnym MPWiK. System odporny na griefing i SQL/XSS injection po stronie zaufanej.

---

### Tydzień 2 — 01.05 → 07.05 (Konfigurowalność i Persystencja)

| ID | Prio | Zadanie | Pliki / Komponenty | Oszacowanie |
|---|---|---|---|---|
| T2.1 | ✅ (K) | **Słownik typów zdarzeń w DB** — model `EventType { id, code, name_pl, default_color_rgb, is_active }`. Seed: 3 obecne. UI admina `/admin/event-types` (CRUD). FK z `events.event_type_id`. Migracja konwertująca string→FK. | nowy model, migracja, `AdminEventTypes.tsx` | 1.5 dnia |
| T2.2 | ✅ (W) | **Słownik szablonów komunikatów** — model `MessageTemplate { id, code, body, event_type_id }`. Dropdown w `AdminEventForm.tsx` przy polu `description` ("Wstaw szablon"). Możliwość edycji po wstawieniu. | nowy model, migracja, `AdminMessageTemplates.tsx`, `AdminEventForm.tsx` | 1 dzień |
| T2.3 | ✅ (K) | **Ukrycie przycisku "Usuń"** + przycisk **"Zakończ"** zmieniający status → `usunieta` (już mamy soft-delete). Zmiana etykiety + ikony (CheckCircle zamiast Trash). | `AdminDashboard.tsx`, `AdminEventForm.tsx` | 0.25 dnia |
| T2.4 | ✅ (K) | **Czwarty kafelek "Zamknięte zgłoszenia"** + filtr `status_filter='usunieta'` po kliknięciu. Klikalność wszystkich 4 kafelków. | `AdminDashboard.tsx` | 0.5 dnia |
| T2.5 | ✅ (W) | **Pole `department` na `User`** (`VARCHAR(3)`, NULL ok). Dropdown w `AdminUsers.tsx`: `TSK, TSW, TP` (na razie hardkod, później słownik). Pole `created_by_department` na `Event` (denormalizacja, ustawiana z usera). | `models/user.py`, `models/event.py`, migracja, `AdminUsers.tsx`, `AdminDashboard.tsx` (kolumna + filtr) | 1 dzień |
| T2.6 | ✅ (U) | **Filtr "Dział" na dashboardzie** — dropdown obok istniejących filtrów. Zrealizowane w ramach T2.5 (dropdown Dział w toolbarze AdminDashboard + dept_filter na backendzie). | `AdminDashboard.tsx` | 0.25 dnia |
| T2.7 | ✅ (U) | **Prefix telefonu auto-+48** — `phone_format` field_validator w `schemas/subscriber.py` dodaje `+48` dla 9 cyfr; numery z prefiksem niezmienione. Zweryfikowane. | `backend/app/schemas/subscriber.py` | 0.25 dnia (weryfikacja) |

**Cel końca tygodnia 2:** System gotowy operacyjnie do przekazania MPWiK. Konfigurowalność bez ingerencji programisty.

---

### Tydzień 3 — 08.05 → 14.05 (Polish / Wow Factor / Deployment)

| ID | Prio | Zadanie | Pliki / Komponenty | Oszacowanie |
|---|---|---|---|---|
| T3.1 | **W** | **Deployment na Oracle Linux 9** — `docker-compose.prod.yml` + dokumentacja `docs/deployment_oracle_linux_9.md` (firewalld, SELinux, podman alternatywa). Test na VM. | `docker-compose.prod.yml`, nowy doc | 1 dzień |
| T3.2 | ✅ (K) | **Audyt WCAG 2.1 AA** — pełen przebieg axe-core + Lighthouse na: `/`, `/register`, `/sys-panel/dashboard`. Raport → `docs/wcag_audit_final.md`. | całość frontu | 0.5 dnia |
| T3.3 | **U** | **Tablety RWD** — testy na 10.1″ i 11″ (Chrome DevTools), pionowo/poziomo. Naprawa znalezionych regresji. | całość frontu | 0.5 dnia |
| T3.4 | **U** | **OWASP/MITRE mapping w dokumentacji** — sekcja w README/prezentacji mapująca nasze zabezpieczenia: A01 (RBAC), A03 (Pydantic + escape LIKE), A05 (HSTS-ready), A07 (rate-limit + 2FA). | `docs/security_mapping.md` | 0.5 dnia |
| T3.5 | **U** | **Demo data seed** — skrypt `seed_demo.py` ładujący 3-5 realistycznych zdarzeń + 10 subskrybentów + zamknięte historie. Reset jednym poleceniem. | nowy skrypt | 0.5 dnia |
| T3.6 | **K** | **Testy integracyjne — must-have flows** — pytest: 2FA rejestracja, deduplikacja adresów, RBAC dispatcher vs admin (CRUD users), DELETE zablokowany dla dyspozytora. | `backend/tests/test_*.py` | 1 dzień |
| T3.7 | ✅ (U) | **Eksport CSV — wszystkie tabele admina** — przycisk "Eksport CSV" w każdej tabeli: zdarzenia (z numerami z GeoJSON, data w nazwie pliku), subskrybenci, powiadomienia, logi audytowe. | `AdminDashboard.tsx`, `AdminSubscribers.tsx`, `AdminNotifications.tsx`, `AdminAuditLogs.tsx`, `backend/app/routers/events.py`, `backend/app/routers/admin.py` | 0.5 dnia |
| T3.8 | **U** | **Storyboard demo na galę** — `docs/demo_scenariusz_gala.md` — 10-minutowa narracja z timestampami, kto co klika, jakie ataki demonstrujemy. | nowy doc | 0.5 dnia |

**Cel 14 maja:** System działa na Oracle Linux 9, kompletna dokumentacja bezpieczeństwa, demo "na klik".

---

## 4. Strategia bezpieczeństwa (hardening)

### 4.1. Warstwy obrony — model "Defense in Depth"

```
┌─────────────────────────────────────┐
│ L7: WAF Fortinet (po przekazaniu)   │  ← OWASP Top 10, GeoIP, Bot mitigation
├─────────────────────────────────────┤
│ L6: Reverse Proxy (Nginx/Caddy)     │  ← TLS termination, HSTS, X-Forwarded-For
├─────────────────────────────────────┤
│ L5: FastAPI middleware              │  ← TrustedProxy, CORS, RateLimit (slowapi)
├─────────────────────────────────────┤
│ L4: Endpoint-level guards           │  ← RBAC dependencies, JWT validation
├─────────────────────────────────────┤
│ L3: Pydantic schema validation      │  ← Type, length, regex (Zero Trust)
├─────────────────────────────────────┤
│ L2: SQLAlchemy parameterized SQL    │  ← Brak konkatenacji, escape LIKE
├─────────────────────────────────────┤
│ L1: PostgreSQL row-level + audit    │  ← UNIQUE, FK, audit_log
└─────────────────────────────────────┘
```

### 4.2. Konkretne kroki hardeningu (uzupełnienie do P1-P12 z `stan_projektu.md`)

| Priorytet | Zadanie | Status | Mapowanie OWASP |
|---|---|---|---|
| **K** | Wymuszenie HTTPS + HSTS w nginx config (preprod) | TODO T3.1 | A02:2021 Cryptographic Failures |
| ✅ | Trusted Proxy headers (`X-Forwarded-For`, `X-Real-IP`) — gotowe na WAF | DONE (T1.4) | — (kompatybilność infra) |
| ✅ | 2FA rejestracji subskrybenta (token SMS/email) | DONE (T1.1) | A07:2021 Auth Failures |
| ✅ | Polityka haseł 12+ znaków admin/dispatcher | DONE (T1.3) | A07:2021 Auth Failures |
| ✅ | Zero Trust input validation (regex whitelist na house_number, sanityzacja description) | DONE (T1.5) | A03:2021 Injection |
| ✅ | Audit log operacji dyspozytora (StreetAuditLog) | DONE (T1.7) | A09:2021 Logging Failures |
| ✅ | Limit liczby adresów per subskrybent (anti-flood) | DONE (T1.2) | — (anti-griefing) |
| ✅ | Cleanup expired tokens (Pending subscribers) co 1h | DONE (T1.6) | A04:2021 Insecure Design |
| ✅ | RODO masking w `notification_log` + logach app/gateway | DONE (P9) | — |
| ✅ | Escapowanie LIKE injection w wyszukiwarce | DONE (P11) | A03:2021 Injection |
| ✅ | RBAC `DELETE /events` (dispatcher/admin) | DONE (P2) | A01:2021 Broken Access Control |
| ✅ | SECRET_KEY enforcement (no default) | DONE (P1) | A02:2021 Cryptographic Failures |
| ✅ | DB port niewystawiony, DEBUG=false w prod | DONE (P5/P6) | A05:2021 Misconfiguration |

### 4.3. E-book i ochrona danych klientów (wątek z cz.1)

Piotr podkreślił, że **WAF chroni e-book z danymi klientów** (faktury, zużycie wody, ścieki). Nasz system nie przetwarza tych danych, ale:

- Subskrybent podaje **nr telefonu + email + adres** — to są dane osobowe RODO.
- Wymóg: wszystkie te dane są **zamaskowane w logach** (✅ P9), a `unsubscribe_token` umożliwia **hard-delete** (✅).
- Należy w prezentacji **podkreślić** że minimalizujemy zakres danych (nie przechowujemy imienia/nazwiska, nr klienta MPWiK, danych z e-booka).

---

## 5. Sekcja "Gala Biznesu" — 3 funkcje na efekt "Wow"

Cel: 10 minut prezentacji przed jury i zarządem. Trzeba **uderzyć** w to, czego nie mają inni i co Piotr wprost pochwalił w demo.

### 🥇 Wow #1 — **Multi-click GIS na realnej mapie Lublina**

**Co pokazać:** dyspozytor klika 5-10 budynków na ulicy Nadbystrzyckiej → system natychmiast generuje listę dotkniętych adresów + filtruje subskrybentów po dokładnym numerze (nie po ulicy całej!).

**Dlaczego "Wow":**
- 51 643 realnych budynków z BDOT10k + PRG + OSM (nie zaślepki).
- 1378 ulic z TERYT (państwowy rejestr).
- Spatial join w Pythonie po `street_id` + `house_number` z `geojson_segment.features[].properties.house_number`.
- Piotr w demo wprost: *"Super, czyli jest multi-click. Dobra, super."*

**Punkt techniczny do uwypuklenia:** PostGIS 16-3.4 + indeks GIST na `buildings.geom`. Realne dane geoprzestrzenne, nie mockup.

---

### 🥈 Wow #2 — **Inteligentny silnik komunikatów (auto-extend + scenariusze SMS)**

**Co pokazać:**
1. Stworzenie zdarzenia → SMS do mieszkańca.
2. Aktualizacja `estimated_end` → SMS *"Aktualizacja. Nowy szacowany czas przywrócenia wody: 16:45"* (NIE duplikat poprzedniego!).
3. Zmiana statusu → SMS *"Status zmienił się ze zgłoszone na w naprawie"*.
4. Zdarzenie przeterminowane → automatyczne przedłużenie o 1h, bez działania dyspozytora (Scheduler co 1 min).
5. Cisza nocna 22-06 → SMS wstrzymany, wysłany rano o 06:00.

**Dlaczego "Wow":**
- Piotr explicite: *"Bardzo mi się podoba to automatyczne przedłużanie. Powiem Wam szczerze, nie pomyślałem o tym. Teraz jak to zobaczyłem, to jest super."*
- Trzy szablony powiadomień rozróżniane po kontekście (status-change vs. time-update vs. new-event).
- APScheduler + interval 1 min dla auto-close/auto-extend, 06:00 dla morning queue.

**Punkt techniczny:** asynchroniczność end-to-end (FastAPI async + asyncpg), brak blokowania UI, kolejka background jobs.

---

### 🥉 Wow #3 — **Hardening na poziomie systemu krytycznego (defense-in-depth)**

**Co pokazać:** slajd z piramidą warstw obrony (sekcja 4.1), pokaz na żywo:
- Próba SQL injection w wyszukiwarce ulic (`%%%`) → 0 wyników (escape).
- Próba brute-force `/auth/login` → po 5 próbach HTTP 429.
- Próba rejestracji 100 subskrybentów z jednego IP → rate-limit + 2FA blokuje.
- Maskowanie w logach: `+48 123 *** 89`, `m***k@lublin.eu` — pokaz w terminalu.

**Dlaczego "Wow":**
- MPWiK to infrastruktura krytyczna (woda). Jury i zarząd cenią dojrzałość bezpieczeństwa.
- **Mapowanie OWASP Top 10 na nasze zabezpieczenia** (A01, A02, A03, A07, A09 = checked). Tym samym językiem mówi WAF Fortinet → Piotr to doceni.
- Świadectwo gotowości **do pracy za WAF-em** (X-Forwarded-For, brak URL-encryption blokerów, restrykcyjny CORS).

**Punkt techniczny:** Pydantic v2 + slowapi + bcrypt cost 12 + JWT HS256 + RODO hard-delete + audit log.

---

## 6. Ograniczenia i ryzyka

| Ryzyko | Wpływ | Mitygacja |
|---|---|---|
| 2FA rejestracji wymaga prawdziwego SMS gateway w demo | Średni — bramka mockowa nie pokaże flow | Dla demo: tryb mock z wyświetleniem tokenu w UI/terminalu (już mamy w `gateways.py`). Przed wdrożeniem prod: SMSEagle. |
| Słownik typów zdarzeń = breaking change w `event_type` | Wysoki — migracja danych + frontend refactor | Migracja Alembic z konwersją `string→FK`. Kompatybilność wsteczna nie jest wymagana (greenfield). |
| Oracle Linux 9 + SELinux może blokować Docker bind-mount | Średni — opóźnienie deploymentu | Test wczesny (T3.1, dzień 1 tygodnia 3). Fallback: podman. |
| Prezentacja na gali bez Piotra (28.05) | Niski — Piotr jest sponsorem, nie prezenterem | Storyboard (T3.8) + prośba o opinię pisemną od Piotra przed galą. |
| Brak czasu na CAPTCHA przed 14.05 | Niski — Piotr sam zostawił to na "po MVP" | Pominięte w roadmapie. 2FA pokrywa większość przypadków. |

---

## 7. Definicja sukcesu (Done = Done)

System uznajemy za **gotowy do oddania 14.05** gdy:

1. ✅ Wszystkie zadania **K** (Krytyczne) z tygodni 1-3 zamknięte i przetestowane.
2. ✅ Pytest passes na flows: 2FA, RBAC, walidacja inputu.
3. ✅ Lighthouse a11y score ≥ 90 dla `/`, `/register`, `/sys-panel/dashboard`.
4. ✅ Działa na Oracle Linux 9 VM (lub podman jako fallback).
5. ✅ Dokumentacja: `security_mapping.md`, `wcag_audit_final.md`, `deployment_oracle_linux_9.md`, `demo_scenariusz_gala.md`.
6. ✅ Piotr + Kacper otrzymują dostęp do staging i potwierdzają "akceptuję" przed 14.05.

**Po 14.05:** soft-freeze. Dni 15-28 maja = wyłącznie polish prezentacji, drobne fixy z feedbacku Piotra, testy responsywności.

---

## 8. Uniwersalny prompt operacyjny (do realizacji zadań)

### 8.1. Jak używać

Skopiuj poniższy prompt i podmień TYLKO `<ID>` (np. `T1.1`, `T2.3`). Reszta jest stała — Claude sam odczyta kontekst z pliku roadmap, zrealizuje zadanie, zaktualizuje status i dopisze log.

### 8.2. Prompt (kopiuj-wklej)

```
Zrealizuj zadanie <ID> z docs/roadmap_finalna_maj.md.

ZASADY (egzekwuj sztywno, nie pytaj o potwierdzenie):

1. KONTEKST — przeczytaj WYŁĄCZNIE wiersz tabeli zadania <ID> z sekcji 3
   (Tydzień 1/2/3) w docs/roadmap_finalna_maj.md. Nie czytaj całego pliku
   ani stan_projektu.md, chyba że zadanie tego wymaga (wtedy targeted Read
   z offset/limit, nie cały plik).

2. PLAN — w jednym zdaniu sformułuj plan implementacji. Bez TaskCreate
   dla zadań < 4 kroków.

3. IMPLEMENTACJA — wykonaj zgodnie z kolumną "Pliki / Komponenty".
   Trzymaj się stacku z CLAUDE.md (FastAPI async, SQLAlchemy 2.0,
   shadcn/ui, Tailwind, zero `print()`, zero `any` w TS).

4. WERYFIKACJA — uruchom co minimum:
   - Backend: `cd backend && python -m pytest tests/<plik>.py -x` (jeśli
     dotyczy) LUB import-check `python -c "from app.main import app"`.
   - Frontend: `cd frontend && npm run build` (tylko jeśli zmiana TS/React).
   - Migracja: `cd backend && alembic upgrade head` jeśli dodano migrację.

5. AKTUALIZACJA ROADMAP — w docs/roadmap_finalna_maj.md:
   a) W tabeli sekcji 3 zmień ikonę priorytetu na ✅ (zachowaj literę K/W/U
      w nawiasie, np. `✅ (K)`).
   b) Dopisz wiersz do sekcji 9 "Log realizacji" w formacie:
      `| <ID> | YYYY-MM-DD | <1 zdanie co zrobiono> | <pliki, comma-sep> |`

6. RAPORT KOŃCOWY — max 3 zdania:
   - co zrobione,
   - status weryfikacji (PASS/FAIL + krótko dlaczego),
   - jeśli FAIL: co blokuje (BEZ próby naprawy bez zgody usera).

ZAKAZY:
- NIE commituj (chyba że user wprost prosi).
- NIE uruchamiaj `docker-compose up`, `npm run dev`, `uvicorn --reload`
  (długo żyjące procesy — user ma już swoje uruchomione).
- NIE modyfikuj zadań innych niż <ID>. Nie rób "przy okazji" cleanup'u.
- NIE pisz nowych dokumentów .md poza tymi wymaganymi przez zadanie.
- NIE aktualizuj docs/PROGRESS.md ani historia.md (zakaz z CLAUDE.md).

OPTYMALIZACJA TOKENÓW:
- Czytaj pliki targeted (offset/limit), nie w całości.
- Używaj Edit zamiast Write dla istniejących plików.
- Nie powtarzaj treści zadania w odpowiedzi — user ma plik otwarty.
- Bez emoji w kodzie. Komentarze tylko gdy WHY non-trivial.
```

### 8.3. Prompt skrócony (1-linijka, gdy znasz Claude'a)

```
Zrób <ID> z roadmap_finalna_maj.md zgodnie z sekcją 8 (zasady operacyjne).
```

### 8.4. Warianty

- **Tylko analiza/plan, bez kodu:** dopisz `STOP po kroku 2 (PLAN). Nie implementuj.`
- **Wsadowo wiele zadań:** `Zrealizuj sekwencyjnie: T1.2, T1.3, T1.6. Po każdym update roadmap. Raport zbiorczy na końcu.`
- **Tylko weryfikacja gotowego:** `Zweryfikuj że <ID> jest naprawdę zrobione (nie ufaj checkmarkowi). Jeśli braki — wymień je, nie naprawiaj.`

---

## 9. Log realizacji

| ID | Data | Co zrobiono | Pliki |
|---|---|---|---|
| — | — | _(pusto — uzupełniaj wg sekcji 8.2 krok 5b)_ | — |
| T1.1 | 2026-04-24 | Dodano 2FA rejestracji: model PendingSubscriber, endpointy /init i /verify, migrację Alembic, 2-krokowy wizard w Register.tsx | `models/pending_subscriber.py`, `models/__init__.py`, `schemas/subscriber.py`, `routers/subscribers.py`, `alembic/versions/20260424_add_pending_subscribers.py`, `frontend/src/pages/Register.tsx` |
| T1.2 | 2026-04-24 | Dodano limit 5 adresów i deduplikację (street_id + house_number) — walidator Pydantic w schemas i blokada przycisku + toast w Register.tsx | `backend/app/schemas/subscriber.py`, `frontend/src/pages/Register.tsx` |
| T1.3 | 2026-04-24 | Polityka haseł 12+ znaków (A-Z, a-z, 0-9): field_validator w CreateUserBody, walidacja w handleCreate, wskaźnik siły hasła (4-segmentowy pasek) w AdminUsers.tsx | `backend/app/routers/admin.py`, `frontend/src/pages/AdminUsers.tsx` |
| T1.4 | 2026-04-24 | ProxyHeadersMiddleware (uvicorn) + TRUSTED_PROXIES w config — slowapi rate-limit działa po realnym IP z X-Forwarded-For, nie IP WAF | `backend/app/main.py`, `backend/app/config.py` |
| T1.5 | 2026-04-25 | Walidatory Zero Trust: regex `^\d{1,4}[A-Za-z]?$` na house_number_from/to, sanityzacja description (brak `<>`, max 2000 znaków), whitelist na street_name (polskie litery, max 200 znaków) w EventCreate/EventUpdate; StreetCreate/StreetUpdate z walidacją | `backend/app/schemas/event.py`, `backend/app/schemas/street.py` |
| T1.6 | 2026-04-25 | Dodano `clean_expired_pending_subscribers()` do notification_service.py (delete gdzie expires_at < now); zarejestrowano job APScheduler co 1h w main.py; komunikat TTL 24h w UI już istniał (Register.tsx:310) | `backend/app/services/notification_service.py`, `backend/app/main.py` |
| T1.7 | 2026-04-25 | Dodano model StreetAuditLog wzorowany na BuildingAuditLog; migracja Alembic; endpointy POST/PUT /streets (dispatcher lub admin) z zapisem audit logu po każdej operacji | `backend/app/models/audit.py`, `backend/app/models/__init__.py`, `backend/alembic/versions/20260425_add_street_audit_log.py`, `backend/app/routers/streets.py` |
| T2.1 | 2026-04-25 | Słownik EventType (id/code/name_pl/default_color_rgb/is_active/sort_order) z seedem 3 typów; FK events.event_type → event_types.code; routery GET (publ.) + POST/PATCH/DELETE (admin); strona AdminEventTypes z CRUD; AdminEventForm pobiera typy dynamicznie z API zamiast hardkodu | `backend/app/models/event_type.py`, `backend/app/schemas/event_type.py`, `backend/app/routers/event_types.py`, `backend/alembic/versions/20260425b_add_event_types.py`, `backend/app/schemas/event.py`, `backend/app/routers/events.py`, `backend/app/main.py`, `frontend/src/pages/AdminEventTypes.tsx`, `frontend/src/pages/AdminEventForm.tsx`, `frontend/src/App.tsx`, `frontend/src/components/AdminLayout.tsx` |
| T2.2 | 2026-04-25 | Słownik MessageTemplate (id/code/body/event_type_id/is_active); routery GET (dispatcher/admin) + POST/PATCH/DELETE (admin); strona AdminMessageTemplates z CRUD; w AdminEventForm dodany dropdown "Wstaw szablon" obok pola Opis (filtruje po typie zdarzenia + uniwersalne) | `backend/app/models/message_template.py`, `backend/app/schemas/message_template.py`, `backend/app/routers/message_templates.py`, `backend/alembic/versions/20260425c_add_message_templates.py`, `backend/app/main.py`, `frontend/src/pages/AdminMessageTemplates.tsx`, `frontend/src/pages/AdminEventForm.tsx`, `frontend/src/App.tsx`, `frontend/src/components/AdminLayout.tsx` |
| T2.3 | 2026-04-25 | Przycisk "Usuń" (Trash2) w tabeli AdminDashboard zastąpiony przez "Zakończ" (CheckCircle, zielony); akcja wywołuje PUT /events/{id} {status:'usunieta'} zamiast DELETE — historia zachowana zgodnie z wymaganiem Piotra. Dialog potwierdzenia przeredagowany ("Zakończ zdarzenie", treść o przeniesieniu do zamkniętych) | `frontend/src/pages/AdminDashboard.tsx` |
| T2.1-T2.3 testy | 2026-04-25 | Dodano 16 testów pytest: test_event_types.py (8 - seed, RBAC, walidatory code/color, CRUD, 409 dup, integracja z POST /events), test_message_templates.py (7 - auth, RBAC, walidator XSS, CRUD z filtrem event_type_id + uniwersalne, 400 unknown FK), test_event_close.py (1 - PUT status='usunieta' zachowuje rekord, znika z listy aktywnej, dodaje wpis historii). Wspólny helper _auth_helpers.py z cache JWT (workaround na rate-limit /auth/login=5min). Wynik: 16/16 PASS w 2.82s | `backend/tests/test_event_types.py`, `backend/tests/test_message_templates.py`, `backend/tests/test_event_close.py`, `backend/tests/_auth_helpers.py` |
| T2.4 | 2026-04-25 | Dodano 4. kafelek "Zamknięte zgłoszenia" (icon Archive, count z statusFilter='usunieta'); wszystkie 4 kafelki klikalne z applyCardFilter() (reset filtrów + przełączenie na zakładkę lista); Tabs kontrolowany przez activeTab state; grid 2→4 kolumny | `frontend/src/pages/AdminDashboard.tsx` |
| T2.5 | 2026-04-25 | Pole department (VARCHAR 3, NULL ok) na User; pole created_by_department (denormalizacja) na Event; migracja Alembic; dropdown TSK/TSW/TP w AdminUsers (tworzenie + edycja) + kolumna Dział w tabeli; dropdown Dział w toolbarze AdminDashboard + kolumna Dział w tabeli zdarzeń; backend: dept_filter w GET /events | `backend/app/models/user.py`, `backend/app/models/event.py`, `backend/alembic/versions/20260425d_add_department_fields.py`, `backend/app/routers/admin.py`, `backend/app/routers/events.py`, `backend/app/schemas/event.py`, `frontend/src/data/mockData.ts`, `frontend/src/hooks/useEvents.ts`, `frontend/src/pages/AdminUsers.tsx`, `frontend/src/pages/AdminDashboard.tsx` |
| T1.5 (update) | 2026-04-25 | Zaostrzono walidatory Zero Trust: dodano blokadę % _ * (LIKE injection — OWASP A03) w _sanitize_description (event.py) i _validate_body (message_template.py); spójna reguła na backendzie dla obu pól | `backend/app/schemas/event.py`, `backend/app/schemas/message_template.py` |
| T1.5.1 | 2026-04-25 | Bugfix spójności Pydantic vs React: dodano FORBIDDEN_DESC_RE + checkDescription() na frontendzie; walidacja w onChange i onValueChange szablonu; blokada addToQueue i handleBulkSubmit; komunikat błędu pod Textarea; rozszerzono handle422Error o mapowania description/template | `frontend/src/pages/AdminEventForm.tsx` |
| T2.2 (bugfix) | 2026-04-25 | Naprawiono wyświetlanie name_pl zamiast kodu technicznego: typeLabel w generatorze wiadomości pobierany z eventTypesDict; QueueCard dostaje prop eventTypesDict i wyświetla name_pl; usunięto hardkodowaną mapę TYPE_LABELS | `frontend/src/pages/AdminEventForm.tsx` |
| T2.3 (update) | 2026-04-25 | Zmieniono tekst auto-przedłużania na: "Zdarzenie będzie przedłużane o 1h po minięciu szacowanego czasu zakończenia." | `frontend/src/pages/AdminEventForm.tsx` |
| T2.6 | 2026-04-25 | Zrealizowane w ramach T2.5 — dropdown "Dział" w toolbarze AdminDashboard (stan filtra + dept_filter w GET /events); kolumna Dział w tabeli zdarzeń | `frontend/src/pages/AdminDashboard.tsx`, `backend/app/routers/events.py` |
| T2.7 | 2026-04-25 | Zweryfikowano: field_validator `phone_format` w SubscriberCreate dodaje +48 dla 9 cyfr, numery z prefiksem +48 lub innym przepuszcza bez zmian; walidacja w schemacie — brak zmian wymaganych | `backend/app/schemas/subscriber.py` |
| T1.8 | 2026-04-25 | Zainstalowano @marsidev/react-turnstile; zastąpiono captchę matematyczną widżetem Cloudflare Turnstile (testowy sitekey 1x00000000000000000000AA w VITE_TURNSTILE_SITE_KEY); przycisk "Wyślij kod" zablokowany do uzyskania tokenu | `frontend/src/pages/Register.tsx`, `frontend/.env`, `frontend/package.json` |
| T1.9 | 2026-04-25 | Zastąpiono captchę matematyczną Turnstile w Unsubscribe.tsx na kroku wpisywania tokenu; auto-weryfikacja z URL-a nie wymaga captchy; przycisk "Sprawdź dane" zablokowany do uzyskania tokenu | `frontend/src/pages/Unsubscribe.tsx` |
| T1.7 (zmiana zakresu) | 2026-04-26 | Zmieniono zakres: zamiast StreetAuditLog skupiono się na building_audit_log; PATCH/DELETE /buildings zmienione z get_current_admin na get_current_dispatcher_or_admin; logger.info pokazuje id i rolę użytkownika | `backend/app/routers/buildings.py`, `docs/roadmap_finalna_maj.md` |
| T1.7 (bugfix) | 2026-04-26 | Naprawiono brak dostępu dyspozytora do edycji budynków: AdminMapView.tsx — isAdmin rozszerzone o role 'dispatcher' (click handler rejestrowany); BuildingAddressModal.tsx — isEditMode uwzględnia 'dispatcher' (tryb edycji + przycisk "Usuń adres" dostępny dla obu ról); schematy BuildingBboxResponse/BuildingUpdate były już poprawne (nullable) | `frontend/src/components/AdminMapView.tsx`, `frontend/src/components/BuildingAddressModal.tsx` |
| T1.7 (debug) | 2026-04-26 | Diagnoza błędu "admin ID w audit logu": pierwotna przyczyna to połączenie get_current_admin (403 dla dyspozytora) + brak click-handlera w mapie — oba naprawione wcześniej; dodano logger.debug("Wykonawca operacji: id, role") przed zapisem BuildingAuditLog w PATCH i DELETE; zweryfikowano: get_current_dispatcher_or_admin poprawnie wyciąga sub→username→user z JWT, user_id=current_user.id bez hardkodów, apiFetch zawsze wysyła Bearer token z localStorage | `backend/app/routers/buildings.py` |
| T1.7 (Zero Trust) | 2026-04-26 | Naprawiono logowanie roli w audycie budynków (role.capitalize() + username w debug), odblokowano edycję dla dyspozytora oraz wdrożono walidację Zero Trust dla house_number (max 5 znaków, A-Z0-9): field_validator w BuildingUpdate (regex ^[A-Z0-9]{1,5}$), sanityzacja toUpperCase+strip w input, maxLength=5, inline error pod polem | `backend/app/routers/buildings.py`, `backend/app/schemas/building.py`, `frontend/src/components/BuildingAddressModal.tsx` |
| Departments (bugfix 422) | 2026-04-26 | Usunięto Literal["TSK","TSW","TP"] z CreateUserBody/UpdateUserBody (admin.py) — zastąpiono str|None z walidatorem regex + DB-check _resolve_department(); migracja expand VARCHAR(3)→VARCHAR(5) dla users.department i events.created_by_department; modele User/Event zaktualizowane do String(5) | `backend/app/routers/admin.py`, `backend/app/models/user.py`, `backend/app/models/event.py`, `backend/alembic/versions/20260426b_expand_department_columns.py` |
| Departments | 2026-04-26 | Zakładka "Działy" w panelu admina: model Department (id/code VARCHAR5/name/is_active), migracja Alembic z seedem TSK/TSW/TP, router GET (publiczny) + POST/PATCH/DELETE (admin) z blokadą usunięcia gdy przypisani użytkownicy, hook useDepartments, strona AdminDepartments wzorowana na AdminEventTypes; dynamiczne dropdowny działów w AdminUsers (tworzenie + edycja) i AdminDashboard (filtr); link "Działy" w sidebar AdminLayout | `backend/app/models/department.py`, `backend/app/schemas/department.py`, `backend/app/routers/departments.py`, `backend/alembic/versions/20260426_add_departments.py`, `backend/app/models/__init__.py`, `backend/app/main.py`, `frontend/src/hooks/useDepartments.ts`, `frontend/src/pages/AdminDepartments.tsx`, `frontend/src/App.tsx`, `frontend/src/components/AdminLayout.tsx`, `frontend/src/pages/AdminUsers.tsx`, `frontend/src/pages/AdminDashboard.tsx` |
| T1.7 (finalizacja) | 2026-04-26 | Naprawiono identyfikację user_id (Depends poprawny), wdrożono Zero Trust dla numerów (regex ^[0-9][A-Z0-9]{0,4}$ — musi zaczynać się od cyfry), rygorystyczne filtrowanie wiodących cyfr w wyszukiwarce ulic (apiQuery = streetQuery.strip(/^\d+\s*/)) rozwiązuje problem "Lipowa z 1"; dropdown pokazuje wyłącznie s.name (bez street_type/kodów TERYT) | `backend/app/schemas/building.py`, `backend/app/routers/buildings.py`, `frontend/src/components/BuildingAddressModal.tsx` |
| Sprint 4 — T1.7 UI | 2026-04-26 | Strona "Logi dyspozytorów" (TYLKO ADMIN): endpoint GET /admin/audit-logs łączy BuildingAuditLog + StreetAuditLog + EventHistory; filtry po źródle/akcji/użytkowniku; paginacja; diff old→new w Dialog; ikona History w sidebarze widoczna tylko dla admina | `backend/app/routers/admin.py`, `frontend/src/pages/AdminAuditLogs.tsx`, `frontend/src/App.tsx`, `frontend/src/components/AdminLayout.tsx` |
| Sprint 4 — T2.8 | 2026-04-26 | Baza Ulic (ADMIN i DYSPOZYTOR): endpoint GET /streets/manage (paginacja, wyszukiwarka, auth dispatcher_or_admin); StreetAdminItem z polem geocoded (na podstawie teryt_sym_ul); StreetUpdate rozszerzony o teryt_sym_ul; strona AdminStreetsDatabase z tabelą ID TERYT/Nazwa/Status + modal edycji; link "Baza Ulic" (ikona Map) dla obu ról w sidebarze | `backend/app/schemas/street.py`, `backend/app/routers/streets.py`, `frontend/src/pages/AdminStreetsDatabase.tsx`, `frontend/src/App.tsx`, `frontend/src/components/AdminLayout.tsx` |
| Sprint 4 — U1.4 | 2026-04-26 | Refaktoring strony About: sekcje Misja (szybkie powiadamianie, 3 statystyki), RODO (brak spamu, nocne SMS za zgodą, hard delete, maskowanie), Technologia (TERYT, PostGIS, FastAPI, ochrona), Twórcy (Rafał/Jakub/Mateusz — Politechnika Lubelska); zachowano accordion rejestracji i wyrejestrowania | `frontend/src/pages/About.tsx` |
| Ad-Hoc P1 | 2026-04-27 | Naprawa paginacji AdminNotifications: Math.max(1,...) zapobiega totalPages=0 i błędnemu "Next" enabled; Next disabled={page >= totalPages}; useEffect resetuje page→1 przy zmianie dowolnego filtra | `frontend/src/pages/AdminNotifications.tsx` |
| Ad-Hoc P2 | 2026-04-27 | Kafelki statusów AdminDashboard: wyraźniejszy hover (ring+shadow+tło muted), aktywny stan bg-primary/10 + shadow-md (wcześniej bg-primary/5 + shadow-sm) | `frontend/src/pages/AdminDashboard.tsx` |
| Ad-Hoc P3 | 2026-04-27 | Wymuszenie wyboru ulicy z listy w Index.tsx: auto-search po kliknięciu sugestii, przycisk Sprawdź disabled bez selectedStreet, X (clear) w inpucie, ring-green po wyborze, hint text gdy typing-bez-wyboru, "Nie znaleziono" w dropdownie | `frontend/src/pages/Index.tsx` |
| T3.7 | 2026-04-27 | Dodano endpoint GET /events/export.csv (StreamingResponse, utf-8-sig dla Excel, filtry tożsame z listą, auth dispatcher/admin, limit 5000 rekordów, log z liczebnością); przycisk "Eksport CSV" (Download icon) w toolbarze AdminDashboard z pobieraniem przez sessionStorage token | `backend/app/routers/events.py`, `frontend/src/pages/AdminDashboard.tsx` |
| T3.7 ext | 2026-04-28 | Rozszerzono eksport CSV: (1) numery z geojson_segment zamiast zakresu from/to, (2) data w nazwie pliku YYYY-MM-DD, (3) eksport dla admin/subscribers + admin/notifications + admin/audit-logs (każdy z przyciskiem w toolbarze), (4) pageSize→50 + opcje 10/25/50/100/250 we wszystkich 4 tabelach, (5) useEffect reset page→1 w AdminSubscribers + AdminAuditLogs, (6) fix layout shift Index.tsx (min-h hint), (7) usunięto stare docs/ + aktualizacja README.md | `events.py`, `admin.py`, `AdminAuditLogs.tsx`, `AdminSubscribers.tsx`, `AdminNotifications.tsx`, `AdminDashboard.tsx`, `Index.tsx`, `README.md` |
| Bugfix-pagination | 2026-04-28 | Naprawa paginacji we wszystkich 4 tabelach admina: usunięto szerokie useEffect([...wszystkieFiltery]) — zastąpiono inline setPage(1) bezpośrednio w handlerach onChange/onValueChange/onCheckedChange (AdminNotifications: 4 handlery, AdminSubscribers: 4 handlery, AdminDashboard: usunięto useEffect — inline handlery już były); w AdminAuditLogs zawężono useEffect do [debouncedUser] (handlery sourceFilter/actionFilter już miały inline setPage). Usunięto import useEffect z AdminNotifications i AdminSubscribers | `frontend/src/pages/AdminDashboard.tsx`, `frontend/src/pages/AdminNotifications.tsx`, `frontend/src/pages/AdminSubscribers.tsx`, `frontend/src/pages/AdminAuditLogs.tsx` |
| Bugfix-csv-names | 2026-04-28 | Unikalne nazwy plików CSV we wszystkich 4 komponentach: AdminDashboard→`zdarzenia_eksport_YYYY-MM-DD.csv`, AdminNotifications→`logi_powiadomien_eksport_YYYY-MM-DD.csv`, AdminSubscribers→`subskrybenci_eksport_YYYY-MM-DD.csv`, AdminAuditLogs→`logi_audytowe_eksport_YYYY-MM-DD.csv`; data generowana przez `new Date().toISOString().split('T')[0]` w chwili kliknięcia | `frontend/src/pages/AdminDashboard.tsx`, `frontend/src/pages/AdminNotifications.tsx`, `frontend/src/pages/AdminSubscribers.tsx`, `frontend/src/pages/AdminAuditLogs.tsx` |
| DEBUG-session | 2026-04-26 | Wyeliminowano wyciek sesji przy przełączaniu kont Admin/Dispatcher: login() czyści stare tokeny przed zapisem nowych (localStorage.removeItem x2), AdminLogin.tsx używa window.location.href zamiast navigate() — twarde przeładowanie usuwa cache React Query; dodano logger.debug("JWT Sub: %s | DB User: %s (ID: %d)") w get_current_user do weryfikacji tożsamości tokenu w konsoli backendu | `frontend/src/hooks/useAuth.tsx`, `frontend/src/pages/AdminLogin.tsx`, `backend/app/dependencies.py` |
| NAPRAWA KRYTYCZNA | 2026-04-26 | Przejście na sessionStorage dla pełnej izolacji sesji między kartami i uniemożliwienia przejęcia panelu admina przez token dyspozytora: wszystkie localStorage→sessionStorage w useAuth.tsx i api.ts (14 miejsc); ProtectedAdminLayout weryfikuje nie tylko isAuthenticated ale i czy role='admin'\|'dispatcher' — token z null/nieznaną rolą: sessionStorage.clear() + redirect do logowania; build ✅ 4.60s | `frontend/src/hooks/useAuth.tsx`, `frontend/src/lib/api.ts`, `frontend/src/components/ProtectedAdminLayout.tsx` |
| T2.5 (update) | 2026-04-26 | Wymagany wybór działu w formularzu zdarzeń: pole created_by_department dodane do EventCreate; backend: dept = form_value or user.department (exclude z model_dump); frontend: useDepartments + required Select z działu przed typem zdarzenia; maskowanie działu w EventCard i notification_service — już było "MPWiK Lublin" | `backend/app/schemas/event.py`, `backend/app/routers/events.py`, `frontend/src/pages/AdminEventForm.tsx` |
| T2.9 | 2026-04-26 | Edycja oczekujących w kolejce: QueueCard dostał przycisk Pencil (onEdit prop); restoreFromQueue() przywraca wszystkie pola formularza + budynki z geojson_segment (pendingRestoreIdsRef) i usuwa pozycję z kolejki; toast "Wczytano do edycji" | `frontend/src/pages/AdminEventForm.tsx` |
| T2.10 | 2026-04-26 | Multi-filtrowanie + paginacja w AdminSubscribers i AdminNotifications: useState(pageSize) z domyślnym 20; Select dropdown 20/30/40/50 w toolbarze obu stron; queryKey i queryFn uwzględniają pageSize; przy zmianie pageSize reset do page=1; build ✅ 5.37s | `frontend/src/pages/AdminSubscribers.tsx`, `frontend/src/pages/AdminNotifications.tsx` |
| U1.3 | 2026-04-26 | Lifting wizualny kart statystyk w AdminDashboard: layout zmieniony na "etykieta + ikona w kolorowym tle / liczba / podpis"; ikony w rounded-lg z kolorowym bg (orange/red/amber/slate); licznik 3xl bold tabular-nums; gap 4→spójne padding p-5 | `frontend/src/pages/AdminDashboard.tsx` |
| UI — filtrowanie AND | 2026-04-26 | Wdrożono złożone filtrowanie na panelu dyspozytora (status z kafelka + typ zdarzenia z dropdownu); kafelki nie resetują filtru typu (AND-koniunkcja); usunięto redundantny dropdown wyboru statusu; zastąpiono pill-e typów Select'em w toolbarze | `frontend/src/pages/AdminDashboard.tsx` |
| UI — sticky sidebar | 2026-04-26 | Zoptymalizowano nawigację: wdrożono zablokowany pasek boczny (h-screen sticky top-0 na aside, overflow-hidden na wrapper, overflow-y-auto na main); dolne przyciski "Strona główna"/"Wyloguj" odsunięte od krawędzi przez pb-6 | `frontend/src/components/AdminLayout.tsx` |
| T3.2 | 2026-04-30 | Audyt WCAG 2.1 AA: Lighthouse na `/`, `/register`, `/admin/dashboard` (score 95/95/99); naprawiono 3 naruszenia poziomu A: role="log" na toast ol, sr-only na nav linki mobilne, aria-label na search w dashboardzie; raport w docs/wcag_audit_final.md | `frontend/src/components/ui/toast.tsx`, `frontend/src/components/PublicLayout.tsx`, `frontend/src/pages/AdminDashboard.tsx`, `docs/wcag_audit_final.md` |
## [Unreleased] — 2026-04-30

### Naprawiono

#### Paginacja i filtracja — przeniesienie filtrów na serwer

**AdminNotifications (Log powiadomień)**
- Filtry (`channel`, `status_filter`, `period`, `search`) przeniesione z warstwy client-side (`useMemo`) na serwer — backend teraz filtruje przed paginacją.
- `queryKey` rozszerzony o wszystkie aktywne filtry — React Query poprawnie odświeża dane przy każdej zmianie filtra.
- `totalPages` teraz opiera się na `total_count` zwróconej przez API po zastosowaniu filtrów (nie na globalnej liczbie rekordów).
- Zmiana dowolnego filtra resetuje `page` do 1.

**AdminSubscribers (Subskrybenci)**
- Filtry (`search`, `channel`, `night_only`, `street_filter`) przeniesione na serwer — analogiczny zestaw zmian jak w AdminNotifications.
- Dropdown ulic zawiera zawsze aktualnie wybrany wpis, nawet jeśli nie pojawia się na bieżącej stronie wyników.

#### Eksport CSV — synchronizacja filtrów i dynamiczne nazwy plików

**AdminNotifications**
- Eksport przekazuje teraz do API dokładnie te same parametry filtrowania co aktywny widok tabeli.
- Nazwa pliku: `logi_powiadomien_[kanał]_[status]_[okres]_YYYYMMDD_HHmmss.csv` — odzwierciedla aktywne filtry i unikalny timestamp.

**AdminSubscribers**
- Eksport przekazuje aktywne filtry (`search`, `channel`, `night_only`, `street_filter`).
- Nazwa pliku: `subskrybenci_[kanał]_[nocni]_[ulica]_YYYYMMDD_HHmmss.csv`.

**AdminAuditLogs (Logi dyspozytorów)**
- Naprawiono brakujący parametr `user_filter` w żądaniu eksportu — eksport uwzględnia teraz wyszukiwanie po użytkowniku.
- Nazwa pliku: `logi_audytowe_[źródło]_[akcja]_[użytkownik]_YYYYMMDD_HHmmss.csv`.

**AdminDashboard (Zdarzenia)**
- Dynamiczna nazwa pliku: `zdarzenia_[typ]_[status]_[dział]_YYYYMMDD_HHmmss.csv` — tylko aktywne filtry wchodzą w skład nazwy.

#### Czytelność filtrów — szerokość dropdownów w pasku filtrów

**AdminNotifications (Log powiadomień) i AdminSubscribers (Subskrybenci)**
- Dropdowny filtrów (kanał, status, okres) zmienione z `w-36` (144 px) na `min-w-[11rem]` (176 px) — pełny tekst placeholdera ("Wszystkie kanały", "Wszystkie statusy") jest teraz widoczny bez wielokropka.
- Układ `flex-wrap` w pasku narzędzi zapewnia poprawne zawijanie elementów na węższych ekranach.

#### Backend (admin.py)

- `GET /admin/notifications` — nowe parametry zapytania: `search`, `channel`, `status_filter`, `period` z filtrowaniem po stronie bazy danych.
- `GET /admin/subscribers` — nowe parametry: `search`, `channel`, `night_only`, `street_filter` z filtrowaniem i poprawnym liczeniem `total_count`.
- `GET /admin/notifications/export.csv` — te same filtry co endpoint listy.
- `GET /admin/subscribers/export.csv` — te same filtry co endpoint listy.



