from datetime import datetime

from sqlalchemy import String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PendingSubscriber(Base):
    __tablename__ = "pending_subscribers"

    id: Mapped[int] = mapped_column(primary_key=True)
    pending_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    verification_code: Mapped[str] = mapped_column(String(6), nullable=False)
    attempts: Mapped[int] = mapped_column(default=0, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(nullable=False)
    subscriber_data: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    def __repr__(self) -> str:
        return f"<PendingSubscriber pending_id={self.pending_id!r}>"
