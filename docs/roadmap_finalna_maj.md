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
| T1.7 | ✅ (W) | **Logowanie operacji dyspozytora** (audit log) — dodawanie/edycja ulicy z poziomu dyspozytora. Reuse `BuildingAuditLog` jako wzorzec → nowy `StreetAuditLog`. | nowy model + migracja | 0.5 dnia |

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
| T2.6 | **U** | **Filtr "Dział" na dashboardzie** — dropdown obok istniejących filtrów. | `AdminDashboard.tsx` | 0.25 dnia |
| T2.7 | **U** | **Prefix telefonu auto-+48** — gdy user wpisze 9 cyfr bez prefiksu → backend dokleja `+48`. Międzynarodowi (z `+`) niezmienieni. (Już istnieje wg cz.2 transkrypcji — **weryfikacja**.) | `schemas/subscriber.py` | 0.25 dnia (weryfikacja) |

**Cel końca tygodnia 2:** System gotowy operacyjnie do przekazania MPWiK. Konfigurowalność bez ingerencji programisty.

---

### Tydzień 3 — 08.05 → 14.05 (Polish / Wow Factor / Deployment)

| ID | Prio | Zadanie | Pliki / Komponenty | Oszacowanie |
|---|---|---|---|---|
| T3.1 | **W** | **Deployment na Oracle Linux 9** — `docker-compose.prod.yml` + dokumentacja `docs/deployment_oracle_linux_9.md` (firewalld, SELinux, podman alternatywa). Test na VM. | `docker-compose.prod.yml`, nowy doc | 1 dzień |
| T3.2 | **K** | **Audyt WCAG 2.1 AA** — pełen przebieg axe-core + Lighthouse na: `/`, `/register`, `/sys-panel/dashboard`. Raport → `docs/wcag_audit_final.md`. | całość frontu | 0.5 dnia |
| T3.3 | **U** | **Tablety RWD** — testy na 10.1″ i 11″ (Chrome DevTools), pionowo/poziomo. Naprawa znalezionych regresji. | całość frontu | 0.5 dnia |
| T3.4 | **U** | **OWASP/MITRE mapping w dokumentacji** — sekcja w README/prezentacji mapująca nasze zabezpieczenia: A01 (RBAC), A03 (Pydantic + escape LIKE), A05 (HSTS-ready), A07 (rate-limit + 2FA). | `docs/security_mapping.md` | 0.5 dnia |
| T3.5 | **U** | **Demo data seed** — skrypt `seed_demo.py` ładujący 3-5 realistycznych zdarzeń + 10 subskrybentów + zamknięte historie. Reset jednym poleceniem. | nowy skrypt | 0.5 dnia |
| T3.6 | **K** | **Testy integracyjne — must-have flows** — pytest: 2FA rejestracja, deduplikacja adresów, RBAC dispatcher vs admin (CRUD users), DELETE zablokowany dla dyspozytora. | `backend/tests/test_*.py` | 1 dzień |
| T3.7 | **U** | **Eksport CSV dashboardu** — przycisk "Eksport" → CSV z aktualnymi filtrami. (Nice-to-have wymieniony przez Piotra.) | `AdminDashboard.tsx`, nowy endpoint `/events/export.csv` | 0.5 dnia |
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
| **K** | Trusted Proxy headers (`X-Forwarded-For`, `X-Real-IP`) — gotowe na WAF | TODO T1.4 | — (kompatybilność infra) |
| **K** | 2FA rejestracji subskrybenta (token SMS/email) | TODO T1.1 | A07:2021 Auth Failures |
| **K** | Polityka haseł 12+ znaków admin/dispatcher | TODO T1.3 | A07:2021 Auth Failures |
| **K** | Zero Trust input validation (regex whitelist na house_number, sanityzacja description) | TODO T1.5 | A03:2021 Injection |
| **W** | Audit log operacji dyspozytora (StreetAuditLog) | TODO T1.7 | A09:2021 Logging Failures |
| **W** | Limit liczby adresów per subskrybent (anti-flood) | TODO T1.2 | — (anti-griefing) |
| **W** | Cleanup expired tokens (Pending subscribers) co 1h | TODO T1.6 | A04:2021 Insecure Design |
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


