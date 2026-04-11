#!/usr/bin/env python3
"""
Spatial Join — poligony budynków + adresy z punktów — Lublin OSM
================================================================
"""

import json
import os
import sys
import time
from pathlib import Path

import requests

try:
    from shapely.geometry import shape, Point
    from shapely.strtree import STRtree
except ImportError:
    print("BŁĄD: Brak biblioteki shapely.")
    print("Zainstaluj: pip install shapely")
    sys.exit(1)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OUTPUT_FILE = str(Path(__file__).parent.parent / "data" / "lublin_budynki_final.geojson")

# ---------------------------------------------------------------------------
# Zapytania Overpass
# ---------------------------------------------------------------------------

# 1. Wszystkie budynki jako poligony (z adresem lub bez)
QUERY_BUILDINGS = """
[out:json][timeout:180];
area["name"="Lublin"]["admin_level"="8"]->.lublin;
way["building"](area.lublin);
out geom;
"""

# 2. Wszystkie punkty z adresem (nodes z addr:street + addr:housenumber)
QUERY_ADDRESSES = """
[out:json][timeout:120];
area["name"="Lublin"]["admin_level"="8"]->.lublin;
node["addr:street"]["addr:housenumber"](area.lublin);
out center;
"""


# ---------------------------------------------------------------------------
# Pobieranie danych z OSM
# ---------------------------------------------------------------------------

def fetch(query: str, label: str) -> list:
    print(f"Pobieranie: {label}...")
    try:
        r = requests.post(
            OVERPASS_URL,
            data={"data": query},
            timeout=240,
            headers={"User-Agent": "EventHubLublin/1.0 (MPWiK projekt PL)"},
        )
        r.raise_for_status()
    except requests.Timeout:
        print(f"BŁĄD: Timeout przy pobieraniu {label}")
        sys.exit(1)
    except requests.RequestException as e:
        print(f"BŁĄD: {e}")
        sys.exit(1)

    elements = r.json().get("elements", [])
    print(f"  → Pobrano {len(elements)} elementów")
    return elements


# ---------------------------------------------------------------------------
# Parsowanie budynków (way -> poligon)
# ---------------------------------------------------------------------------

def parse_buildings(elements: list) -> list[dict]:
    buildings = []
    for el in elements:
        if el.get("type") != "way":
            continue

        geometry = el.get("geometry", [])
        if len(geometry) < 3:
            continue

        coords = [[node["lon"], node["lat"]] for node in geometry]
        if coords[0] != coords[-1]:
            coords.append(coords[0])

        try:
            polygon = shape({"type": "Polygon", "coordinates": [coords]})
        except Exception:
            continue

        if not polygon.is_valid:
            polygon = polygon.buffer(0)

        tags = el.get("tags", {})
        centroid = polygon.centroid

        buildings.append({
            "osm_id": el.get("id"),
            "polygon": polygon,
            "coords": coords,
            "centroid_lat": round(centroid.y, 7),
            "centroid_lon": round(centroid.x, 7),
            "street": tags.get("addr:street", ""),
            "house_number": tags.get("addr:housenumber", ""),
            "postcode": tags.get("addr:postcode", ""),
            "city": tags.get("addr:city", "Lublin") or "Lublin",
            "building": tags.get("building", "yes"),
            "name": tags.get("name", ""),
        })

    print(f"  → Sparsowano {len(buildings)} poligonów budynków")
    return buildings


# ---------------------------------------------------------------------------
# Parsowanie punktów adresowych (node)
# ---------------------------------------------------------------------------

def parse_address_nodes(elements: list) -> list[dict]:
    nodes = []
    for el in elements:
        if el.get("type") != "node":
            continue

        tags = el.get("tags", {})
        street = tags.get("addr:street", "").strip()
        house_number = tags.get("addr:housenumber", "").strip()

        if not street or not house_number:
            continue

        # W 'out center;' koordynaty mogą być bezpośrednio w lat/lon
        lat = el.get("lat")
        lon = el.get("lon")

        if lat is None or lon is None:
            continue

        nodes.append({
            "osm_id": el.get("id"),
            "point": Point(lon, lat),
            "lat": lat,
            "lon": lon,
            "street": street,
            "house_number": house_number,
            "postcode": tags.get("addr:postcode", ""),
            "city": tags.get("addr:city", "Lublin") or "Lublin",
        })

    print(f"  → Sparsowano {len(nodes)} punktów adresowych")
    return nodes


# ---------------------------------------------------------------------------
# Spatial Join — serce algorytmu
# ---------------------------------------------------------------------------

def spatial_join(buildings: list[dict], address_nodes: list[dict]) -> list[dict]:
    print("\nBudowanie indeksu przestrzennego (STRtree)...")
    polygons = [b["polygon"] for b in buildings]
    tree = STRtree(polygons)

    matched = 0
    already_had_address = 0

    print(f"Dopasowywanie {len(address_nodes)} punktów do {len(buildings)} poligonów...")
    t = time.time()

    for i, node in enumerate(address_nodes):
        if i % 5000 == 0 and i > 0:
            elapsed = time.time() - t
            print(f"  Postęp: {i}/{len(address_nodes)} ({elapsed:.0f}s)")

        point = node["point"]
        candidate_indices = tree.query(point)

        for idx in candidate_indices:
            building = buildings[idx]
            if building["polygon"].contains(point):
                if not building["street"]:
                    building["street"] = node["street"]
                    building["house_number"] = node["house_number"]
                    if not building["postcode"]:
                        building["postcode"] = node["postcode"]
                    if not building["city"] or building["city"] == "Lublin":
                        building["city"] = node["city"]
                    matched += 1
                else:
                    already_had_address += 1
                break

    elapsed = time.time() - t
    print(f"\nSpatial join zakończony w {elapsed:.1f}s:")
    print(f"  Budynki bez adresu → uzupełniono z punktów:  {matched}")
    print(f"  Budynki które już miały adres (nie zmienione): {already_had_address}")

    return buildings


# ---------------------------------------------------------------------------
# Budowanie GeoJSON
# ---------------------------------------------------------------------------

def build_geojson(buildings: list[dict]) -> dict:
    features_with_address = []
    features_without_address = []

    for b in buildings:
        street = b["street"].strip()
        house_number = b["house_number"].strip()

        if street and house_number:
            city = b["city"] or "Lublin"
            full_address = f"ul. {street} {house_number}, {city}"

            features_with_address.append({
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [b["coords"]],
                },
                "properties": {
                    "osm_id": b["osm_id"],
                    "street": street,
                    "house_number": house_number,
                    "postcode": b["postcode"],
                    "city": city,
                    "full_address": full_address,
                    "building": b["building"],
                    "name": b["name"],
                    "center_lat": b["centroid_lat"],
                    "center_lon": b["centroid_lon"],
                },
            })
        else:
            features_without_address.append(b["osm_id"])

    print(f"\nWynik:")
    print(f"  Budynki z adresem (do GeoJSON):    {len(features_with_address)}")
    print(f"  Budynki bez adresu (pominięte):    {len(features_without_address)}")

    return {
        "type": "FeatureCollection",
        "features": features_with_address,
        "metadata": {
            "source": "OpenStreetMap contributors (ODbL)",
            "method": "spatial_join(buildings + address_nodes)",
            "city": "Lublin",
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "total_features": len(features_with_address),
        },
    }


# ---------------------------------------------------------------------------
# Zapis
# ---------------------------------------------------------------------------

def save(geojson: dict, path: str) -> None:
    print(f"\nZapisywanie do {path}...")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(",", ":"))
    size_mb = os.path.getsize(path) / 1_000_000
    print(f"Zapisano: {size_mb:.1f} MB, {geojson['metadata']['total_features']} budynków z adresem")


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


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    t_start = time.time()

    print("=" * 60)
    print("Spatial Join — budynki + adresy — Lublin OSM")
    print("=" * 60)

    raw_buildings = fetch(QUERY_BUILDINGS, "poligony budynków (way[building])")
    buildings = parse_buildings(raw_buildings)
    del raw_buildings

    raw_nodes = fetch(QUERY_ADDRESSES, "punkty adresowe (node[addr:street])")
    address_nodes = parse_address_nodes(raw_nodes)
    del raw_nodes

    buildings = spatial_join(buildings, address_nodes)

    geojson = build_geojson(buildings)
    save(geojson, OUTPUT_FILE)
    print_stats(geojson)

    print(f"\n✅ Gotowe w {time.time() - t_start:.0f}s!")
    print(f"Plik: {OUTPUT_FILE}")
    print("\nNastępny krok:")
    print("  python -m scripts.import_buildings --file lublin_budynki_final.geojson")