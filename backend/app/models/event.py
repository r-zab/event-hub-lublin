from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.notification import NotificationLog
    from app.models.street import Street
    from app.models.user import User


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    source: Mapped[str] = mapped_column(String(50), server_default="mpwik")
    street_id: Mapped[int | None] = mapped_column(ForeignKey("streets.id"))
    street_name: Mapped[str] = mapped_column(String(200), nullable=False)
    house_number_from: Mapped[str | None] = mapped_column(String(10))
    house_number_to: Mapped[str | None] = mapped_column(String(10))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), server_default="zgloszona")
    start_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    estimated_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    geojson_segment: Mapped[dict | None] = mapped_column(JSONB)
    custom_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    auto_extend: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    auto_close: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_by_department: Mapped[str | None] = mapped_column(String(3))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    street: Mapped["Street | None"] = relationship("Street", back_populates="events")
    creator: Mapped["User | None"] = relationship("User", back_populates="events")
    history: Mapped[list["EventHistory"]] = relationship(
        "EventHistory", back_populates="event", cascade="all, delete-orphan"
    )
    notifications: Mapped[list["NotificationLog"]] = relationship(
        "NotificationLog", back_populates="event", passive_deletes=True
    )

    __table_args__ = (
        Index("idx_events_status", "status"),
        Index("idx_events_source", "source"),
        Index("idx_events_street", "street_id"),
        Index("idx_events_created", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<Event id={self.id} type={self.event_type!r} status={self.status!r} street={self.street_name!r}>"


class EventHistory(Base):
    __tablename__ = "event_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    old_status: Mapped[str | None] = mapped_column(String(30))
    new_status: Mapped[str | None] = mapped_column(String(30))
    changed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    note: Mapped[str | None] = mapped_column(Text)

    event: Mapped["Event"] = relationship("Event", back_populates="history")
    changed_by_user: Mapped["User | None"] = relationship("User", back_populates="event_history")

    def __repr__(self) -> str:
        return f"<EventHistory id={self.id} event_id={self.event_id} {self.old_status!r} -> {self.new_status!r}>"
