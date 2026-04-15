"""Add PostGIS geometry column to buildings with GIST index

Revision ID: 20260416_geom_buildings
Revises: 20260415_osm_cols
Create Date: 2026-04-16

Dodaje natywną kolumnę geometryczną `geom geometry(Geometry, 4326)`
i indeks GIST, co umożliwia wydajne zapytania BBOX przez ST_Intersects
(sequential scan na 51k wierszach zastąpiony index scan ≤ O(log n)).

Dane są przenoszone z istniejących kolumn JSONB:
  - geom_type='polygon' → geojson_polygon → geom (Polygon/MultiPolygon)
  - geom_type='point'   → geojson_point   → geom (Point)

Migracja jest idempotentna: powtórne uruchomienie (np. po rollback)
jest bezpieczne dzięki IF NOT EXISTS.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260416_geom_buildings"
down_revision: Union[str, None] = "20260415_osm_cols"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Upewnij się, że rozszerzenie PostGIS jest aktywne
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    # 1. Dodaj kolumnę geometry
    op.execute("""
        ALTER TABLE buildings
        ADD COLUMN IF NOT EXISTS geom geometry(Geometry, 4326)
    """)

    # 2. Wypełnij geom z geojson_polygon dla budynków-poligonów
    op.execute("""
        UPDATE buildings
        SET geom = ST_SetSRID(
                       ST_GeomFromGeoJSON(geojson_polygon::text),
                       4326
                   )
        WHERE geom_type = 'polygon'
          AND geojson_polygon IS NOT NULL
          AND geom IS NULL
    """)

    # 3. Wypełnij geom z geojson_point dla budynków-punktów
    op.execute("""
        UPDATE buildings
        SET geom = ST_SetSRID(
                       ST_GeomFromGeoJSON(geojson_point::text),
                       4326
                   )
        WHERE geom_type = 'point'
          AND geojson_point IS NOT NULL
          AND geom IS NULL
    """)

    # 4. Utwórz indeks GIST (fundament wydajności BBOX)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_buildings_geom_gist
        ON buildings USING GIST (geom)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_buildings_geom_gist")
    op.execute("ALTER TABLE buildings DROP COLUMN IF EXISTS geom")
