from sqlalchemy import Boolean, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING

from app.database import Base

if TYPE_CHECKING:
    from app.models.event import Event, EventHistory


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(20), server_default="dispatcher")
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")
    created_at: Mapped[func.now] = mapped_column(server_default=func.now())

    events: Mapped[list["Event"]] = relationship("Event", back_populates="creator")
    event_history: Mapped[list["EventHistory"]] = relationship("EventHistory", back_populates="changed_by_user")

    def __repr__(self) -> str:
        return f"<User id={self.id} username={self.username!r} role={self.role!r}>"
