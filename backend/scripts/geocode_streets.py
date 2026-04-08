"""
Skrypt geokodowania ulic — Nominatim (OpenStreetMap).

Dla każdej ulicy w tabeli `streets` z `geojson IS NULL` wykonuje zapytanie
do Nominatim API i zapisuje wynik jako GeoJSON Point w kolumnie `geojson`.

WAŻNE: Nominatim wymaga przerwy min. 1 sekundy między zapytaniami.
       Skrypt domyślnie czeka 1.2 s po KAŻDYM żądaniu (również nieudanym).
       Przy 1378 ulicach i max 3 wariantach całkowity czas: ~28–85 minut.

Uruchomienie (z katalogu backend/):
    python -m scripts.geocode_streets
    python -m scripts.geocode_streets --delay 1.5      # wolniej, bezpieczniej
    python -m scripts.geocode_streets --dry-run        # tylko log, brak zapisu
    python -m scripts.geocode_streets --limit 50       # geokoduj tylko 50 ulic

Przykład cron (raz dziennie, uzupełnia brakujące):
    0 3 * * * cd /app && python -m scripts.geocode_streets
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

import httpx
from sqlalchemy import select

# Dodaj katalog backend/ do ścieżki, żeby import app.* działał z linii poleceń
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402
from app.models.street import Street  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("geocode_streets")


async def geocode_streets(delay: float = 1.2, dry_run: bool = False, limit: int | None = None) -> None:
    """Geokoduj ulice bez GeoJSON przez Nominatim API.

    Args:
        delay:   Przerwa między zapytaniami w sekundach (domyślnie 1.2).
        dry_run: Jeśli True — loguje wyniki, ale nie zapisuje do bazy.
        limit:   Maks. liczba ulic do przetworzenia w jednym uruchomieniu.
    """
    nominatim_url = f"{settings.NOMINATIM_URL.rstrip('/')}/search"
    user_agent = settings.NOMINATIM_USER_AGENT

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Street)
            .where(Street.geojson.is_(None))
            .order_by(Street.id)
        )
        streets: list[Street] = list(result.scalars().all())

    total_without_geojson = len(streets)

    if limit is not None:
        streets = streets[:limit]

    logger.info(
        "Ulic bez GeoJSON: %d | do przetworzenia: %d | delay=%.1fs | dry_run=%s",
        total_without_geojson,
        len(streets),
        delay,
        dry_run,
    )

    if not streets:
        logger.info("Wszystkie ulice mają już GeoJSON. Koniec.")
        return

    geocoded = 0
    not_found = 0
    errors = 0

    headers = {"User-Agent": user_agent}

    async with httpx.AsyncClient(timeout=10.0) as client:
        for i, street in enumerate(streets, start=1):
            # Kandydaci od najbardziej do najmniej precyzyjnego
            candidates: list[str] = [f"{street.full_name}, {street.city}, Poland"]
            if street.street_type:
                candidates.append(f"{street.street_type} {street.name}, {street.city}, Poland")
            candidates.append(f"{street.name}, {street.city}, Poland")

            found = False
            street_error = False
            for variant_idx, query in enumerate(candidates, start=1):
                try:
                    response = await client.get(
                        nominatim_url,
                        params={"q": query, "format": "json", "limit": 1},
                        headers=headers,
                    )
                    response.raise_for_status()
                    data = response.json()
                except httpx.HTTPStatusError as exc:
                    errors += 1
                    street_error = True
                    logger.error(
                        "[%d/%d] HTTP %d dla: %s (wariant %d: %r)",
                        i, len(streets), exc.response.status_code,
                        street.full_name, variant_idx, query,
                    )
                    # Sleep obowiązkowy — nawet po błędzie HTTP
                    await asyncio.sleep(delay)
                    break  # błąd serwera — nie próbuj kolejnych wariantów tej ulicy
                except httpx.RequestError as exc:
                    errors += 1
                    street_error = True
                    logger.error(
                        "[%d/%d] Błąd połączenia dla: %s — %s",
                        i, len(streets), street.full_name, exc,
                    )
                    await asyncio.sleep(delay)
                    break
                except Exception:
                    errors += 1
                    street_error = True
                    logger.exception(
                        "[%d/%d] Nieoczekiwany błąd dla: %s (wariant %d)",
                        i, len(streets), street.full_name, variant_idx,
                    )
                    await asyncio.sleep(delay)
                    break

                # Nominatim Usage Policy: sleep po KAŻDYM żądaniu
                await asyncio.sleep(delay)

                if data:
                    hit = data[0]
                    lat = float(hit["lat"])
                    lon = float(hit["lon"])
                    geojson_point = {"type": "Point", "coordinates": [lon, lat]}

                    if not dry_run:
                        async with AsyncSessionLocal() as session:
                            db_street = await session.get(Street, street.id)
                            if db_street is not None:
                                db_street.geojson = geojson_point
                                await session.commit()

                    geocoded += 1
                    found = True
                    logger.info(
                        "[%d/%d] ✓ %s → (%.5f, %.5f) [wariant %d: %r]%s",
                        i, len(streets), street.full_name, lat, lon,
                        variant_idx, query,
                        " [dry-run]" if dry_run else "",
                    )
                    break  # sukces — przejdź do następnej ulicy

            if not found and not street_error:
                not_found += 1
                logger.warning(
                    "[%d/%d] ✗ Nie znaleziono: %s (sprawdzono %d wariantów)",
                    i, len(streets), street.full_name, len(candidates),
                )

    logger.info(
        "Zakończono — zgeokodowano: %d | nie znaleziono: %d | błędy: %d | łącznie: %d",
        geocoded,
        not_found,
        errors,
        len(streets),
    )


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Geokodowanie ulic przez Nominatim (OpenStreetMap)")
    parser.add_argument(
        "--delay",
        type=float,
        default=1.2,
        help="Przerwa między zapytaniami w sekundach (domyślnie 1.2)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Tylko loguj wyniki, nie zapisuj do bazy",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maks. liczba ulic do przetworzenia (domyślnie: wszystkie bez GeoJSON)",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    asyncio.run(geocode_streets(delay=args.delay, dry_run=args.dry_run, limit=args.limit))
