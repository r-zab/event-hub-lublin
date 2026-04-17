#!/usr/bin/env python3
"""
Scenariusz 4 — Uzupełnienie braków PZGIK węzłami OSM
=====================================================

Po `import_buildings.py` (spatial join BDOT10k + PZGIK) w bazie jest ~36 678
adresów. OSM PBF dla województwa lubelskiego zawiera dodatkowe adresy (nowe
budynki, literowe klatki), których PZGIK nie eksportuje. Ten skrypt DOKŁADA
brakujące adresy — nie kasuje istniejących rekordów.

Algorytm:
  1. Załaduj z bazy set istniejących adresów {(street_norm, number_norm)}.
  2. Załaduj słownik TERYT+nazwa → street_id z tabeli `streets`.
  3. Strumień PBF (osmium.FileProcessor):
       - node z addr:city=Lublin + addr:housenumber + addr:street
       - way  z addr:city=Lublin + addr:housenumber + addr:street
     (relation pomijamy — w Lublinie ~72 obiekty, marginalne).
  4. Deduplikacja w pamięci: (street_norm, number_norm) → pierwszy trafiony
     obiekt, way ma pierwszeństwo nad node (polygon lepszy niż punkt).
  5. Z tego zbioru odrzuć adresy już obecne w bazie.
  6. Wstaw partiami (INSERT, bez ON CONFLICT po fid — fid=NULL dla OSM):
       - way   → geom_type='polygon', geojson_polygon, osm_way_id
       - node  → geom_type='point',   geojson_point,   osm_node_id

Uruchomienie (z katalogu backend/):
    python -m scripts.import_osm_supplement \
        --pbf /c/Users/rafal/Downloads/lubelskie-260413.osm.pbf

Wymagania:
    - Zainstalowany pakiet `osmium` (pyosmium ≥ 4.x).
    - Tabela `buildings` z kolumnami OSM (po migracji 20260415_osm_cols
      albo po świeżym `import_buildings.py`).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import osmium
from osmium.geom import GeoJSONFactory
from shapely.geometry import shape

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text

from app.database import AsyncSessionLocal

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Konfiguracja
# --------------------------------------------------------------------------- #

DEFAULT_PBF = Path(r"C:\Users\jakub\OneDrive\Pulpit\lubelskie-260413.osm.pbf")
BATCH_SIZE = 500
TARGET_CITY = "lublin"  # case-insensitive match na addr:city

_PREFIX_RE = re.compile(
    r"^(ul\.|ulica|al\.|aleja|aleje|pl\.|plac|os\.|osiedle|rondo|skwer|bulwar)\s+",
    re.IGNORECASE,
)


def _norm_street(raw: str | None) -> str:
    """'ul. Jana Matejki' → 'jana matejki' (wielokrotnie obetnij prefiksy)."""
    if not raw:
        return ""
    name = raw.strip()
    prev: str | None = None
    while name != prev:
        prev = name
        name = _PREFIX_RE.sub("", name).strip()
    return name.casefold()


def _norm_number(raw: str | None) -> str:
    """'3A', ' 3a ', '3 A' → '3a'."""
    if not raw:
        return ""
    return re.sub(r"\s+", "", raw.strip()).casefold()


# --------------------------------------------------------------------------- #
# Struktury w pamięci
# --------------------------------------------------------------------------- #


@dataclass
class OsmAddress:
    """Pojedynczy adres wyciągnięty z OSM PBF."""

    source: str  # 'way' | 'node'
    osm_id: int
    street: str
    house_number: str
    geojson: dict  # GeoJSON geometry (Polygon | Point)
    postal_code: str | None = None


@dataclass
class OsmAddressBucket:
    """Kubełek deduplikacyjny: (street_norm, number_norm) → najlepszy kandydat."""

    by_key: dict[tuple[str, str], OsmAddress] = field(default_factory=dict)

    def offer(self, candidate: OsmAddress) -> None:
        key = (_norm_street(candidate.street), _norm_number(candidate.house_number))
        if not key[0] or not key[1]:
            return
        existing = self.by_key.get(key)
        if existing is None:
            self.by_key[key] = candidate
            return
        # Way (polygon) ma pierwszeństwo nad node (point)
        if existing.source == "node" and candidate.source == "way":
            self.by_key[key] = candidate


# --------------------------------------------------------------------------- #
# Parser PBF
# --------------------------------------------------------------------------- #


def parse_pbf(pbf_path: Path) -> OsmAddressBucket:
    """
    Strumieniowo czyta PBF i zwraca wszystkie adresy z addr:city ≈ Lublin.

    Buduje geometrię na miejscu przez osmium.geom.GeoJSONFactory:
      - node  → Point
      - way   → LineString (ale dla budynków zamknięty — konwertujemy na Polygon
                przez shapely).
    """
    logger.info("Parsowanie PBF: %s", pbf_path)
    factory = GeoJSONFactory()
    bucket = OsmAddressBucket()

    nodes_seen = 0
    ways_seen = 0

    fp = (
        osmium.FileProcessor(str(pbf_path))
        .with_locations(storage="flex_mem")
    )

    for obj in fp:
        tags = obj.tags
        if "addr:housenumber" not in tags or "addr:street" not in tags:
            continue
        city = tags.get("addr:city", "")
        if city.strip().casefold() != TARGET_CITY:
            continue

        housenumber = tags["addr:housenumber"]
        street = tags["addr:street"]
        postal_code = tags.get("addr:postcode")

        if obj.is_node():
            nodes_seen += 1
            try:
                geojson_str = factory.create_point(obj)
            except Exception:  # noqa: BLE001
                continue
            geom = json.loads(geojson_str)
            bucket.offer(OsmAddress(
                source="node",
                osm_id=obj.id,
                street=street,
                house_number=housenumber,
                geojson=geom,
                postal_code=postal_code,
            ))
        elif obj.is_way():
            ways_seen += 1
            # Tylko zamknięte ways (budynki) — potrzebujemy poligonu
            try:
                geojson_str = factory.create_linestring(obj)
            except Exception:  # noqa: BLE001
                continue
            line = json.loads(geojson_str)
            coords = line.get("coordinates") or []
            if len(coords) < 4 or coords[0] != coords[-1]:
                # niezamknięty way (droga?) — pomiń
                continue
            polygon_geom = {
                "type": "Polygon",
                "coordinates": [coords],
            }
            # Normalizacja przez shapely (zapewnia orientację i waliduje)
            try:
                shp = shape(polygon_geom)
                if shp.is_empty or not shp.is_valid:
                    continue
            except Exception:  # noqa: BLE001
                continue
            bucket.offer(OsmAddress(
                source="way",
                osm_id=obj.id,
                street=street,
                house_number=housenumber,
                geojson=polygon_geom,
                postal_code=postal_code,
            ))
        # relation pomijamy świadomie

    logger.info(
        "PBF przeparsowany: %d node-adresów, %d way-adresów (po dedup: %d unikalnych)",
        nodes_seen, ways_seen, len(bucket.by_key),
    )
    return bucket


# --------------------------------------------------------------------------- #
# Lookup w bazie
# --------------------------------------------------------------------------- #


async def load_existing_addresses(db) -> set[tuple[str, str]]:
    """Zbiór (street_norm, number_norm) wszystkich adresów już w tabeli buildings."""
    result = await db.execute(
        text("SELECT street_name, house_number FROM buildings "
             "WHERE street_name IS NOT NULL AND house_number IS NOT NULL")
    )
    existing: set[tuple[str, str]] = set()
    for street, number in result.fetchall():
        existing.add((_norm_street(street), _norm_number(number)))
    logger.info("W bazie znaleziono %d istniejących adresów (street+number)", len(existing))
    return existing


async def load_street_lookup(db) -> dict[str, int]:
    """Słownik street_norm → street_id z tabeli streets."""
    result = await db.execute(text("SELECT id, name, full_name FROM streets"))
    lookup: dict[str, int] = {}
    for sid, name, full_name in result.fetchall():
        for candidate in (name, full_name):
            key = _norm_street(candidate)
            if key and key not in lookup:
                lookup[key] = sid
    logger.info("Słownik ulic (znormalizowany): %d kluczy", len(lookup))
    return lookup


# --------------------------------------------------------------------------- #
# Wstawianie
# --------------------------------------------------------------------------- #


INSERT_SQL = text("""
    INSERT INTO buildings (
        fid, id_budynku, street_id, street_name, house_number, full_address,
        rodzaj, kondygnacje_nadziemne, kondygnacje_podziemne,
        geojson_polygon, geojson_point, geom_type,
        osm_way_id, osm_node_id
    ) VALUES (
        NULL, NULL, :street_id, :street_name, :house_number, :full_address,
        NULL, NULL, NULL,
        :geojson_polygon, :geojson_point, :geom_type,
        :osm_way_id, :osm_node_id
    )
""")


async def insert_supplement(
    db,
    bucket: OsmAddressBucket,
    existing: set[tuple[str, str]],
    street_lookup: dict[str, int],
) -> tuple[int, int]:
    """Wstawia tylko te adresy OSM, których nie ma w bazie. Zwraca (poligony, punkty)."""
    rows: list[dict] = []
    polygons = 0
    points = 0
    unmatched_street = 0

    for (street_key, number_key), addr in bucket.by_key.items():
        if (street_key, number_key) in existing:
            continue

        street_id = street_lookup.get(street_key)
        if street_id is None:
            unmatched_street += 1
            # zostawiamy NULL — adres wciąż przydatny do wyszukiwania tekstowego

        if addr.source == "way":
            geom_type = "polygon"
            geojson_polygon = json.dumps(addr.geojson, ensure_ascii=False)
            geojson_point = None
            osm_way_id = addr.osm_id
            osm_node_id = None
            polygons += 1
        else:
            geom_type = "point"
            geojson_polygon = None
            geojson_point = json.dumps(addr.geojson, ensure_ascii=False)
            osm_way_id = None
            osm_node_id = addr.osm_id
            points += 1

        rows.append({
            "street_id":       street_id,
            "street_name":     addr.street.strip(),
            "house_number":    addr.house_number.strip(),
            "full_address":    f"ul. {addr.street.strip()} {addr.house_number.strip()}",
            "geojson_polygon": geojson_polygon,
            "geojson_point":   geojson_point,
            "geom_type":       geom_type,
            "osm_way_id":      osm_way_id,
            "osm_node_id":     osm_node_id,
        })

    logger.info(
        "Do wstawienia: %d nowych adresów (%d poligonów OSM + %d punktów OSM); "
        "niedopasowane street_id: %d",
        len(rows), polygons, points, unmatched_street,
    )

    inserted = 0
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i: i + BATCH_SIZE]
        await db.execute(INSERT_SQL, chunk)
        inserted += len(chunk)
        if inserted % 5000 == 0 or inserted == len(rows):
            logger.info("Postęp INSERT: %d / %d", inserted, len(rows))

    return polygons, points


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #


async def run(pbf_path: Path) -> None:
    bucket = parse_pbf(pbf_path)

    async with AsyncSessionLocal() as db:
        existing = await load_existing_addresses(db)
        street_lookup = await load_street_lookup(db)
        polygons, points = await insert_supplement(db, bucket, existing, street_lookup)
        await db.commit()

        total = await db.execute(text("SELECT COUNT(*) FROM buildings"))
        with_addr = await db.execute(
            text("SELECT COUNT(*) FROM buildings WHERE full_address IS NOT NULL")
        )
        from_osm = await db.execute(
            text("SELECT COUNT(*) FROM buildings "
                 "WHERE osm_way_id IS NOT NULL OR osm_node_id IS NOT NULL")
        )
        logger.info("")
        logger.info("=== Scenariusz 4 — uzupełnienie OSM zakończone ===")
        logger.info("  Dodano poligonów OSM (way):   %d", polygons)
        logger.info("  Dodano punktów OSM (node):    %d", points)
        logger.info("  Budynki w bazie łącznie:      %d", total.scalar())
        logger.info("  Z adresem (full_address):     %d", with_addr.scalar())
        logger.info("  Pochodzących z OSM:           %d", from_osm.scalar())


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Uzupełnij tabelę buildings adresami z OSM PBF (Scenariusz 4)"
    )
    p.add_argument("--pbf", type=Path, default=DEFAULT_PBF,
                   help="Ścieżka do pliku OSM PBF (domyślnie: lubelskie-260413.osm.pbf)")
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    if not args.pbf.exists():
        logger.error("Plik PBF nie istnieje: %s", args.pbf)
        sys.exit(1)
    asyncio.run(run(args.pbf))
