"""
Event Service — operacje biznesowe na zdarzeniach (geokodowanie, budynki).
"""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.building import Building
from app.models.event import Event
from app.services.notification_service import is_in_range

logger = logging.getLogger(__name__)


async def assign_buildings_by_range(
    db: AsyncSession,
    event_id: int,
    street_name: str | None,
    street_id: int | None,
    house_number_from: str | None,
    house_number_to: str | None,
) -> int:
    """
    Znajdź budynki pasujące do zakresu numerów na ulicy i zapisz je w geojson_segment zdarzenia.

    Zwraca liczbę dopasowanych budynków.
    """
    if not house_number_from and not house_number_to:
        return 0

    # Zapytanie po street_id (preferowane) lub street_name
    if street_id is not None:
        stmt = select(Building).where(Building.street_id == street_id)
    elif street_name:
        stmt = select(Building).where(Building.street_name == street_name)
    else:
        return 0

    result = await db.execute(stmt)
    buildings = result.scalars().all()

    matched: list[Building] = [
        b for b in buildings
        if b.house_number and is_in_range(b.house_number, house_number_from, house_number_to)
    ]

    if not matched:
        return 0

    features = []
    for b in matched:
        geometry = b.geojson_polygon or b.geojson_point
        if geometry is None:
            continue
        features.append({
            "type": "Feature",
            "geometry": geometry,
            "properties": {
                "house_number": b.house_number,
                "building_id": b.id,
            },
        })

    if not features:
        return 0

    geojson_segment = {"type": "FeatureCollection", "features": features}

    event_result = await db.execute(select(Event).where(Event.id == event_id))
    event = event_result.scalar_one_or_none()
    if event is None:
        logger.warning("assign_buildings_by_range: zdarzenie id=%d nie istnieje", event_id)
        return 0

    event.geojson_segment = geojson_segment
    db.add(event)
    await db.commit()

    logger.debug(
        "assign_buildings_by_range: event_id=%d ulica=%r zakres=%r–%r dopasowano=%d budynków",
        event_id, street_name, house_number_from, house_number_to, len(features),
    )
    return len(features)
