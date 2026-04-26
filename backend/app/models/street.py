from sqlalchemy import Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING

from app.database import Base

if TYPE_CHECKING:
    from app.models.event import Event
    from app.models.subscriber import SubscriberAddress


class Street(Base):
    __tablename__ = "streets"

    id: Mapped[int] = mapped_column(primary_key=True)
    teryt_sym_ul: Mapped[str | None] = mapped_column(String(10), unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    full_name: Mapped[str] = mapped_column(String(250), nullable=False)
    street_type: Mapped[str | None] = mapped_column(String(20))
    city: Mapped[str] = mapped_column(String(50), server_default="Lublin")
    geojson: Mapped[dict | None] = mapped_column(JSONB)

    events: Mapped[list["Event"]] = relationship("Event", back_populates="street")
    addresses: Mapped[list["SubscriberAddress"]] = relationship("SubscriberAddress", back_populates="street")

    __table_args__ = (
        Index("idx_streets_name", "name"),
        # idx_streets_fullname_trgm jest tworzony przez migrację Alembic (wymaga pg_trgm extension)
    )

    def __repr__(self) -> str:
        return f"<Street id={self.id} full_name={self.full_name!r}>"
