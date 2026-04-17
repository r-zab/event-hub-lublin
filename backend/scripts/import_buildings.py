#!/usr/bin/env python3
"""
Import budynków do PostGIS — programowy Spatial Join (geopandas)
================================================================

Źródła danych (oba EPSG:4326):
  backend/data/budynki_surowe.geojson   — 46 k poligonów budynków (BDOT10k)
  backend/data/adresy_surowe.geojson    — 28 k punktów adresowych (GUGiK)

Algorytm (dwuetapowy spatial join):
  1. KROK 1 — Rygorystpython -m scripts.import_buildingsyczny (intersects):
     Wczytaj oba pliki przez geopandas.read_file().
     Wykonaj gpd.sjoin(budynki, adresy, how='left', predicate='intersects').
     how='left' ZACHOWUJE wszystkie budynki — garaże i obiekty bez adresu
     trafiają do bazy z NULL w polach adresowych.
     Deduplikuj po fid — jeśli kilka punktów adresowych wpada w jeden poligon,
     zostawiamy pierwszy (najczęściej to ten sam adres główny).

  2. KROK 2 — Ratunkowy (nearest, max 15 m):
     Dla budynków, które po KROK 1 nadal mają NULL w NAZWA_ULC,
     reprojekcja na EPSG:2180 (PUWG 1992 — metryczny układ dla Polski)
     i wyszukanie najbliższego punktu adresowego w promieniu ≤ 15 m.
     Obsługuje budynki z przesuniętymi punktami PRG (szczególnie rodzaj='m').

  3. Buduj full_address = "ul. NAZWA_ULC NUMER_PORZ" tam, gdzie join coś znalazł.
  4. Mapuj ID_ULIC → street_id przez teryt_sym_ul w tabeli streets
     (bezpośrednie dopasowanie TERYT — bezbłędne, bez fuzzy matching).
  5. Masowy INSERT batchami (BATCH_SIZE=500) z upsert po fid.

Uruchomienie (z katalogu backend/):
    
    python -m scripts.import_buildings --budynki data/budynki_surowe.geojson \
                                       --adresy  data/adresy_surowe.geojson
"""

import argparse
import asyncio
import json
import logging
import os
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import mapping

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text

from app.database import AsyncSessionLocal

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"
DEFAULT_BUDYNKI = DATA_DIR / "budynki_surowe.geojson"
DEFAULT_ADRESY = DATA_DIR / "adresy_surowe.geojson"

BATCH_SIZE = 500

# ---------------------------------------------------------------------------
# DDL — budujemy tabelę od zera przy każdym re-imporcie
# ---------------------------------------------------------------------------

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS buildings (
    id                    SERIAL PRIMARY KEY,
    fid                   INTEGER UNIQUE,
    id_budynku            VARCHAR(100),
    street_id             INTEGER REFERENCES streets(id) ON DELETE SET NULL,
    street_name           VARCHAR(200),
    house_number          VARCHAR(20),
    full_address          VARCHAR(300),
    rodzaj                VARCHAR(20),
    kondygnacje_nadziemne INTEGER,
    kondygnacje_podziemne INTEGER,
    geojson_polygon       JSONB,
    geojson_point         JSONB,
    geom_type             VARCHAR(10) NOT NULL DEFAULT 'polygon',
    osm_way_id            BIGINT,
    osm_node_id           BIGINT,
    created_at            TIMESTAMP DEFAULT NOW()
)
"""

CREATE_INDEXES_SQL = [
    "CREATE INDEX IF NOT EXISTS idx_buildings_street_id    ON buildings(street_id)",
    "CREATE INDEX IF NOT EXISTS idx_buildings_street_name  ON buildings(street_name)",
    "CREATE INDEX IF NOT EXISTS idx_buildings_house_number ON buildings(house_number)",
    "CREATE INDEX IF NOT EXISTS idx_buildings_full_address ON buildings(full_address)",
    "CREATE INDEX IF NOT EXISTS idx_buildings_osm_way_id   ON buildings(osm_way_id)",
    "CREATE INDEX IF NOT EXISTS idx_buildings_osm_node_id  ON buildings(osm_node_id)",
    "CREATE INDEX IF NOT EXISTS idx_buildings_geom_type    ON buildings(geom_type)",
]


# ---------------------------------------------------------------------------
# Krok 1 — wczytanie i spatial join
# ---------------------------------------------------------------------------


RESCUE_RADIUS_M = 15       # metrów — maksymalna odległość dla joinu ratunkowego
METRIC_CRS      = "EPSG:2180"   # PUWG 1992 — metryczny układ dla Polski


def spatial_join(budynki_path: Path, adresy_path: Path) -> gpd.GeoDataFrame:
    """
    Dwuetapowy spatial join: intersects (rygorystyczny) + nearest ≤15 m (ratunkowy).

    Zwraca GeoDataFrame z kolumnami z budynków + opcjonalnymi NAZWA_ULC/NUMER_PORZ/ID_ULIC.
    """
    logger.info("Wczytywanie budynkow: %s", budynki_path)
    budynki = gpd.read_file(budynki_path)
    logger.info("  → %d poligonow, CRS: %s", len(budynki), budynki.crs)

    logger.info("Wczytywanie adresow: %s", adresy_path)
    adresy = gpd.read_file(adresy_path)
    logger.info("  → %d punktow adresowych, CRS: %s", len(adresy), adresy.crs)

    # Upewnij sie, ze oba GeoDataFrame sa w tym samym CRS
    if budynki.crs is None:
        budynki = budynki.set_crs("EPSG:4326")
    if adresy.crs is None:
        adresy = adresy.set_crs("EPSG:4326")
    if budynki.crs != adresy.crs:
        logger.info("Reprojekcja adresow z %s na %s", adresy.crs, budynki.crs)
        adresy = adresy.to_crs(budynki.crs)

    adresy_slim = adresy[["geometry", "NAZWA_ULC", "NUMER_PORZ", "ID_ULIC"]].copy()

    # -----------------------------------------------------------------------
    # KROK 1 — Rygorystyczny: punkt adresowy WEWNĄTRZ poligonu budynku
    # -----------------------------------------------------------------------
    logger.info("KROK 1: Spatial join (left, intersects) — rtree acceleration...")
    joined: gpd.GeoDataFrame = gpd.sjoin(
        budynki, adresy_slim, how="left", predicate="intersects"
    )

    before = len(joined)
    joined = joined.sort_values("fid").drop_duplicates(subset=["fid"], keep="first")
    after = len(joined)
    if before > after:
        logger.info(
            "  Deduplikacja: %d wierszy → %d (usunieto %d duplikatow)",
            before, after, before - after,
        )

    with_addr_k1 = int(joined["NAZWA_ULC"].notna().sum())
    without_addr_k1 = int(joined["NAZWA_ULC"].isna().sum())
    logger.info(
        "  Wynik KROK 1: %d z adresem | %d bez adresu",
        with_addr_k1, without_addr_k1,
    )

    # -----------------------------------------------------------------------
    # KROK 2 — Ratunkowy: nearest ≤ RESCUE_RADIUS_M metrów
    # -----------------------------------------------------------------------
    if without_addr_k1 == 0:
        logger.info("KROK 2: brak budynkow bez adresu — pomijam.")
        return joined

    logger.info(
        "KROK 2: Szukanie najblizszego punktu adresowego w promieniu %d m "
        "dla %d budynkow bez adresu...",
        RESCUE_RADIUS_M, without_addr_k1,
    )

    # Maska budynkow bez adresu po KROK 1
    no_addr_mask = joined["NAZWA_ULC"].isna()
    budynki_bez_adresu = budynki[budynki["fid"].isin(joined.loc[no_addr_mask, "fid"])].copy()

    # Reprojekcja na uklad metryczny (obydwa dataframe)
    budynki_metric   = budynki_bez_adresu.to_crs(METRIC_CRS)
    adresy_metric    = adresy_slim.to_crs(METRIC_CRS)

    # sjoin_nearest z max_distance w metrach (geopandas >= 0.10)
    nearest = gpd.sjoin_nearest(
        budynki_metric,
        adresy_metric,
        how="left",
        max_distance=RESCUE_RADIUS_M,
        distance_col="_dist_m",
    )

    # Deduplikacja (budynek może mieć kilka punktów w promieniu — bierzemy najbliższy)
    nearest = nearest.sort_values(["fid", "_dist_m"]).drop_duplicates(subset=["fid"], keep="first")

    # Zostaw tylko te, które faktycznie dostały adres w KROK 2
    rescued = nearest[nearest["NAZWA_ULC"].notna()].copy()
    logger.info("  Uratowano %d budynkow (najblizszy punkt ≤ %d m)", len(rescued), RESCUE_RADIUS_M)

    # Zaktualizuj joined: nadpisz NAZWA_ULC, NUMER_PORZ, ID_ULIC dla uratowanych
    if len(rescued) > 0:
        rescued_indexed = rescued.set_index("fid")[["NAZWA_ULC", "NUMER_PORZ", "ID_ULIC"]]
        joined = joined.set_index("fid")
        for col in ["NAZWA_ULC", "NUMER_PORZ", "ID_ULIC"]:
            joined.loc[rescued_indexed.index, col] = rescued_indexed[col].values
        joined = joined.reset_index()

    # Podsumowanie końcowe
    with_addr_final   = int(joined["NAZWA_ULC"].notna().sum())
    without_addr_final = int(joined["NAZWA_ULC"].isna().sum())
    logger.info(
        "Wynik po obu krokach: %d budynkow LACZNIE | %d z adresem (+%d z KROK 2) | %d bez adresu",
        len(joined),
        with_addr_final,
        with_addr_final - with_addr_k1,
        without_addr_final,
    )
    return joined


# ---------------------------------------------------------------------------
# Krok 2 — budowanie full_address i lookup street_id
# ---------------------------------------------------------------------------


def build_address_fields(joined: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Dodaj kolumny: full_address, street_name_clean, house_number_clean."""

    def _full_address(row: pd.Series) -> str | None:
        ulc = row.get("NAZWA_ULC")
        nr = row.get("NUMER_PORZ")
        if pd.notna(ulc) and pd.notna(nr) and str(ulc).strip() and str(nr).strip():
            return f"ul. {str(ulc).strip()} {str(nr).strip()}"
        return None

    joined["full_address"] = joined.apply(_full_address, axis=1)

    # Przepisz do czystych kolumn (None tam gdzie brak danych)
    joined["street_name"] = joined["NAZWA_ULC"].where(joined["NAZWA_ULC"].notna(), other=None)
    joined["house_number"] = joined["NUMER_PORZ"].where(joined["NUMER_PORZ"].notna(), other=None)

    return joined


async def build_teryt_lookup(db) -> dict[str, int]:
    """Buduje slownik {teryt_sym_ul: street_id} z tabeli streets."""
    result = await db.execute(
        text("SELECT id, teryt_sym_ul FROM streets WHERE teryt_sym_ul IS NOT NULL")
    )
    lookup = {row[1]: row[0] for row in result.fetchall()}
    logger.info("Zaladowano %d wpisow TERYT ze slownika streets", len(lookup))
    return lookup


# ---------------------------------------------------------------------------
# Krok 3 — masowy INSERT
# ---------------------------------------------------------------------------


async def insert_batches(db, joined: gpd.GeoDataFrame, teryt_lookup: dict[str, int]) -> int:
    """Wykonaj batchowy upsert wszystkich budynkow. Zwraca liczbe wstawionych wierszy."""
    upsert_sql = text("""
        INSERT INTO buildings (
            fid, id_budynku, street_id, street_name, house_number,
            full_address, rodzaj, kondygnacje_nadziemne, kondygnacje_podziemne,
            geojson_polygon
        ) VALUES (
            :fid, :id_budynku, :street_id, :street_name, :house_number,
            :full_address, :rodzaj, :kondygnacje_nadziemne, :kondygnacje_podziemne,
            :geojson_polygon
        )
        ON CONFLICT (fid) DO UPDATE SET
            id_budynku            = EXCLUDED.id_budynku,
            street_id             = EXCLUDED.street_id,
            street_name           = EXCLUDED.street_name,
            house_number          = EXCLUDED.house_number,
            full_address          = EXCLUDED.full_address,
            rodzaj                = EXCLUDED.rodzaj,
            kondygnacje_nadziemne = EXCLUDED.kondygnacje_nadziemne,
            kondygnacje_podziemne = EXCLUDED.kondygnacje_podziemne,
            geojson_polygon       = EXCLUDED.geojson_polygon
    """)

    total = len(joined)
    inserted = 0

    for batch_start in range(0, total, BATCH_SIZE):
        batch = joined.iloc[batch_start: batch_start + BATCH_SIZE]
        rows = []

        for _, row in batch.iterrows():
            # Bezposrednie mapowanie TERYT: ID_ULIC adresu → teryt_sym_ul w streets
            id_ulic_raw = row.get("ID_ULIC")
            id_ulic = str(id_ulic_raw).strip() if pd.notna(id_ulic_raw) else ""
            street_id = teryt_lookup.get(id_ulic) if id_ulic else None

            # Kondygnacje — mogą być NaN po joinnie
            k_nad = row.get("kondygnacje_nadziemne")
            k_pod = row.get("kondygnacje_podziemne")
            k_nad = int(k_nad) if pd.notna(k_nad) and k_nad is not None else None
            k_pod = int(k_pod) if pd.notna(k_pod) and k_pod is not None else None

            # Geometria jako dict GeoJSON (shapely → mapping)
            geom = row.geometry
            geojson_polygon = json.dumps(mapping(geom), ensure_ascii=False) if geom and not geom.is_empty else None

            # Pomocnik: NaN → None dla wszystkich kolumn tekstowych
            def _str(val) -> str | None:
                return str(val).strip() if pd.notna(val) and val is not None else None

            rows.append({
                "fid":          int(row["fid"]) if pd.notna(row.get("fid")) else None,
                "id_budynku":   _str(row.get("id_budynku")),
                "street_id":    street_id,
                "street_name":  _str(row.get("street_name")),
                "house_number": _str(row.get("house_number")),
                "full_address": _str(row.get("full_address")),
                "rodzaj":       _str(row.get("rodzaj")),
                "kondygnacje_nadziemne": k_nad,
                "kondygnacje_podziemne": k_pod,
                "geojson_polygon": geojson_polygon,
            })

        await db.execute(upsert_sql, rows)
        inserted += len(rows)

        if inserted % 5000 == 0 or inserted == total:
            logger.info("Postep: %d / %d budynkow wstawionych", inserted, total)

    return inserted


# ---------------------------------------------------------------------------
# Główna funkcja
# ---------------------------------------------------------------------------


async def import_buildings(budynki_path: Path, adresy_path: Path) -> None:
    # --- Etap GIS (poza asyncio — synchroniczny, intensywny CPU) ---
    joined = spatial_join(budynki_path, adresy_path)
    joined = build_address_fields(joined)

    # --- Etap DB ---
    async with AsyncSessionLocal() as db:
        logger.info("Przebudowa tabeli buildings (DROP + CREATE)...")
        await db.execute(text("DROP TABLE IF EXISTS buildings CASCADE"))
        await db.execute(text(CREATE_TABLE_SQL))
        for idx_sql in CREATE_INDEXES_SQL:
            await db.execute(text(idx_sql))
        await db.commit()
        logger.info("Tabela buildings gotowa")

        teryt_lookup = await build_teryt_lookup(db)

        total_inserted = await insert_batches(db, joined, teryt_lookup)
        await db.commit()

    # --- Podsumowanie ---
    with_addr = int(joined["full_address"].notna().sum())
    without_addr = int(joined["full_address"].isna().sum())
    logger.info("")
    logger.info("=== Import budynkow (spatial join) zakończony ===")
    logger.info("  Laczna liczba budynkow:     %d", total_inserted)
    logger.info("  Z adresem (full_address):   %d", with_addr)
    logger.info("  Bez adresu (bezadresowe):   %d", without_addr)
    logger.info("  Uklad wspolrzednych:        EPSG:4326 (WGS84)")
    logger.info("  Metoda joinu:               KROK1 sjoin intersects + KROK2 sjoin_nearest ≤15 m (EPSG:2180)")
    logger.info("")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Import budynkow BDOT10k do PostGIS via geopandas spatial join"
    )
    p.add_argument("--budynki", type=Path, default=DEFAULT_BUDYNKI)
    p.add_argument("--adresy",  type=Path, default=DEFAULT_ADRESY)
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    for p in (args.budynki, args.adresy):
        if not p.exists():
            logger.error("Plik nie istnieje: %s", p)
            sys.exit(1)
    asyncio.run(import_buildings(args.budynki, args.adresy))