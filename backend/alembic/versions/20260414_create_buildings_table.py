"""Create buildings table (base columns before OSM additions)

Revision ID: 20260414_create_buildings
Revises: 1f213e3939ab
Create Date: 2026-04-14

Tworzy tabelę buildings z bazowymi kolumnami (przed uzupełnieniem o kolumny OSM).
Kolejne migracje (20260415, 20260416) dodają: osm_way_id, osm_node_id, geom_type,
geojson_point oraz kolumnę geometryczną PostGIS.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "20260414_create_buildings"
down_revision: str | None = "1f213e3939ab"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "buildings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("street_id", sa.Integer(), nullable=True),
        sa.Column("street_name", sa.String(length=200), nullable=True),
        sa.Column("house_number", sa.String(length=20), nullable=True),
        sa.Column("geojson_polygon", JSONB(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_buildings_street_id", "buildings", ["street_id"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_buildings_street_id", table_name="buildings")
    op.drop_table("buildings")
