"""
Skrypt importu ulic do tabeli streets.

Obsługuje dwa formaty wejściowe:
  1. GeoJSON (domyślny) — backend/data/streets_lublin__final.geojson
     Mapowanie pól:
       ID_ULIC    -> teryt_sym_ul  (unikalny klucz, podstawa upsert)
       NAZWA_TER1 -> name          (człon główny, np. "Mickiewicza")
       NAZWA_ULC  -> full_name     (pełna nazwa, np. "Adama Mickiewicza")
       RODZAJ     -> street_type
       geometry   -> geojson       (JSONB, MultiLineString, EPSG:4326)

  2. XML (legacy) — backend/data/ULIC_29-03-2026.xml (format GUS TERYT ULIC)
     Mapowanie pól:
       SYM_UL  -> teryt_sym_ul
       CECHA   -> street_type
       NAZWA_1 -> name
       NAZWA_2 -> prefix

Idempotentność: ON CONFLICT (teryt_sym_ul) DO UPDATE — bezpieczne przy
ponownym uruchomieniu, aktualizuje istniejące rekordy.

Uruchomienie (z katalogu backend/):
    python -m scripts.import_streets                                        # GeoJSON (domyślny)
    python -m scripts.import_streets --file data/streets_lublin__final.geojson
    python -m scripts.import_streets --file data/ULIC_29-03-2026.xml       # tryb XML (legacy)
"""

import argparse
import asyncio
import json
import logging
import os
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import AsyncSessionLocal
from app.models.street import Street

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

DEFAULT_GEOJSON = Path(__file__).parent.parent / "data" / "streets_lublin__final.geojson"
DEFAULT_XML = Path(__file__).parent.parent / "data" / "ULIC_29-03-2026.xml"
BATCH_SIZE = 100
LOG_EVERY = 100


# ---------------------------------------------------------------------------
# Parsowanie GeoJSON (tryb domyślny)
# ---------------------------------------------------------------------------


def parse_rows_geojson(geojson_path: Path) -> list[dict]:
    """Parsuj plik GeoJSON i zwróć listę słowników gotowych do wstawienia do bazy."""
    logger.info("Parsowanie GeoJSON: %s", geojson_path)
    with open(geojson_path, encoding="utf-8") as f:
        geojson = json.load(f)

    features = geojson.get("features", [])
    logger.info("Zaladowano %d features z pliku GeoJSON", len(features))

    records: list[dict] = []
    skipped = 0

    for feature in features:
        props = feature.get("properties") or {}
        geom = feature.get("geometry")

        id_ulic = str(props.get("ID_ULIC") or "").strip()
        if not id_ulic:
            skipped += 1
            continue

        nazwa_ter1 = (props.get("NAZWA_TER1") or "").strip()   # człon główny
        nazwa_ulc = (props.get("NAZWA_ULC") or "").strip()     # pełna nazwa

        # Fallback: jeśli brak full_name, użyj głównego członu
        full_name = nazwa_ulc if nazwa_ulc else nazwa_ter1

        records.append({
            "teryt_sym_ul": id_ulic,
            "name":         nazwa_ter1 if nazwa_ter1 else full_name,
            "full_name":    full_name,
            "street_type":  str(props.get("RODZAJ") or "").strip() or None,
            "city":         "Lublin",
            "geojson":      geom,  # dict przekazywany bezpośrednio do JSONB
        })

    if skipped:
        logger.warning("Pominieto %d featurow bez ID_ULIC", skipped)
    logger.info("Sparsowano %d rekordow z GeoJSON", len(records))
    return records


# ---------------------------------------------------------------------------
# Parsowanie XML (tryb legacy — TERYT ULIC)
# ---------------------------------------------------------------------------


def _text(row: ET.Element, tag: str) -> str:
    """Bezpieczne pobranie tekstu elementu; zwraca '' zamiast None."""
    return (row.findtext(tag) or "").strip()


def parse_rows_xml(xml_path: Path) -> list[dict]:
    """Parsuj plik XML i zwróć listę słowników gotowych do wstawienia do bazy."""
    logger.info("Parsowanie XML: %s", xml_path)
    tree = ET.parse(xml_path)
    root = tree.getroot()

    records: list[dict] = []
    for row in root.findall("row"):
        sym_ul = _text(row, "SYM_UL")
        if not sym_ul:
            continue

        nazwa_1 = _text(row, "NAZWA_1")
        nazwa_2 = _text(row, "NAZWA_2")
        full_name = f"{nazwa_2} {nazwa_1}".strip() if nazwa_2 else nazwa_1

        records.append({
            "teryt_sym_ul": sym_ul,
            "name":         nazwa_1,
            "full_name":    full_name,
            "street_type":  _text(row, "CECHA") or None,
            "city":         "Lublin",
            "geojson":      None,
        })

    logger.info("Sparsowano %d rekordow z XML", len(records))
    return records


# ---------------------------------------------------------------------------
# Import do bazy (wspólny dla obu formatów)
# ---------------------------------------------------------------------------


async def import_streets(records: list[dict]) -> None:
    if not records:
        logger.warning("Brak rekordow do zaimportowania.")
        return

    async with AsyncSessionLocal() as db:
        for batch_start in range(0, len(records), BATCH_SIZE):
            batch = records[batch_start: batch_start + BATCH_SIZE]

            stmt = pg_insert(Street).values(batch)
            stmt = stmt.on_conflict_do_update(
                index_elements=["teryt_sym_ul"],
                set_={
                    "name":        stmt.excluded.name,
                    "full_name":   stmt.excluded.full_name,
                    "street_type": stmt.excluded.street_type,
                    "city":        stmt.excluded.city,
                    "geojson":     stmt.excluded.geojson,
                },
            )
            await db.execute(stmt)

            progress = min(batch_start + BATCH_SIZE, len(records))
            if progress % LOG_EVERY == 0 or progress == len(records):
                logger.info("Postep: %d / %d ulic przetworzonych", progress, len(records))

        # Normalizacja: SQLAlchemy zapisuje Python None jako JSONB literal 'null',
        # a geocode_streets.py filtruje po `geojson IS NULL`. Konwertujemy, zeby
        # brakujace geometrie byly wykrywalne przez geokoder.
        result = await db.execute(
            text("UPDATE streets SET geojson = NULL WHERE geojson = 'null'::jsonb")
        )
        if result.rowcount:
            logger.info("Znormalizowano %d rekordow z JSONB 'null' -> SQL NULL", result.rowcount)

        await db.commit()

    logger.info("=== Import ulic zakonczony: %d ulic w bazie (upsert) ===", len(records))


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def _detect_format(path: Path) -> str:
    """Wykryj format pliku na podstawie rozszerzenia."""
    suffix = path.suffix.lower()
    if suffix == ".xml":
        return "xml"
    return "geojson"


def _supplement_from_teryt(geo_records: list[dict], xml_path: Path) -> list[dict]:
    """Dołącz do listy rekordów te ulice TERYT, których brakuje w GeoJSON (geojson=NULL).

    Takie ulice (place, skwery, parki, rzadkie ulice bez mapy OSM) można później
    uzupełnić o geometrię uruchamiając `scripts/geocode_streets.py`.
    """
    if not xml_path.exists():
        logger.warning("Brak pliku TERYT XML (%s) — pomijam uzupelnianie brakujacych ulic.", xml_path)
        return geo_records

    existing_ids = {r["teryt_sym_ul"] for r in geo_records}
    xml_records = parse_rows_xml(xml_path)
    supplemented = [r for r in xml_records if r["teryt_sym_ul"] not in existing_ids]

    if supplemented:
        logger.info(
            "Uzupelniono %d ulic z TERYT bez geometrii (geojson=NULL) — do geokodowania",
            len(supplemented),
        )
    else:
        logger.info("Wszystkie ulice TERYT maja pokrycie w GeoJSON — brak uzupelnien.")

    return geo_records + supplemented


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import ulic do bazy danych (GeoJSON lub XML TERYT)")
    parser.add_argument(
        "--file",
        type=Path,
        default=DEFAULT_GEOJSON,
        help=f"Sciezka do pliku GeoJSON lub XML (domyslnie: {DEFAULT_GEOJSON})",
    )
    parser.add_argument(
        "--teryt-xml",
        type=Path,
        default=DEFAULT_XML,
        help=(
            "Sciezka do XML TERYT ULIC, uzywana w trybie GeoJSON do uzupelnienia "
            f"brakujacych ulic (geojson=NULL). Domyslnie: {DEFAULT_XML}. "
            "Podaj pusty string, aby wylaczyc."
        ),
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    if not args.file.exists():
        logger.error("Plik nie istnieje: %s", args.file)
        sys.exit(1)

    fmt = _detect_format(args.file)
    if fmt == "xml":
        records = parse_rows_xml(args.file)
    else:
        records = parse_rows_geojson(args.file)
        if args.teryt_xml and str(args.teryt_xml):
            records = _supplement_from_teryt(records, args.teryt_xml)

    asyncio.run(import_streets(records))
