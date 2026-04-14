"""Add OSM source columns to buildings

Revision ID: 20260415_osm_cols
Revises: 1f213e3939ab
Create Date: 2026-04-15

Dodaje kolumny potrzebne do Scenariusza 4 (uzupełnienie braków PZGIK węzłami
OSM): identyfikator way/node z OSM, typ geometrii (polygon | point) oraz
opcjonalną geometrię punktową dla adresów bez poligonu.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "20260415_osm_cols"
down_revision: Union[str, None] = "1f213e3939ab"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "buildings",
        sa.Column("osm_way_id", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "buildings",
        sa.Column("osm_node_id", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "buildings",
        sa.Column(
            "geom_type",
            sa.String(length=10),
            nullable=False,
            server_default="polygon",
        ),
    )
    op.add_column(
        "buildings",
        sa.Column("geojson_point", JSONB(), nullable=True),
    )
    op.create_index(
        "idx_buildings_osm_way_id",
        "buildings",
        ["osm_way_id"],
        unique=False,
    )
    op.create_index(
        "idx_buildings_osm_node_id",
        "buildings",
        ["osm_node_id"],
        unique=False,
    )
    op.create_index(
        "idx_buildings_geom_type",
        "buildings",
        ["geom_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_buildings_geom_type", table_name="buildings")
    op.drop_index("idx_buildings_osm_node_id", table_name="buildings")
    op.drop_index("idx_buildings_osm_way_id", table_name="buildings")
    op.drop_column("buildings", "geojson_point")
    op.drop_column("buildings", "geom_type")
    op.drop_column("buildings", "osm_node_id")
    op.drop_column("buildings", "osm_way_id")
