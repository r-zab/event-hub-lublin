from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.notification import NotificationLog
    from app.models.street import Street


class Subscriber(Base):
    __tablename__ = "subscribers"

    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    email: Mapped[str] = mapped_column(String(100), nullable=False)
    rodo_consent: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    night_sms_consent: Mapped[bool] = mapped_column(Boolean, server_default="false")
    unsubscribe_token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    addresses: Mapped[list["SubscriberAddress"]] = relationship(
        "SubscriberAddress", back_populates="subscriber", cascade="all, delete-orphan"
    )
    notifications: Mapped[list["NotificationLog"]] = relationship("NotificationLog", back_populates="subscriber")

    def __repr__(self) -> str:
        return f"<Subscriber id={self.id} email={self.email!r}>"


class SubscriberAddress(Base):
    __tablename__ = "subscriber_addresses"

    id: Mapped[int] = mapped_column(primary_key=True)
    subscriber_id: Mapped[int] = mapped_column(
        ForeignKey("subscribers.id", ondelete="CASCADE"), nullable=False
    )
    street_id: Mapped[int | None] = mapped_column(ForeignKey("streets.id"))
    street_name: Mapped[str] = mapped_column(String(200), nullable=False)
    house_number: Mapped[str] = mapped_column(String(10), nullable=False)
    flat_number: Mapped[str | None] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    subscriber: Mapped["Subscriber"] = relationship("Subscriber", back_populates="addresses")
    street: Mapped["Street | None"] = relationship("Street", back_populates="addresses")

    __table_args__ = (
        Index("idx_subscriber_addresses_street", "street_id"),
    )

    def __repr__(self) -> str:
        return f"<SubscriberAddress id={self.id} subscriber_id={self.subscriber_id} street={self.street_name!r} nr={self.house_number!r}>"
