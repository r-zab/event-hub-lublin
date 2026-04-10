#!/usr/bin/env python3
"""
Import poligonów budynków z GeoJSON do PostgreSQL — Event Hub Lublin
=====================================================================

Uruchomienie (z katalogu backend/):
    python -m scripts.import_buildings
    python -m scripts.import_buildings --file ../lublin_budynki.geojson

Tworzy tabelę buildings z kolumnami:
  - geojson_polygon  — pełny obrys budynku (JSONB) do wyświetlenia na Leaflet
  - street_id        — powiązanie z tabelą streets (TERYT)
  - center_lat/lon   — środek budynku do popupów
"""

import argparse
import asyncio
import json
import logging
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import AsyncSessionLocal

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

DEFAULT_FILE = Path(__file__).parent.parent.parent / "lublin_budynki_final.geojson"
BATCH_SIZE = 200

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS buildings (
    id              SERIAL PRIMARY KEY,
    osm_id          BIGINT UNIQUE,
    osm_type        VARCHAR(10),
    street_id       INTEGER REFERENCES streets(id) ON DELETE SET NULL,
    street_name     VARCHAR(200) NOT NULL,
    house_number    VARCHAR(20)  NOT NULL,
    postcode        VARCHAR(20),
    city            VARCHAR(50)  DEFAULT 'Lublin',
    full_address    VARCHAR(300),
    building_type   VARCHAR(50),
    center_lat      DOUBLE PRECISION,
    center_lon      DOUBLE PRECISION,
    geojson_polygon JSONB,
    created_at      TIMESTAMP DEFAULT NOW()
)
"""

CREATE_INDEXES_SQL = [
    "CREATE INDEX IF NOT EXISTS idx_buildings_street_id    ON buildings(street_id)",
    "CREATE INDEX IF NOT EXISTS idx_buildings_street_name  ON buildings(street_name)",
    "CREATE INDEX IF NOT EXISTS idx_buildings_house_number ON buildings(house_number)",
]

PREFIX_RE = re.compile(
    r"^(ul\.|al\.|pl\.|aleja|ulica|plac|os\.|osiedle|rondo|skwer)\s+",
    re.IGNORECASE,
)


def normalize(raw: str) -> str:
    name = raw.strip()
    prev = None
    while name != prev:
        prev = name
        name = PREFIX_RE.sub("", name).strip()
    return name


async def build_street_lookup(session) -> dict:
    result = await session.execute(text("SELECT id, name, full_name FROM streets"))
    lookup = {}
    for sid, name, full_name in result.fetchall():
        lookup[name.lower()] = sid
        if full_name:
            lookup[full_name.lower()] = sid
    logger.info("Załadowano %d wpisów ze słownika streets (TERYT)", len(lookup))
    return lookup


def find_street_id(street_name: str, lookup: dict) -> int | None:
    raw = street_name.strip()
    for candidate in [raw.lower(), normalize(raw).lower()]:
        if candidate in lookup:
            return lookup[candidate]
    return None


async def import_buildings(geojson_path: Path) -> None:
    logger.info("Wczytywanie: %s", geojson_path)
    with open(geojson_path, encoding="utf-8") as f:
        geojson = json.load(f)

    features = geojson.get("features", [])
    logger.info("Załadowano %d budynków z pliku GeoJSON", len(features))

    async with AsyncSessionLocal() as db:
        await db.execute(text("DROP TABLE IF EXISTS buildings CASCADE"))
        await db.execute(text(CREATE_TABLE_SQL))
        for idx_sql in CREATE_INDEXES_SQL:
            await db.execute(text(idx_sql))
        await db.commit()
        logger.info("Tabela buildings gotowa")

        street_lookup = await build_street_lookup(db)

        total = 0
        no_match = 0

        for i in range(0, len(features), BATCH_SIZE):
            batch = features[i : i + BATCH_SIZE]
            rows = []

            for feature in batch:
                props = feature.get("properties", {})
                geom = feature.get("geometry", {})

                street_name = props.get("street", "")
                house_number = props.get("house_number", "")
                if not street_name or not house_number:
                    continue

                street_id = find_street_id(street_name, street_lookup)
                if street_id is None:
                    no_match += 1

                rows.append({
                    "osm_id":          props.get("osm_id"),
                    "osm_type":        props.get("osm_type", "way"),
                    "street_id":       street_id,
                    "street_name":     street_name,
                    "house_number":    house_number,
                    "postcode":        props.get("postcode", "")[:20],
                    "city":            props.get("city", "Lublin"),
                    "full_address":    props.get("full_address", ""),
                    "building_type":   props.get("building", ""),
                    "center_lat":      props.get("center_lat"),
                    "center_lon":      props.get("center_lon"),
                    "geojson_polygon": json.dumps(geom, ensure_ascii=False),
                })

            if not rows:
                continue

            upsert_sql = text("""
                INSERT INTO buildings (
                    osm_id, osm_type, street_id, street_name, house_number,
                    postcode, city, full_address, building_type,
                    center_lat, center_lon, geojson_polygon
                ) VALUES (
                    :osm_id, :osm_type, :street_id, :street_name, :house_number,
                    :postcode, :city, :full_address, :building_type,
                    :center_lat, :center_lon, :geojson_polygon
                )
                ON CONFLICT (osm_id) DO UPDATE SET
                    street_id       = EXCLUDED.street_id,
                    street_name     = EXCLUDED.street_name,
                    house_number    = EXCLUDED.house_number,
                    postcode        = EXCLUDED.postcode,
                    full_address    = EXCLUDED.full_address,
                    building_type   = EXCLUDED.building_type,
                    center_lat      = EXCLUDED.center_lat,
                    center_lon      = EXCLUDED.center_lon,
                    geojson_polygon = EXCLUDED.geojson_polygon
            """)

            await db.execute(upsert_sql, rows)
            total += len(rows)

            if (i // BATCH_SIZE + 1) % 20 == 0 or i + BATCH_SIZE >= len(features):
                logger.info("Postęp: %d / %d", min(i + BATCH_SIZE, len(features)), len(features))

        await db.commit()

    logger.info("=== Import zakończony ===")
    logger.info("Zaimportowano:              %d budynków", total)
    logger.info("Bez dopasowania do TERYT:   %d (street_id = NULL)", no_match)
    logger.info("")
    logger.info("Tabela buildings gotowa do użycia przez API.")


def _parse_args():
    parser = argparse.ArgumentParser(description="Import poligonów budynków do bazy")
    parser.add_argument("--file", type=Path, default=DEFAULT_FILE)
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    if not args.file.exists():
        logger.error("Plik nie istnieje: %s", args.file)
        logger.error("Najpierw uruchom: python pobierz_budynki_lublin.py")
        sys.exit(1)
    asyncio.run(import_buildings(args.file))
