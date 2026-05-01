# Instrukcja — Lokalne Środowisko Deweloperskie

System powiadomień MPWiK Lublin. Przewodnik od `git clone` do działającej aplikacji.

---

## Wymagania wstępne

| Narzędzie | Minimalna wersja | Skąd pobrać |
|-----------|-----------------|-------------|
| **Docker Desktop** | 4.x | https://www.docker.com/products/docker-desktop |
| **Node.js** | 18.x LTS | https://nodejs.org |
| **Git** | dowolna | https://git-scm.com |

> Docker Desktop musi być **uruchomiony** (ikona wieloryba w zasobniku systemowym) zanim zaczniesz.

Wszystkie komendy wykonujesz w terminalu **w katalogu głównym projektu** (tam gdzie jest `docker-compose.yml`).

---

## Krok 1 — Sklonuj repozytorium

```bash
git clone <URL_REPOZYTORIUM> mpwik-lublin
cd mpwik-lublin
```

---

## Krok 2 — Przygotuj plik `.env`

**Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
```

**macOS / Linux:**
```bash
cp .env.example .env
```

Plik `.env` zawiera sensowne wartości domyślne dla dewelopmentu — **nie musisz niczego zmieniać** na start.

Kluczowe zmienne (do wglądu):

| Zmienna | Wartość domyślna | Opis |
|---------|-----------------|------|
| `POSTGRES_PASSWORD` | `devpassword` | Hasło lokalnej bazy |
| `SECRET_KEY` | `change-this-...` | Klucz JWT — zmień na losowy |
| `SMS_GATEWAY_TYPE` | `mock` | SMS trafia tylko do logów |
| `DEBUG` | `true` | Przeładowanie kodu bez restartu |
| `CORS_ORIGINS` | `http://localhost:5173` | Adres frontendu Vite |

---

## Krok 3 — Uruchom bazę i backend

```bash
docker compose up -d --build
```

Co się dzieje podczas pierwszego uruchomienia:
1. Docker pobiera obraz `postgis/postgis:16-3.4-alpine` (~100 MB)
2. Buduje obraz backendu (instaluje zależności Pythona ~2–3 min)
3. Uruchamia bazę danych — czeka na `healthy`
4. **`entrypoint.sh` automatycznie:** czeka na gotowość bazy (do 60 s), uruchamia `alembic upgrade head`, startuje uvicorn z `--reload`

Sprawdź status:

```bash
docker compose ps
```

Oczekiwany wynik:

```
NAME                     STATUS
mpwik-lublin-db          running (healthy)
mpwik-lublin-backend     running
```

Sprawdź logi startu — poczekaj na wszystkie trzy etapy entrypoint:

```bash
docker compose logs -f backend
```

```
==> [1/3] Waiting for PostgreSQL at db:5432...
  PostgreSQL ready after 1 attempt(s).
==> [2/3] Applying Alembic migrations (alembic upgrade head)...
==> [3/3] Starting application...
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete.
```

---

## Krok 4 — Zweryfikuj migracje bazy

> Pomiń ten krok tylko jeśli zaczynasz z zupełnie nową bazą (brak wcześniejszych wolumenów).

```bash
docker compose exec backend python -m alembic current
```

Wynik musi kończyć się `(head)`:

```
20260426b_expand_dept_cols (head)
```

Jeśli nie ma `(head)` — uruchom migracje ręcznie:

```bash
docker compose exec backend python -m alembic upgrade head
```

### Sprawdź kolumnę geom w tabeli buildings

```bash
docker compose exec db psql -U mpwik -d mpwik_lublin -c "\d buildings" | grep geom
```

Poprawny wynik:

```
 geom      | geometry(Geometry,4326) |
 geom_type | character varying(10)  |
```

Jeśli kolumna `geom` **nie istnieje** — zastosuj ręczną naprawę (zdarza się gdy masz stary wolumen `db_data`):

```bash
docker compose exec db psql -U mpwik -d mpwik_lublin -c "
  ALTER TABLE buildings ADD COLUMN IF NOT EXISTS geom geometry(Geometry, 4326);
  CREATE INDEX IF NOT EXISTS idx_buildings_geom_gist ON buildings USING GIST (geom);
  UPDATE buildings SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geojson_polygon::text), 4326)
    WHERE geom_type = 'polygon' AND geojson_polygon IS NOT NULL AND geom IS NULL;
  UPDATE buildings SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geojson_point::text), 4326)
    WHERE geom_type = 'point' AND geojson_point IS NOT NULL AND geom IS NULL;"
docker compose restart backend
```

---

## Krok 5 — Załaduj dane (pierwsze uruchomienie)

Baza jest pusta po starcie. Dane importuj w podanej kolejności — budynki referencjonują ulice (FK `street_id`).

```
[5.1] Zbuduj kontener skryptów GIS   (~5–10 min, tylko raz)
        ↓
[5.2] Importuj ulice                 → ~1 378 rekordów
        ↓
[5.3] Importuj budynki               → ~46 596 rekordów
        ↓
[5.4] Uzupełnij geom po imporcie     → wymagane przez mapę
        ↓
[5.5] Uzupełnij OSM (opcjonalnie)    → dokłada ~5 048 adresów
        ↓
[5.6] Utwórz konta testowe
```

### 5.1 Zbuduj kontener skryptów GIS

```bash
docker compose build scripts
```

Czas: ~5–10 minut (pobiera GDAL, rasterio, shapely). Wymagane tylko przy pierwszym uruchomieniu lub po zmianie `Dockerfile.scripts`/`requirements-scripts.txt`.

### 5.2 Importuj ulice

```bash
docker compose run --rm scripts python -m scripts.import_streets
```

Wczytuje `backend/data/streets_lublin__final.geojson` i zapisuje ~1 378 ulic.

Weryfikacja:

```bash
docker compose exec db psql -U mpwik -d mpwik_lublin -c "SELECT COUNT(*) FROM streets;"
# Oczekiwany wynik: 1378
```

### 5.3 Importuj budynki

Upewnij się, że pliki istnieją:

```bash
# Windows PowerShell
Test-Path backend\data\budynki_surowe.geojson
Test-Path backend\data\adresy_surowe.geojson
```

Jeśli nie ma plików — pobierz je od Kuby lub Rafała (nie są w repozytorium ze względu na rozmiar).

Uruchom import:

```bash
docker compose run --rm scripts python -m scripts.import_buildings \
  --budynki data/budynki_surowe.geojson \
  --adresy  data/adresy_surowe.geojson
```

Czas: 3–7 minut (spatial join ~51 000 budynków). Weryfikacja:

```bash
docker compose exec db psql -U mpwik -d mpwik_lublin -c "SELECT COUNT(*) FROM buildings;"
# Oczekiwany wynik: ~46596
```

### 5.4 Uzupełnij kolumnę geom (wymagane po imporcie budynków)

```bash
docker compose exec db psql -U mpwik -d mpwik_lublin -c "
  UPDATE buildings SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geojson_polygon::text), 4326)
    WHERE geom_type = 'polygon' AND geojson_polygon IS NOT NULL AND geom IS NULL;
  UPDATE buildings SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geojson_point::text), 4326)
    WHERE geom_type = 'point' AND geojson_point IS NOT NULL AND geom IS NULL;"
```

### 5.5 Uzupełnij adresami z OSM (opcjonalne)

Wymaga pliku `backend/data/lubelskie-*.osm.pbf`. Pomiń jeśli go nie masz.

```bash
docker compose run --rm scripts python -m scripts.import_osm_supplement
```

### 5.6 Utwórz konta testowe

```bash
docker compose run --rm scripts python -m scripts.setup_dev_users
```

| Login | Hasło | Rola |
|-------|-------|------|
| `admin` | `admin123` | Administrator |
| `dyspozytor1` | `lublin123` | Dyspozytor |
| `dyspozytor2` | `lublin123` | Dyspozytor |

---

## Krok 6 — Uruchom frontend

Frontend NIE jest uruchamiany przez `docker compose up` — działa lokalnie przez Vite.

```bash
cd frontend
npm install      # tylko przy pierwszym uruchomieniu lub po zmianie package.json
npm run dev
```

Frontend dostępny pod: **http://localhost:5173**

> Vite automatycznie proxy'uje żądania `/api/*` do `http://127.0.0.1:8000` (konfiguracja w `vite.config.ts`).

---

## Codzienne użytkowanie

```bash
# Uruchom bazę i backend (kontenery)
docker compose up -d

# Uruchom frontend (osobny terminal w katalogu frontend/)
npm run dev

# Zatrzymaj kontenery (dane zostają)
docker compose down

# Podgląd logów backendu na żywo
docker compose logs -f backend

# Przebuduj backend po zmianie requirements.txt lub Dockerfile
docker compose up -d --build backend
```

---

## Połączenie z bazą danych (DBeaver / pgAdmin)

Baza jest dostępna lokalnie pod:

| Parametr | Wartość |
|----------|---------|
| Host | `localhost` |
| Port | **`5433`** (przesunięty — lokalny PostgreSQL może być na 5432) |
| Baza danych | `mpwik_lublin` |
| Użytkownik | `mpwik` |
| Hasło | `devpassword` |

---

## Najczęstsze problemy

### Błąd 500 przy ładowaniu mapy — `column buildings.geom does not exist`

Przejdź do Kroku 4 i wykonaj ręczną naprawę kolumny `geom`.

### `Port 5433 jest zajęty`

Masz już lokalny PostgreSQL na tym porcie. Opcje:
- Zatrzymaj lokalny PostgreSQL
- Lub zmień mapowanie portu w `docker-compose.yml`: `"5434:5432"` i zaktualizuj DBeaver

### `Port 8000 jest zajęty`

```powershell
# Windows
netstat -ano | findstr :8000

# macOS/Linux
lsof -i :8000
```

### Backend nie startuje — błąd `SECRET_KEY not configured`

Brak pliku `.env`. Wróć do Kroku 2.

### Skrypt GIS kończy się błędem GDAL / `No module named 'gdal'`

Kontener skryptów nie jest zbudowany lub zbudował się z błędem:

```bash
docker compose build scripts --no-cache
```

### `argument --budynki: expected one argument`

Na niektórych terminalach wieloliniowa komenda z `\` rozkłada argumenty błędnie. Użyj wersji ze znakiem `=`:

```bash
docker compose run --rm scripts python -m scripts.import_buildings --budynki=data/budynki_surowe.geojson --adresy=data/adresy_surowe.geojson
```

### Migracje Alembic kończy się błędem `target database is not up to date`

Masz luki w historii migracji (np. dwa developerzy dodali gałęzie migracji). Sprawdź głowę:

```bash
docker compose exec backend python -m alembic heads
```

Jeśli jest więcej niż jedna głowa — scal je lub skasuj bazę (patrz: Instrukcja awaryjna).

---

## Instrukcja awaryjna — pełne czyszczenie środowiska

Używaj gdy masz konflikty migracji, uszkodzony schemat lub chcesz zacząć od zera.

> **Ostrzeżenie:** `-v` kasuje wolumen `db_data` z **wszystkimi danymi** — subskrybenci, zdarzenia, logi. Dane nie do odzyskania.

```bash
# 1. Zatrzymaj kontenery i usuń wolumen z bazą
docker compose down -v

# 2. Uruchom od nowa (entrypoint.sh odtworzy schemat przez alembic upgrade head)
docker compose up -d --build

# 3. Sprawdź logi — poczekaj na "Application startup complete"
docker compose logs -f backend

# 4. Zweryfikuj migracje
docker compose exec backend python -m alembic current
# Musi pokazać (head)

# 5. Ponów import danych (cały Krok 5)
docker compose build scripts
docker compose run --rm scripts python -m scripts.import_streets
docker compose run --rm scripts python -m scripts.import_buildings --budynki=data/budynki_surowe.geojson --adresy=data/adresy_surowe.geojson
docker compose exec db psql -U mpwik -d mpwik_lublin -c "UPDATE buildings SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geojson_polygon::text), 4326) WHERE geom_type = 'polygon' AND geojson_polygon IS NOT NULL AND geom IS NULL; UPDATE buildings SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geojson_point::text), 4326) WHERE geom_type = 'point' AND geojson_point IS NOT NULL AND geom IS NULL;"
docker compose run --rm scripts python -m scripts.setup_dev_users
```

---

## Szybki start — ściągawka (po pierwszej konfiguracji)

```bash
# Backend + baza
docker compose up -d

# Frontend (osobny terminal)
cd frontend && npm run dev

# Sprawdź backend
curl http://localhost:8000/api/v1/events

# Sprawdź logi
docker compose logs -f backend

# Zatrzymaj
docker compose down
```

---

## Struktura portów (dev)

| Usługa | Port na hoście | Port w kontenerze |
|--------|---------------|-------------------|
| Backend API | `8000` | `8000` |
| Baza PostgreSQL | `5433` | `5432` |
| Frontend Vite | `5173` | — (lokalny Node.js) |
