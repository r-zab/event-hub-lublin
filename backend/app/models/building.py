"""Model SQLAlchemy dla tabeli buildings (obrysy budynków z OSM/BDOT)."""

from sqlalchemy import BigInteger, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Building(Base):
    __tablename__ = "buildings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    street_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    street_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    house_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    geojson_polygon: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    geojson_point: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    geom_type: Mapped[str] = mapped_column(String(10), default="polygon", server_default="polygon")
    osm_way_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    osm_node_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    __table_args__ = (
        Index("idx_buildings_street_id", "street_id"),
        Index("idx_buildings_osm_way_id", "osm_way_id"),
        Index("idx_buildings_osm_node_id", "osm_node_id"),
        Index("idx_buildings_geom_type", "geom_type"),
    )

    def __repr__(self) -> str:
        return f"<Building id={self.id} street_id={self.street_id} house_number={self.house_number!r}>"
