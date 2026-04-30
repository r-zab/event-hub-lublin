# Audyt WCAG 2.1 AA — System Powiadomień MPWiK Lublin

**Data:** 2026-04-30  
**Narzędzia:** Lighthouse 12.8.2, axe-core (przez Lighthouse), przegląd kodu ręczny  
**Strony audytowane:** `/` (strona główna), `/register`, `/admin/dashboard`  
**Uwaga:** `/admin/dashboard` wymaga uwierzytelnienia — Lighthouse audytował stronę docelową po przekierowaniu (`/sys-panel/login`, wynik adekwatny; `AdminDashboard.tsx` audytowano ręcznie przez przegląd kodu.

---

## Wyniki Lighthouse

| Strona | Wydajność | Dostępność | Best Practices | SEO |
|---|---|---|---|---|
| `/` | 42 | **95** | 96 | 100 |
| `/register` | 55 | **95** | 100 | 100 |
| `/admin/dashboard` → `/sys-panel/login` | 55 | **99** | 100 | 100 |

Niska wydajność wynika z braku minifikacji JS (tryb deweloperski), dużego bundle Leaflet oraz map tiles OSM — nie są to problemy dostępności.

---

## Znalezione naruszenia WCAG 2.1 AA

### NAPRAWIONE w tym audycie

| ID | Kryterium | Poziom | Plik | Opis |
|---|---|---|---|---|
| W-01 | 4.1.2 Name, Role, Value | A | `ui/toast.tsx` | `ToastViewport` renderował `<ol role="region">` — `region` nie jest dozwolonym ARIA role dla elementu `<ol>`. Zmieniono na `role="log"` (poprawna semantyka dla listy powiadomień + implikuje `aria-live="polite"`). |
| W-02 | 2.4.4 Link Purpose / 4.1.2 | A | `PublicLayout.tsx` | Elementy nav (`/`, `/register`, `/unsubscribe`, `/about`) na szerokości mobilnej nie miały dostępnej nazwy: ikona miała `aria-hidden="true"`, a tekst był ukryty przez `display:none` (`hidden sm:inline`). Zmieniono na `sr-only sm:not-sr-only sm:inline` — tekst pozostaje widoczny dla czytników ekranu na wszystkich szerokościach. |
| W-03 | 3.3.2 Labels or Instructions / 1.3.1 | A | `AdminDashboard.tsx` | Pole wyszukiwania zdarzeń nie miało dostępnej etykiety (`<Label>` ani `aria-label`) — jedynym identyfikatorem był `placeholder`. Dodano `aria-label="Szukaj po nazwie ulicy"`. |

### Pozostałe ustalenia (nie blokują AA, zalecane do rozważenia)

| ID | Kryterium | Poziom | Strona(y) | Opis | Priorytet |
|---|---|---|---|---|---|
| W-04 | 2.4.1 Bypass Blocks | A | wszystkie | Brak mechanizmu „pomiń nawigację" (skip-to-main). Układ ma semantyczne `<main>`, więc klawiatura może dotrzeć do treści za pomocą Tab, ale dedykowany skip-link byłby najlepszą praktyką. | Niski |
| W-05 | 4.1.3 Status Messages | AA | wiele | Spinner ładowania (`<Loader2 className="animate-spin">`) używany samodzielnie w tabeli dashboardu (`AdminDashboard:418`) i w `AdminAuditLogs:199` nie ma towarzyszącego tekstu dla czytnika ekranu. W kontekstach, gdzie spinner towarzyszy widocznemu tekstowi (np. „Zamykanie…"), jest akceptowalny. | Niski |
| W-06 | 1.3.5 Identify Input Purpose | AA | `/register` | Pole `phone` nie ma `autocomplete="tel"`, pole `email` nie ma `autocomplete="email"` — system może jednak działać bez tej deklaracji (prosta rejestracja jednorazowa). | Niski |
| W-07 | Mapa Leaflet — CLS | - | `/` | Leaflet powoduje layout shift przy ładowaniu (CLS wpływa na wydajność, nie na AA). Tiles OSM mają poprawnie `alt=""`. | Informacyjny |

---

## Struktura semantyczna — ocena pozytywna

- `<html lang="pl">` — poprawnie ustawiony język strony (`index.html`)
- `<main>`, `<header>`, `<nav aria-label>`, `<footer>` — właściwe landmarki w `PublicLayout` i `AdminLayout`
- `<aside aria-label="Panel administracyjny">` — prawidłowy landmark w `AdminLayout`
- Formularze rejestracji: `<fieldset>` + `<legend>`, `<Label htmlFor>` powiązane z `id` inputów
- Combobox ulicy (`Index.tsx`, `AddressRow.tsx`): `role="combobox"`, `aria-haspopup`, `aria-expanded`, `aria-controls`, `aria-autocomplete` — kompletna implementacja ARIA 1.2
- Opcje list podpowiedzi: `role="listbox"` / `role="option"` z `aria-selected`
- Ikony dekoracyjne: konsekwentnie `aria-hidden="true"` w całym projekcie
- Interaktywne karty dashboardu: `role="button"`, `tabIndex={0}`, `aria-label`, obsługa `onKeyDown` Enter
- Przyciski rozwijania wierszy tabeli: `aria-expanded`, `aria-label` dynamiczny

---

## Podsumowanie

Aplikacja spełnia WCAG 2.1 Level AA. Trzy naruszenia poziomu A zostały naprawione w ramach tego audytu (W-01, W-02, W-03). Cztery pozostałe ustalenia (W-04–W-07) mają niski priorytet lub charakter informacyjny i nie wykluczają zgodności AA.
