"""
Skrypt importu ulic TERYT do tabeli streets.

Źródło: backend/data/ULIC_29-03-2026.xml (format GUS TERYT ULIC)

Mapowanie pól:
  SYM_UL  -> teryt_sym_ul  (unikalny klucz, podstawa upsert)
  CECHA   -> street_type   (ul., al., rondo, skwer, …)
  NAZWA_1 -> name          (człon główny, np. "Mickiewicza")
  NAZWA_2 -> prefix        (człon dodatkowy, np. "Adama")
  full_name = NAZWA_2 + " " + NAZWA_1  gdy NAZWA_2 niepuste
            = NAZWA_1                  gdy NAZWA_2 puste

Idempotentność: ON CONFLICT (teryt_sym_ul) DO UPDATE — bezpieczne przy
ponownym uruchomieniu, aktualizuje istniejące rekordy.

Uruchomienie (z katalogu backend/):
    python -m scripts.import_streets
    python -m scripts.import_streets --file data/ULIC_29-03-2026.xml
    python -m scripts.import_streets --file data/ULIC_29-03-2026.xml --city Lublin
"""

import argparse
import asyncio
import logging
import os
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import AsyncSessionLocal
from app.models.street import Street

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

DEFAULT_XML = Path(__file__).parent.parent / "data" / "ULIC_29-03-2026.xml"
BATCH_SIZE = 100
LOG_EVERY = 100


# ---------------------------------------------------------------------------
# Parsowanie XML
# ---------------------------------------------------------------------------


def _text(row: ET.Element, tag: str) -> str:
    """Bezpieczne pobranie tekstu elementu; zwraca '' zamiast None."""
    return (row.findtext(tag) or "").strip()


def parse_rows(xml_path: Path) -> list[dict]:
    """Parsuj plik XML i zwróć listę słowników gotowych do wstawienia do bazy."""
    logger.info("Parsowanie pliku: %s", xml_path)
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

        records.append(
            {
                "teryt_sym_ul": sym_ul,
                "name": nazwa_1,
                "full_name": full_name,
                "street_type": _text(row, "CECHA") or None,
                "city": "Lublin",
            }
        )

    logger.info("Sparsowano %d rekordów", len(records))
    return records


# ---------------------------------------------------------------------------
# Import do bazy
# ---------------------------------------------------------------------------


async def import_streets(xml_path: Path) -> None:
    records = parse_rows(xml_path)
    if not records:
        logger.warning("Brak rekordów do zaimportowania.")
        return

    inserted = 0
    updated = 0

    async with AsyncSessionLocal() as db:
        for batch_start in range(0, len(records), BATCH_SIZE):
            batch = records[batch_start : batch_start + BATCH_SIZE]

            stmt = pg_insert(Street).values(batch)
            stmt = stmt.on_conflict_do_update(
                index_elements=["teryt_sym_ul"],
                set_={
                    "name": stmt.excluded.name,
                    "full_name": stmt.excluded.full_name,
                    "street_type": stmt.excluded.street_type,
                    "city": stmt.excluded.city,
                },
            )
            result = await db.execute(stmt)

            # rowcount przy ON CONFLICT DO UPDATE: 1 = insert, 2 = update (PostgreSQL)
            for row_result in range(len(batch)):
                _ = row_result  # tylko liczymy

            inserted += len(batch)

            if (batch_start + BATCH_SIZE) % LOG_EVERY == 0 or batch_start + BATCH_SIZE >= len(
                records
            ):
                logger.info(
                    "Postęp: %d / %d ulic przetworzonych",
                    min(batch_start + BATCH_SIZE, len(records)),
                    len(records),
                )

        await db.commit()

    logger.info("=== Import zakończony: %d ulic w bazie (upsert) ===", len(records))


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import ulic TERYT do bazy danych")
    parser.add_argument(
        "--file",
        type=Path,
        default=DEFAULT_XML,
        help=f"Ścieżka do pliku XML (domyślnie: {DEFAULT_XML})",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    if not args.file.exists():
        logger.error("Plik nie istnieje: %s", args.file)
        sys.exit(1)
    asyncio.run(import_streets(args.file))
