# Deployment — Oracle Linux 9 (Docker)

Docelowa platforma: Oracle Linux 9.x, Docker CE, za WAF-em Fortinet.
Wszystkie komendy wykonuj jako użytkownik `kuba` (nie root), chyba że zaznaczono `sudo`.

---

## 1. Wymagania serwera

| Parametr | Minimum |
|----------|---------|
| OS | Oracle Linux 9.x |
| CPU | 2 vCPU |
| RAM | 4 GB |
| Dysk | 40 GB (z czego ~20 GB dla danych PostGIS) |
| Sieć | Port **80** dostępny z sieci lokalnej (frontend Nginx) |

Port `8000` backendu i `5432` bazy danych **nie są** wystawiane na zewnątrz — działają wyłącznie wewnątrz sieci Docker.

---

## 2. Instalacja Docker CE

Oracle Linux 9 nie ma Docker CE w domyślnych repozytoriach. Dodaj oficjalne repozytorium Dockera:

```bash
sudo dnf install -y dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
```

Zweryfikuj instalację:

```bash
docker --version
docker compose version
```

Oczekiwany wynik: `Docker version 26.x.x` oraz `Docker Compose version v2.x.x`.

---

## 3. SELinux — konfiguracja dla bind-mountów

Oracle Linux 9 uruchamia SELinux w trybie `Enforcing` domyślnie. Wolumen danych bazy (`mpwik_db_data`) jest zarządzanym wolumenem Docker — nie wymaga żadnych etykiet.

Jeśli dodajesz bind-mount katalogu (np. `backend/data/` dla skryptów GIS), użyj sufiksu `:z`:

```yaml
volumes:
  - ./backend/data:/code/data:z
```

- `:z` — kontekst `container_file_t`, współdzielony między kontenerami
- `:Z` (duże) — kontekst wyłączny tylko dla tego kontenera

---

## 4. Firewalld — otwieranie portów

Sprawdź stan firewalla i otwórz tylko port 80 (Nginx/frontend):

```bash
sudo systemctl is-active firewalld

# Otwórz port 80 (frontend przez Nginx)
sudo firewall-cmd --zone=public --add-port=80/tcp --permanent
sudo firewall-cmd --reload

# Zweryfikuj
sudo firewall-cmd --list-ports
```

> **Nie otwieraj** portów `8000` (backend) ani `5432`/`5433` (baza). Są dostępne wyłącznie wewnątrz sieci Docker lub przez tunel SSH.

---

## 5. Przesłanie kodu na serwer

### Opcja A — git clone (zalecana)

```bash
sudo mkdir -p /opt/mpwik && sudo chown $USER:$USER /opt/mpwik
cd /opt/mpwik
git clone <URL_REPOZYTORIUM> .
```

### Opcja B — rsync / scp (gdy brak dostępu do git)

Z lokalnego komputera (Windows PowerShell):

```powershell
# Prześlij cały projekt
scp -r C:\MPWIK\mpwik-lublin\* kuba@192.168.1.15:/opt/mpwik/
```

### Pliki danych GIS (wymagane do seeda bazy)

Pliki nie są w repozytorium — prześlij je oddzielnie:

```powershell
# Z Windows PowerShell:
scp C:\MPWIK\mpwik-lublin\backend\data\budynki_surowe.geojson    kuba@192.168.1.15:/opt/mpwik/backend/data/
scp C:\MPWIK\mpwik-lublin\backend\data\adresy_surowe.geojson     kuba@192.168.1.15:/opt/mpwik/backend/data/
scp C:\MPWIK\mpwik-lublin\backend\data\streets_lublin__final.geojson kuba@192.168.1.15:/opt/mpwik/backend/data/
```

Sprawdź na serwerze:

```bash
ls -lh /opt/mpwik/backend/data/
```

---

## 6. Konfiguracja środowiska produkcyjnego (.env)

```bash
cd /opt/mpwik
cp .env.example .env
nano .env
```

### Wymagane zmiany względem `.env.example`

```bash
# === Baza danych ===
POSTGRES_PASSWORD=<SILNE_HASLO_MIN_20_ZNAKOW>

# === Bezpieczeństwo JWT ===
# Wygeneruj losowy klucz (uruchom poniżej i wklej wynik):
SECRET_KEY=<WYNIK_OPENSSL_PONIZEJ>

# === Tryb aplikacji ===
DEBUG=false

# === CORS — adres serwera (IP lub domena) ===
CORS_ORIGINS=http://192.168.1.15

# === Bramka SMS (produkcja) ===
SMS_GATEWAY_TYPE=smseagle
SMS_GATEWAY_URL=http://<IP_SMSEAGLE>
SMS_GATEWAY_API_KEY=<KLUCZ_API_SMSEAGLE>

# === WAF Fortinet — zaufany proxy ===
TRUSTED_PROXIES=<IP_WAF_FORTINET>
```

### Generowanie klucza JWT

```bash
openssl rand -hex 32
```

Skopiuj wynik i wklej jako wartość `SECRET_KEY` w `.env`.

### Przykładowy kompletny blok Security w .env

```bash
SECRET_KEY=a3f8c2d1e9b4f7a0c6e2d8f1b5a9c3e7d2f0b4a8c1e5d9f3b7a0c4e8d2f6b0
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
```

> **Nigdy** nie commituj pliku `.env` do repozytorium.

---

## 7. Weryfikacja Dockerfile przed buildem

### Problem: `python:3.12-slim` → niestabilne pakiety Debian Trixie

Obraz `python:3.12-slim` może wskazywać na Debian Trixie (testing) z niestabilnymi sygnaturami GPG. Upewnij się, że oba Dockerfile używają `bookworm`:

```bash
grep "FROM python" backend/Dockerfile backend/Dockerfile.scripts
```

Oba wiersze muszą zawierać `python:3.12-slim-bookworm`. Jeśli nie — napraw:

```bash
sed -i 's/FROM python:3.12-slim$/FROM python:3.12-slim-bookworm/g' backend/Dockerfile backend/Dockerfile.scripts
```

### Problem: `frontend/.dockerignore` — brakuje `node_modules`

Bez tego pliku `COPY . .` kopiuje `node_modules/` z Windowsa do kontenera i nadpisuje poprawnie zainstalowane pakiety Linuksowe (`vite: Permission denied`).

```bash
cat frontend/.dockerignore
```

Musi zawierać `node_modules`. Jeśli pliku nie ma — utwórz:

```bash
printf 'node_modules\ndist\n.env*\n' > frontend/.dockerignore
```

---

## 8. Uruchomienie stosu produkcyjnego

```bash
cd /opt/mpwik
docker compose -f docker-compose.prod.yml up -d --build
```

Pierwsze budowanie trwa 5–15 minut (pobieranie warstw Docker, kompilacja Pythona).

Sprawdź status kontenerów:

```bash
docker compose -f docker-compose.prod.yml ps
```

Oczekiwany wynik — trzy kontenery `running`/`healthy`:

```
NAME                      STATUS
mpwik-lublin-db           running (healthy)
mpwik-lublin-backend      running
mpwik-lublin-frontend     running
```

Sprawdź logi backendu — entrypoint.sh automatycznie czeka na bazę i uruchamia migracje:

```bash
docker compose -f docker-compose.prod.yml logs -f mpwik-backend
```

Szukaj sekwencji w logach:

```
==> [1/3] Waiting for PostgreSQL at mpwik-db:5432...
  PostgreSQL ready after N attempt(s).
==> [2/3] Applying Alembic migrations (alembic upgrade head)...
==> [3/3] Starting application...
INFO:     Application startup complete.
```

Test end-to-end:

```bash
curl -I http://localhost          # → HTTP/1.1 200 OK (frontend)
curl -s http://localhost/api/v1/events | head -c 100  # → JSON (API przez Nginx)
```

---

## 9. Zasilenie bazy danych (pierwsze uruchomienie)

> **Kolejność ma znaczenie.** Budynki referencjonują ulice (FK `street_id`) — nie zamieniaj kroków.

```
[9.1] Zbuduj obraz skryptów GIS   (~5–10 min, tylko raz)
        ↓
[9.2] Importuj ulice              → ~1 378 rekordów w tabeli streets
        ↓
[9.3] Importuj budynki            → ~46 596 budynków
        ↓
[9.4] Uzupełnij z OSM             → ~51 644 łącznie (opcjonalnie)
        ↓
[9.5] Uzupełnij kolumnę geom      → geometria dla mapy w panelu dyspozytora
        ↓
[9.6] Utwórz konta użytkowników
```

### 9.1 Zbuduj obraz skryptów GIS

```bash
cd /opt/mpwik
docker build -f backend/Dockerfile.scripts -t mpwik-scripts ./backend
```

Czas: ~5–10 minut (pobiera GDAL, rasterio, shapely).

### 9.2 Importuj ulice

```bash
docker run --rm \
  --network mpwik-lublin_default \
  -e DATABASE_URL="postgresql+asyncpg://mpwik:${POSTGRES_PASSWORD}@mpwik-db:5432/mpwik_lublin" \
  mpwik-scripts python -m scripts.import_streets
```

> **Uwaga SSH:** wieloliniowe komendy z `\` na SSH mogą się nie powieść. W razie problemów użyj wersji jednoliniowej:
> ```bash
> docker run --rm --network mpwik-lublin_default -e DATABASE_URL="postgresql+asyncpg://mpwik:${POSTGRES_PASSWORD}@mpwik-db:5432/mpwik_lublin" mpwik-scripts python -m scripts.import_streets
> ```

Weryfikacja:

```bash
docker compose -f docker-compose.prod.yml exec mpwik-db psql -U mpwik -d mpwik_lublin -c "SELECT COUNT(*) FROM streets;"
```

Oczekiwany wynik: `1378`.

### 9.3 Importuj budynki

Sprawdź czy pliki danych istnieją:

```bash
ls -lh /opt/mpwik/backend/data/budynki_surowe.geojson /opt/mpwik/backend/data/adresy_surowe.geojson
```

Jeśli nie ma — wróć do kroku 5 (przesłanie plików).

Uruchom import (użyj `=` zamiast spacji dla argumentów — bezpieczne na SSH):

```bash
docker run --rm --network mpwik-lublin_default -e DATABASE_URL="postgresql+asyncpg://mpwik:${POSTGRES_PASSWORD}@mpwik-db:5432/mpwik_lublin" mpwik-scripts python -m scripts.import_buildings --budynki=data/budynki_surowe.geojson --adresy=data/adresy_surowe.geojson
```

Czas: 3–7 minut. Weryfikacja:

```bash
docker compose -f docker-compose.prod.yml exec mpwik-db psql -U mpwik -d mpwik_lublin -c "SELECT COUNT(*) FROM buildings;"
```

Oczekiwany wynik: `~46596`.

### 9.4 Uzupełnij adresami z OpenStreetMap (opcjonalne)

Wymaga pliku `lubelskie-*.osm.pbf` w `backend/data/`. Prześlij jeśli brakuje (plik ~50 MB):

```powershell
scp C:\MPWIK\mpwik-lublin\backend\data\lubelskie-260413.osm.pbf kuba@192.168.1.15:/opt/mpwik/backend/data/
```

Przebuduj obraz (żeby plik był dostępny wewnątrz kontenera) i uruchom:

```bash
docker build -f backend/Dockerfile.scripts -t mpwik-scripts ./backend
docker run --rm --network mpwik-lublin_default -e DATABASE_URL="postgresql+asyncpg://mpwik:${POSTGRES_PASSWORD}@mpwik-db:5432/mpwik_lublin" mpwik-scripts python -m scripts.import_osm_supplement
```

Oczekiwany wynik: `~51 644 budynki łącznie`. Komunikat `ROLLBACK` na końcu jest normalny.

### 9.5 Uzupełnij kolumnę geom

Kolumna `geom` jest dodawana przez migrację Alembic (uruchamianą automatycznie przez `entrypoint.sh`). Sprawdź czy migracja zadziałała:

```bash
docker compose -f docker-compose.prod.yml exec mpwik-db psql -U mpwik -d mpwik_lublin -c "\d buildings" | grep geom
```

Poprawny wynik:

```
 geom      | geometry(Geometry,4326) |
 geom_type | character varying(10)  |
```

Jeśli kolumna `geom` NIE istnieje — zastosuj ręcznie przez plik SQL (bezpieczna metoda na SSH):

```bash
cat > /tmp/fix_geom.sql << 'EOF'
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS geom geometry(Geometry, 4326);
CREATE INDEX IF NOT EXISTS idx_buildings_geom_gist ON buildings USING GIST (geom);
UPDATE buildings SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geojson_polygon::text), 4326)
  WHERE geom_type = 'polygon' AND geojson_polygon IS NOT NULL AND geom IS NULL;
UPDATE buildings SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geojson_point::text), 4326)
  WHERE geom_type = 'point' AND geojson_point IS NOT NULL AND geom IS NULL;
EOF
docker compose -f docker-compose.prod.yml exec -T mpwik-db psql -U mpwik -d mpwik_lublin < /tmp/fix_geom.sql
```

Oczekiwany wynik: `UPDATE 48970` + `UPDATE 2674`.

### 9.6 Utwórz konta użytkowników

```bash
docker run --rm --network mpwik-lublin_default -e DATABASE_URL="postgresql+asyncpg://mpwik:${POSTGRES_PASSWORD}@mpwik-db:5432/mpwik_lublin" mpwik-scripts python -m scripts.setup_dev_users
```

Tworzone konta:

| Login | Hasło | Rola |
|-------|-------|------|
| `admin` | `admin123` | Administrator |
| `dyspozytor1` | `lublin123` | Dyspozytor |
| `dyspozytor2` | `lublin123` | Dyspozytor |

> Zmień hasła po pierwszym logowaniu.

---

## 10. Weryfikacja końcowa

```bash
# Frontend odpowiada?
curl -I http://localhost
# → HTTP/1.1 200 OK

# API przez Nginx odpowiada?
curl -s http://localhost/api/v1/events | head -c 100
# → {"items":[...] lub {"items":[]}

# Liczba rekordów w bazie
docker compose -f docker-compose.prod.yml exec mpwik-db psql -U mpwik -d mpwik_lublin -c "
  SELECT 'streets'          AS tabela, COUNT(*) FROM streets
  UNION ALL
  SELECT 'buildings'        AS tabela, COUNT(*) FROM buildings
  UNION ALL
  SELECT 'buildings_z_geom' AS tabela, COUNT(*) FROM buildings WHERE geom IS NOT NULL
  UNION ALL
  SELECT 'users'            AS tabela, COUNT(*) FROM users;"
```

Oczekiwane wartości: streets `1378`, buildings `≥46596`, buildings_z_geom = buildings, users `3`.

---

## 11. Autostart po restarcie serwera

Docker CE startuje automatycznie przez `systemd` (`systemctl enable docker` — już wykonane w kroku 2). Kontenery z `restart: unless-stopped` startują razem z daemonem.

Zweryfikuj po restarcie:

```bash
sudo reboot
# Po ponownym połączeniu SSH:
docker compose -f /opt/mpwik/docker-compose.prod.yml ps
```

---

## 12. Logi i monitoring

```bash
# Backend (na żywo)
docker compose -f docker-compose.prod.yml logs -f mpwik-backend

# Frontend / Nginx
docker compose -f docker-compose.prod.yml logs -f mpwik-frontend

# Ostatnie 100 linii bazy
docker compose -f docker-compose.prod.yml logs --tail=100 mpwik-db

# Zajęte miejsce
docker system df
df -h /
```

---

## 13. Aktualizacja aplikacji

```bash
cd /opt/mpwik
git pull

# Przebuduj i uruchom backend (migracje Alembic uruchamiają się automatycznie przy starcie)
docker compose -f docker-compose.prod.yml up -d --build mpwik-backend

# Przebuduj i uruchom frontend (po zmianach w frontend/)
docker compose -f docker-compose.prod.yml up -d --build mpwik-frontend

# Sprawdź logi po aktualizacji
docker compose -f docker-compose.prod.yml logs -f mpwik-backend
```

---

## 14. Dostęp do bazy danych z komputera lokalnego (DBeaver / pgAdmin)

Baza danych nie ma otwartego portu na zewnątrz (celowo). Użyj tunelu SSH:

```bash
# Na lokalnym komputerze — zostaw ten terminal otwarty przez całą sesję pracy
ssh -L 5433:localhost:5432 kuba@192.168.1.15
```

Po zestawieniu tunelu połącz DBeaver/pgAdmin:

| Parametr | Wartość |
|----------|---------|
| Host | `localhost` |
| Port | `5433` |
| Baza | `mpwik_lublin` |
| Użytkownik | `mpwik` |
| Hasło | wartość z `.env` → `POSTGRES_PASSWORD` |

---

## 15. Najczęstsze problemy

### `E: Unable to correct problems, you have held broken packages`

Obraz `python:3.12-slim` wskazuje na Debian Trixie. Zmień na `python:3.12-slim-bookworm` w obu Dockerfile (patrz krok 7).

### `sh: vite: Permission denied` przy budowaniu frontendu

Brakuje `frontend/.dockerignore` z wpisem `node_modules` (patrz krok 7).

### `column "geom" does not exist`

Migracja nie wykonała się lub baza pochodzi ze starego wolumenu. Wykonaj ręczny SQL z kroku 9.5.

### `argument --budynki: expected one argument`

SSH rozdziela argumenty przy wieloliniowych komendach z `\`. Używaj `--budynki=ścieżka` (ze znakiem równości, bez spacji).

### `no such network: mpwik-lublin_default`

Stos nie jest uruchomiony lub uruchomiono go inaczej. Sprawdź: `docker network ls | grep mpwik`. Uruchom stos (krok 8), następnie ponów.

### Backend nie startuje — błąd `SECRET_KEY`

Plik `.env` nie istnieje lub `SECRET_KEY` jest pusty/domyślny. Wygeneruj klucz (`openssl rand -hex 32`) i ustaw w `.env`.

### `Connection refused` na porcie 80 z innego komputera

Sprawdź firewalld (`sudo firewall-cmd --list-ports`) — port 80 musi być otwarty. Sprawdź czy kontener `mpwik-frontend` jest `running`.
