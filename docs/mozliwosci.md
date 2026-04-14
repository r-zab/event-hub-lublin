# Możliwości: Mapa adresów Lublin w panelu admina

## Aktualny stan po imporcie (2026-04-15, po Scenariuszu 4)

Po uruchomieniu `import_buildings.py` **oraz** `import_osm_supplement.py`:

| | Liczba |
|---|---|
| Budynki łącznie w bazie | **51 643** |
| Z pełnym adresem (`full_address`) | **41 725** |
| Bez adresu (garaże, obiekty tech. BDOT10k) | **9 918** |
| Poligony (`geom_type='polygon'`) | 48 973 |
| Punkty — markery (`geom_type='point'`) | 2 670 |
| Z BDOT10k + PRG (pierwotny import) | 46 596 |
| Dokooptowane z OSM `way` (poligon) | 2 377 |
| Dokooptowane z OSM `node` (punkt) | 2 670 |
| Adres OSM bez dopasowanego `street_id` | 885 |

Stan wyjściowy przed Scenariuszem 4: 46 596 budynków, 36 678 z adresem. Scenariusz 4 dołożył **+5 047 adresów** (2 377 poligonów + 2 670 punktów).

Źródła danych:
- `budynki_surowe.geojson` — 46k poligonów BDOT10k
- `adresy_surowe.geojson` — 28 938 punktów PZGIK
- `lubelskie-260413.osm.pbf` — 131 MB, ~35k adresów OSM dla Lublina

**Ograniczenie pierwotne:** PZGIK ma 28 938 adresów, a w bazie (po pierwszym imporcie) wylądowało 36 678 budynków z adresem — część adresów PZGIK nie trafia do żadnego poligonu BDOT10k. Scenariusz 4 pokrył dużą część luki, ale zostaje osobny problem opisany niżej w sekcji „Adresy widoczne na Geoportalu, ale bez obrysu + adresu w bazie".

---

## Cel

Każdy adres w Lublinie wyszukiwalny w panelu → zaznaczony na mapie jako:
- **poligon** — jeśli mamy obrys budynku
- **punkt (marker)** — jeśli adres istnieje tylko jako węzeł bez poligonu

---

## Źródła danych i co w nich jest

### A) PZGIK (`adresy_surowe.geojson`) — już w projekcie
- 28 938 punktów adresowych (oficjalny rejestr państwowy)
- Kolumny: `NUMER_PORZ`, `NAZWA_ULC`, `KOD_POCZT`, geometry POINT
- Brak numerów: 2, 4, 6, 8... (niepełna numeracja) — zależy od tego co zgłoszono do rejestru
- **Używany już przez `import_buildings.py`** — spatial join z BDOT10k

### B) OSM PBF (`lubelskie-260413.osm.pbf`) — dostępny lokalnie
- 35 241 adresów dla Lublina (`addr:city=Lublin`):

| Typ | Liczba | Co to jest |
|-----|--------|------------|
| `way` z `addr:housenumber` | **22 444** | Poligon budynku z adresem wbudowanym |
| `node` z `addr:housenumber` | **12 721** | Punkt adresowy (często klatki w bloku) |
| `relation` z `addr:housenumber` | 72 | Złożone obiekty (pomijalne) |

---

## Scenariusze realizacji

### Scenariusz 1 — Way OSM z adresem bezpośrednim ✅ PROSTE
**22 444 budynków OSM które SAME mają addr:housenumber**

- Wyciągamy z PBF: geometria poligonu + adres w jednym obiekcie
- 1 way = 1 rekord w bazie
- Mapa: wyświetlamy poligon
- **Nakład: 3–4h (skrypt pyosmium → insert)**

---

### Scenariusz 2 — Jeden poligon, kilka węzłów adresowych w środku ✅ ŚREDNIE
**Np. blok wieloklatokowy: poligon way bez addr, ale w środku 3 węzły: nr 3, 3A, 3B**

- Spatial join: każdy węzeł adresowy → szukaj poligonu który go zawiera
- Wynik: ten sam poligon zapisany 3 razy z różnymi adresami
- Na mapie: po wyszukaniu "Jana Matejki 3A" podświetla się ten blok
- **Nakład: 4–5h (spatial join pyosmium buildings + addr nodes)**

---

### Scenariusz 3 — Węzeł adresowy poza każdym poligonem ✅ PROSTE
**Część z 12 721 węzłów nie leży w żadnym budynku OSM**

- Po spatial join zostają "osierocone" punkty
- Zapisujemy do bazy jako `geom_type='point'` zamiast poligonu
- Mapa: wyświetla marker/pinezka w miejscu węzła
- **Nakład: 1–2h (odfiltrowanie i insert jako POINT)**

---

### Scenariusz 4 — Uzupełnienie braków PZGIK węzłami OSM ✅ REKOMENDOWANE
**Zamiast przebudowywać import od zera — dołóż brakujące adresy z OSM PBF**

Porównaj:
- 36 678 adresów już w bazie (PZGIK + BDOT10k)
- OSM PBF ma adresy których PZGIK nie ma (np. nowe budynki, literowe klatki)

Algorytm:
1. Weź listę adresów z bazy (ulica + numer)
2. Z OSM PBF wyciągnij adresy których NIE MA w bazie
3. Dla brakujących — spatial join z poligonami OSM, lub wstaw jako punkt
4. Wynik: baza uzupełniona bez kasowania obecnej zawartości

**Nakład: 5–6h**

---

## Proponowany schemat rozszerzenia tabeli `buildings`

```sql
-- nowe kolumny (migracja Alembic)
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS osm_way_id   BIGINT;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS osm_node_id  BIGINT;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS geom_type    VARCHAR(10) DEFAULT 'polygon';
-- geom_type: 'polygon' | 'point'
```

---

## Widok w panelu admina

```
[ Wyszukaj adres: _________________ ]   ← autocomplete z bazy

Po wyborze "Jana Matejki 3A":
  - mapa centruje się na budynku
  - poligon podświetlony (fill zielony)  jeśli geom_type='polygon'
  - pinezka (marker)                     jeśli geom_type='point'
  - w bocznym panelu: ul. Jana Matejki 3A, kod 20-430
```

---

## Szacunek nakładu pracy (łącznie)

| Zadanie | Czas |
|---------|------|
| Skrypt importu way OSM → poligony z adresem | 3–4h |
| Spatial join węzłów OSM do poligonów | 4–5h |
| Obsługa "osieroconych" punktów (geom_type=point) | 1–2h |
| Migracja Alembic (nowe kolumny) | 0.5h |
| Autocomplete w panelu admina (frontend) | 3–4h |
| Wyświetlanie poligon/punkt na mapie (Leaflet) | 2h |
| **Łącznie** | **~15h** |

---

## Rekomendacja

**Wykonalne.** Najszybsza ścieżka:

1. Rozszerzyć obecny `import_buildings.py` o drugi pass z OSM PBF  
2. Węzły OSM bez poligonu → wstaw jako POINT  
3. Autocomplete w panelu z Leaflet highlight

Główne ryzyko: węzły OSM mogą leżeć lekko poza obrysem budynku (błąd digitalizacji). Rozwiązanie: bufor 5 m przy spatial join (`ST_DWithin` zamiast `ST_Contains`).

Pokrycie po pełnym imporcie: szacunkowo **~38 000–40 000 adresów** (połączenie PZGIK 28k + unikalne z OSM których nie ma w PZGIK).

> **Zrealizowane 2026-04-15** — patrz wpis `[0.3]` w `docs/lista_rzeczy_do_poprawek.md`. Rzeczywisty wynik: **41 725 adresów** (lepiej niż szacunek). Skrypt: `backend/scripts/import_osm_supplement.py`.

---

## Adresy widoczne na Geoportalu, ale bez obrysu + adresu w bazie

### Zjawisko

Przykład: **ul. Muzyczna 1, 20-612 Lublin** (Piekarnia Cukiernia Różana).
- Google Maps / Targeo: znajdują bezbłędnie.
- Geoportal (BDOT10k): pokazuje **poligon budynku**, ale bez przypisanego punktu adresowego.
- Nasza baza: **brak rekordu** `(Muzyczna, 1)`.

Podobne braki na ul. Muzycznej: `1, 2, 5, 6, 9, 12, 14, ...`. Mimo że poligony istnieją fizycznie w BDOT10k, trafiają do koszyka **9 918 obiektów bez adresu** (garaże, obiekty techniczne, komercyjne parterówki).

### Dlaczego tak się dzieje — trzy niezależne źródła, trzy luki

| Źródło | Co zawiera | Dla `Muzyczna 1` |
|---|---|---|
| **BDOT10k** (`budynki_surowe.geojson`) | poligony budynków + `id_budynku` + kondygnacje — **zero atrybutów adresowych** | ✅ poligon jest |
| **PRG/GUGiK** (`adresy_surowe.geojson`) | 28 938 punktów `(ulica, numer, kod)` — oficjalny rejestr adresów | ❌ brak punktu |
| **OSM PBF** (`addr:city=Lublin`) | 22 444 `way` + 12 721 `node` + tagi adresowe | ❌ brak tagu |

Ponieważ `import_buildings.py` dopina adres do poligonu wyłącznie przez **spatial join BDOT10k × PRG** (opcjonalnie z buforem 15 m), a `import_osm_supplement.py` dokłada wyłącznie adresy **obecne w OSM** — poligon BDOT10k, którego ani PRG, ani OSM nie opisują adresem, **nie ma jak** dostać `full_address`. Google/Targeo wyglądają lepiej, bo mają własne geokodery zbierane z POI biznesowych (licencyjnie i tak niedostępne).

### Opcje rozwiązania

| # | Rozwiązanie | Pokrycie | Koszt / ryzyko |
|---|---|---|---|
| **A** | **Zgłoszenie do OSM** — dodać `addr:housenumber` do way-a w OSM; po kolejnym imporcie PBF skrypt Scenariusza 4 sam to łapie. | 100 % dla zgłoszonych | Zewnętrzne, ręczne, per adres |
| **B** | **Reverse-geocode** centroidów „osieroconych" 9 918 poligonów BDOT10k przez Nominatim / Google Geocoding API. | Znacząca, ale niepełna | Limity API, licencja (Nominatim — OK do małej skali; Google — płatny), ryzyko błędnych wpisów wymaga weryfikacji |
| **C** | **Ręczny fallback w panelu admina** — UI „uzupełnij adres dla poligonu" (edycja przez dyspozytora, gdy zgłosi brak). Endpoint `PATCH /api/v1/buildings/{id}/address` + modal w React + Leaflet click → set address. | Rośnie z użyciem | 4–6 h implementacji, kontrolowana jakość |
| **D** | **Warstwa `prg_adresy_punktowe`** — pobrać nowszą migawkę PRG z GUGiK (czasem świeższa niż ta, którą mamy), przeprowadzić reimport. | Marginalna | Pobranie + reimport, bez gwarancji poprawy |
| **E** | **Akceptacja luki** — dla operacji MPWiK te obiekty (kwiaciarnie, piekarnie, obiekty komercyjne parterowe) i tak są nieistotne. Subskrybenci są powiadamiani po ulicy/promieniu awarii, nie po dokładnym numerze budynku komercyjnego bez mieszkańców. | 0 nowych adresów | Zero roboty; świadoma decyzja biznesowa |

### Rekomendacja

**Kombinacja C + E.** Dla bieżącej operacji MPWiK akceptujemy lukę (E) — powiadomienia trafiają do subskrybentów po dopasowaniu `street_id` + promieniu geometrii awarii, a obiekty komercyjne bez mieszkańców nie generują subskrypcji. Gdy pojawi się konkretne zgłoszenie dyspozytora („nie widzę Muzycznej 1 na mapie awarii"), zaimplementuj C — prosty endpoint PATCH + modal w panelu admina.

**Nie polecamy B** (masowy geokoder): licencja Google = koszt, Nominatim = limity + fair use, weryfikacja każdego wpisu = praca rzędu C, a jakość geokoderów dla Polski bywa niestabilna dla obiektów bez zgłoszenia do OSM. Gra nie warta świeczki dla ~9 918 obiektów, z których większość to garaże/transformatory/szopy bez mieszkańców.

### Podsumowanie liczbowe

- **51 643** budynków w bazie (po Scenariuszu 4).
- **41 725** ma pełny adres — **81 %** pokrycia.
- **9 918** (19 %) to poligony bez adresu; z tego szacunkowo <10 % to realne obiekty „biznesowe" pokroju Muzycznej 1, reszta to obiekty techniczne.
- Dla MPWiK pokrycie 81 % jest **operacyjnie wystarczające** — brakujące numery to nie gospodarstwa domowe.
