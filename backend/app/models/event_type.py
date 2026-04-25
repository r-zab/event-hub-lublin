"""Słownik typów zdarzeń (T2.1) — konfigurowalna lista zamiast hardkodowanych stringów."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EventType(Base):
    __tablename__ = "event_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, index=True)
    name_pl: Mapped[str] = mapped_column(String(100), nullable=False)
    default_color_rgb: Mapped[str] = mapped_column(String(7), nullable=False)  # #RRGGBB
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true", nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<EventType id={self.id} code={self.code!r} name={self.name_pl!r}>"
