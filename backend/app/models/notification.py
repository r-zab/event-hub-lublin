from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.event import Event
    from app.models.subscriber import Subscriber


class NotificationLog(Base):
    __tablename__ = "notification_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int | None] = mapped_column(ForeignKey("events.id", ondelete="SET NULL"))
    subscriber_id: Mapped[int | None] = mapped_column(ForeignKey("subscribers.id", ondelete="SET NULL"))
    channel: Mapped[str] = mapped_column(String(10), nullable=False)
    recipient: Mapped[str] = mapped_column(String(100), nullable=False)
    message_text: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), server_default="sent")
    sent_at: Mapped[datetime] = mapped_column(server_default=func.now())
    error_message: Mapped[str | None] = mapped_column(Text)

    event: Mapped["Event | None"] = relationship("Event", back_populates="notifications")
    subscriber: Mapped["Subscriber | None"] = relationship("Subscriber", back_populates="notifications")

    __table_args__ = (
        Index("idx_notification_log_sent_at", text("sent_at DESC")),
        Index("idx_notification_log_status", "status"),
    )

    def __repr__(self) -> str:
        return f"<NotificationLog id={self.id} channel={self.channel!r} recipient={self.recipient!r} status={self.status!r}>"
