# Ściągawka Operacyjna — Serwer Oracle Linux 9

Codzienna obsługa środowiska produkcyjnego.
Wszystkie komendy wykonuj z katalogu `/opt/mpwik`.

---

## Połączenie z serwerem

```bash
ssh kuba@192.168.1.15
cd /opt/mpwik
```

> **Przed pierwszym wdrożeniem:** upewnij się, że `.env` zawiera `VITE_TURNSTILE_SITE_KEY`.
> Bez tego klucza widget CAPTCHA nie wyrenderuje się i rejestracja będzie zablokowana.
> Sprawdź: `grep VITE_TURNSTILE .env` — musi zwrócić niepustą wartość.

---

## Stan aplikacji — szybka weryfikacja

```bash
# Status wszystkich kontenerów
docker compose -f docker-compose.prod.yml ps

# Czy frontend odpowiada? (test z serwera)
curl -I http://localhost

# Czy API odpowiada przez Nginx?
curl -s http://localhost/api/v1/events | head -c 80

# Liczba rekordów — szybki health check bazy
docker compose -f docker-compose.prod.yml exec mpwik-db \
  psql -U mpwik -d mpwik_lublin -c \
  "SELECT 'streets' AS t, COUNT(*) FROM streets
   UNION ALL SELECT 'buildings', COUNT(*) FROM buildings
   UNION ALL SELECT 'subscribers', COUNT(*) FROM subscribers;"
```

---

## Start / Stop / Restart

```bash
# Uruchom wszystko
docker compose -f docker-compose.prod.yml up -d

# Zatrzymaj (dane w wolumenie zostają nienaruszone)
docker compose -f docker-compose.prod.yml down

# Restart tylko backendu (np. po zmianie .env)
docker compose -f docker-compose.prod.yml restart mpwik-backend

# Restart frontendu (np. po zmianie nginx.conf)
docker compose -f docker-compose.prod.yml restart mpwik-frontend

# Restart całego stosu
docker compose -f docker-compose.prod.yml restart
```

---

## Aktualizacja do nowej wersji

```bash
cd /opt/mpwik
git pull

# Backend — entrypoint.sh automatycznie uruchomi alembic upgrade head przy starcie
docker compose -f docker-compose.prod.yml up -d --build mpwik-backend

# Frontend — przebuduj po zmianach w frontend/
# VITE_TURNSTILE_SITE_KEY jest odczytywany z .env podczas budowania (build arg)
docker compose -f docker-compose.prod.yml up -d --build mpwik-frontend

# Oba naraz (gdy zmiany w obu)
docker compose -f docker-compose.prod.yml up -d --build mpwik-backend mpwik-frontend

# Obserwuj logi backendu po aktualizacji — poczekaj na "Application startup complete"
docker compose -f docker-compose.prod.yml logs -f mpwik-backend
```

> **Migracje bazy:** `entrypoint.sh` uruchamia `alembic upgrade head` automatycznie przy każdym starcie backendu. Nie musisz ich wywoływać ręcznie.

Jeśli chcesz sprawdzić aktualną wersję schematu bazy:

```bash
docker compose -f docker-compose.prod.yml exec mpwik-backend python -m alembic current
# Wynik musi kończyć się słowem (head)
```

---

## Podgląd logów

```bash
# Backend — na żywo (Ctrl+C aby wyjść)
docker compose -f docker-compose.prod.yml logs -f mpwik-backend

# Frontend / Nginx — na żywo
docker compose -f docker-compose.prod.yml logs -f mpwik-frontend

# Ostatnie 100 linii backendu (bez śledzenia)
docker compose -f docker-compose.prod.yml logs --tail=100 mpwik-backend

# Baza danych
docker compose -f docker-compose.prod.yml logs --tail=50 mpwik-db

# Wszystkie kontenery naraz (może być chaotyczne)
docker compose -f docker-compose.prod.yml logs -f
```

---

## Dostęp do bazy danych — tunel SSH (DBeaver / pgAdmin)

Port `5432` bazy **nie jest** wystawiony na zewnątrz serwera (celowe — brak wpisu `ports:` w `docker-compose.prod.yml`).

Aby połączyć DBeaver lub pgAdmin z komputera lokalnego, zestawiamy tunel SSH:

```bash
# Na lokalnym komputerze Windows (PowerShell) — zostaw ten terminal otwarty
ssh -L 5433:localhost:5432 kuba@192.168.1.15
```

Co robi ta komenda: przekierowuje lokalny port `5433` przez szyfrowany tunel SSH na port `5432` wewnątrz serwera (gdzie słucha PostgreSQL wewnątrz sieci Docker).

Po zestawieniu tunelu — w DBeaver/pgAdmin:

| Parametr | Wartość |
|----------|---------|
| Host | `127.0.0.1` |
| Port | `5433` |
| Baza danych | `mpwik_lublin` |
| Użytkownik | `mpwik` |
| Hasło | wartość `POSTGRES_PASSWORD` z `/opt/mpwik/.env` |

> Tunel SSH zamyka się gdy zamkniesz terminal. Każda sesja pracy z bazą wymaga ponownego uruchomienia tunelu.

---

## Import danych (tylko przy pierwszym uruchomieniu lub pełnym resecie)

### Kolejność importu — nie zamieniaj kroków

```
[1] Ulice    → [2] Budynki    → [3] OSM (opcjonalnie)    → [4] geom    → [5] Konta
```

### Zbuduj obraz skryptów (raz, lub po zmianie Dockerfile.scripts)

```bash
docker build -f backend/Dockerfile.scripts -t mpwik-scripts ./backend
```

### 1. Importuj ulice

```bash
docker run --rm --network mpwik-lublin_default -e DATABASE_URL="postgresql+asyncpg://mpwik:${POSTGRES_PASSWORD}@mpwik-db:5432/mpwik_lublin" mpwik-scripts python -m scripts.import_streets
```

### 2. Importuj budynki

```bash
docker run --rm --network mpwik-lublin_default -e DATABASE_URL="postgresql+asyncpg://mpwik:${POSTGRES_PASSWORD}@mpwik-db:5432/mpwik_lublin" mpwik-scripts python -m scripts.import_buildings --budynki=data/budynki_surowe.geojson --adresy=data/adresy_surowe.geojson
```

### 3. Uzupełnij OSM (opcjonalnie)

```bash
docker run --rm --network mpwik-lublin_default -e DATABASE_URL="postgresql+asyncpg://mpwik:${POSTGRES_PASSWORD}@mpwik-db:5432/mpwik_lublin" mpwik-scripts python -m scripts.import_osm_supplement
```

### 4. Uzupełnij kolumnę geom (wymagane po imporcie budynków)

```bash
docker compose -f docker-compose.prod.yml exec -T mpwik-db psql -U mpwik -d mpwik_lublin -c "
  UPDATE buildings SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geojson_polygon::text), 4326)
    WHERE geom_type = 'polygon' AND geojson_polygon IS NOT NULL AND geom IS NULL;
  UPDATE buildings SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geojson_point::text), 4326)
    WHERE geom_type = 'point' AND geojson_point IS NOT NULL AND geom IS NULL;"
```

### 5. Utwórz konta użytkowników

```bash
docker run --rm --network mpwik-lublin_default -e DATABASE_URL="postgresql+asyncpg://mpwik:${POSTGRES_PASSWORD}@mpwik-db:5432/mpwik_lublin" mpwik-scripts python -m scripts.setup_dev_users
```

---

## Zarządzanie dyskiem

```bash
# Wolne miejsce ogólnie
df -h /

# Ile zajmują kontenery, obrazy, wolumeny Docker
docker system df

# Wyczyść nieużywane obrazy i warstwy builda (bezpieczne — nie dotyka wolumenów z danymi)
docker system prune -f

# Wyczyść nieużywane obrazy łącznie z dangling (ostrożnie)
docker image prune -a -f
```

---

## Zarządzanie firewallem

```bash
# Sprawdź aktualnie otwarte porty
sudo firewall-cmd --list-ports

# Otwórz port (permanentnie)
sudo firewall-cmd --zone=public --add-port=80/tcp --permanent
sudo firewall-cmd --reload

# Zamknij port
sudo firewall-cmd --zone=public --remove-port=8000/tcp --permanent
sudo firewall-cmd --reload
```

---

## Reset awaryjny — pełne czyszczenie (NISZCZY DANE BAZY)

> **UWAGA:** Ta procedura usuwa wszystkie dane — subskrybentów, zdarzenia, logi. Używaj tylko gdy jest to absolutnie konieczne.

```bash
# 1. Zatrzymaj kontenery i usuń wolumen z danymi bazy
docker compose -f docker-compose.prod.yml down -v

# 2. Uruchom ponownie (entrypoint.sh odtworzy schemat przez alembic)
docker compose -f docker-compose.prod.yml up -d

# 3. Poczekaj na "Application startup complete" w logach
docker compose -f docker-compose.prod.yml logs -f mpwik-backend

# 4. Ponów import danych (sekcja "Import danych" powyżej)
```

---

## Szybka ściągawka

```bash
ssh kuba@192.168.1.15 && cd /opt/mpwik

docker compose -f docker-compose.prod.yml ps                        # status
docker compose -f docker-compose.prod.yml up -d                     # start wszystkiego
docker compose -f docker-compose.prod.yml down                      # stop (dane zostają)
docker compose -f docker-compose.prod.yml restart mpwik-backend     # restart backendu
docker compose -f docker-compose.prod.yml logs -f mpwik-backend     # logi backend
docker compose -f docker-compose.prod.yml logs -f mpwik-frontend    # logi Nginx

# Aktualizacja
git pull && docker compose -f docker-compose.prod.yml up -d --build mpwik-backend mpwik-frontend

# Test działania
curl -I http://localhost                     # frontend
curl http://localhost/api/v1/events          # API przez Nginx

# Tunel SSH do bazy (na lokalnym komputerze)
ssh -L 5433:localhost:5432 kuba@192.168.1.15
# DBeaver: localhost:5433 / mpwik / <POSTGRES_PASSWORD z .env>
```
