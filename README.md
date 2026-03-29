# Event Hub Lublin

System powiadamiania mieszkancow o awariach sieci wodociagowej MPWiK Lublin.

## Quick Start

```bash
# 1. Skopiuj zmienne srodowiskowe
cp .env.example .env

# 2. Uruchom baze danych
docker compose up db -d

# 3. Uruchom backend
docker compose up backend

# 4. Sprawdz
# http://localhost:8000/health
# http://localhost:8000/docs (Swagger UI)
```

## Stack
- **Backend:** Python 3.12 + FastAPI
- **Database:** PostgreSQL 16
- **Frontend:** React + TypeScript + Leaflet
- **Infra:** Docker + Nginx

## Zespol
- Rafal Zaborek
- Jakub Zatorski
- Mateusz Duda

Politechnika Lubelska - Sztuczna Inteligencja w Biznesie
