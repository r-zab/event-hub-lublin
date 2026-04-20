#!/usr/bin/env python3
"""
Pobieranie POLIGONÓW budynków z adresami Lublina z OpenStreetMap
=================================================================

Pobiera pełną geometrię budynków (wielokąty) — nie punkty.
Dzięki temu na mapie Leaflet budynek świeci się OBRYSEM gdy jest awaria.

Uruchomienie:
    pip install requests
    python pobierz_budynki_lublin.py

Wynik:
    lublin_budynki.geojson  — plik GeoJSON z poligonami budynków

Format każdego Feature:
    {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[lon1,lat1], [lon2,lat2], ...]]
        },
        "properties": {
            "osm_id": 12345678,
            "street": "Lipowa",
            "house_number": "10A",
            "full_address": "ul. Lipowa 10A, Lublin",
            "center_lat": 51.23,
            "center_lon": 22.55
        }
    }
"""

import json
import os
import sys
import time
from pathlib import Path

import requests

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OUTPUT_FILE = str(Path(__file__).parent.parent / "data" / "lublin_budynki.geojson")

# "out geom" = pełna geometria (wszystkie wierzchołki poligonu)
OVERPASS_QUERY = """
[out:json][timeout:180];
area["name"="Lublin"]["admin_level"="8"]->.lublin;
(
  way["building"]["addr:street"]["addr:housenumber"](area.lublin);
  way["addr:street"]["addr:housenumber"](area.lublin);
);
out geom tags;
"""


def fetch_osm_data() -> dict:
    print("=" * 60)
    print("Pobieranie poligonów budynków — Lublin (OSM)")
    print("Może potrwać 60–180 sekund...")
    print("=" * 60)

    try:
        response = requests.post(
            OVERPASS_URL,
            data={"data": OVERPASS_QUERY},
            timeout=240,
            headers={"User-Agent": "MPWiKLublin-Powiadomienia/1.0 (MPWiK projekt PL)"},
        )
        response.raise_for_status()
    except requests.Timeout:
        print("BŁĄD: Timeout. Spróbuj ponownie za chwilę.")
        sys.exit(1)
    except requests.RequestException as e:
        print(f"BŁĄD: {e}")
        sys.exit(1)

    data = response.json()
    print(f"Pobrano {len(data.get('elements', []))} elementów.")
    return data


def way_to_polygon(geometry: list) -> list | None:
    if not geometry or len(geometry) < 3:
        return None
    coords = [[node["lon"], node["lat"]] for node in geometry]
    if coords[0] != coords[-1]:
        coords.append(coords[0])
    return coords


def calc_center(coords: list) -> tuple:
    lons = [c[0] for c in coords[:-1]]
    lats = [c[1] for c in coords[:-1]]
    return sum(lats) / len(lats), sum(lons) / len(lons)


def element_to_feature(el: dict) -> dict | None:
    tags = el.get("tags", {})
    street = tags.get("addr:street", "").strip()
    house_number = tags.get("addr:housenumber", "").strip()

    if not street or not house_number:
        return None

    el_type = el.get("type")

    if el_type == "way":
        ring = way_to_polygon(el.get("geometry", []))
        if not ring:
            return None
        center_lat, center_lon = calc_center(ring)
        geo = {"type": "Polygon", "coordinates": [ring]}

    elif el_type == "node":
        lat, lon = el.get("lat"), el.get("lon")
        if lat is None:
            return None
        center_lat, center_lon = lat, lon
        geo = {"type": "Point", "coordinates": [lon, lat]}
    else:
        return None

    city = tags.get("addr:city", "Lublin").strip() or "Lublin"

    return {
        "type": "Feature",
        "geometry": geo,
        "properties": {
            "osm_id": el.get("id"),
            "osm_type": el_type,
            "street": street,
            "house_number": house_number,
            "postcode": tags.get("addr:postcode", ""),
            "city": city,
            "full_address": f"ul. {street} {house_number}, {city}",
            "building": tags.get("building", ""),
            "name": tags.get("name", ""),
            "center_lat": round(center_lat, 7),
            "center_lon": round(center_lon, 7),
        },
    }


def convert_to_geojson(osm_data: dict) -> dict:
    elements = osm_data.get("elements", [])
    features = []
    skipped = 0

    for el in elements:
        feature = element_to_feature(el)
        if feature:
            features.append(feature)
        else:
            skipped += 1

    polygons = sum(1 for f in features if f["geometry"]["type"] == "Polygon")
    points = len(features) - polygons

    print(f"\nWynik:")
    print(f"  Poligony (pełny obrys budynku): {polygons}")
    print(f"  Punkty (fallback bez geometrii): {points}")
    print(f"  Pominięte (brak adresu):        {skipped}")

    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "source": "OpenStreetMap contributors (ODbL)",
            "city": "Lublin",
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "total_features": len(features),
            "polygons": polygons,
        },
    }


def save_geojson(geojson: dict, path: str) -> None:
    print(f"\nZapisywanie do {path}...")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(",", ":"))
    size_mb = os.path.getsize(path) / 1_000_000
    print(f"Zapisano: {size_mb:.1f} MB, {geojson['metadata']['total_features']} budynków")


def print_stats(geojson: dict) -> None:
    features = geojson["features"]
    if not features:
        return
    streets = {}
    for f in features:
        s = f["properties"]["street"]
        streets[s] = streets.get(s, 0) + 1
    top10 = sorted(streets.items(), key=lambda x: -x[1])[:10]
    print("\n=== TOP 10 ulic po liczbie budynków ===")
    for street, count in top10:
        print(f"  {street:<40} {count:>4}")
    print(f"\nŁącznie ulic: {len(streets)}, budynków: {len(features)}")


if __name__ == "__main__":
    t = time.time()
    data = fetch_osm_data()
    geojson = convert_to_geojson(data)
    save_geojson(geojson, OUTPUT_FILE)
    print_stats(geojson)
    print(f"\n✅ Gotowe w {time.time()-t:.0f}s!")
    print(f"Następny krok:")
    print(f"  python -m scripts.import_buildings --file lublin_budynki.geojson")
