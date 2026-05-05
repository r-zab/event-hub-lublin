"""Add icon_key column to event_types + seed default icons

Revision ID: 20260505_et_icon_key
Revises: 20260503_add_session_id_users
Create Date: 2026-05-05

T2.12: Biblioteka ikon dla typów zdarzeń.
- Dodaje icon_key VARCHAR(50) NULL z DEFAULT 'alert_triangle'
- Aktualizuje 3 seed-owe typy przypisując odpowiednie ikony
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260505_et_icon_key"
down_revision: str | None = "20260503_add_session_id_users"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "event_types",
        sa.Column("icon_key", sa.String(length=50), nullable=True, server_default="alert_triangle"),
    )
    # Ustaw domyślne ikony dla 3 seed-owych typów
    op.execute(
        sa.text("UPDATE event_types SET icon_key = 'alert_triangle' WHERE code = 'awaria'")
    )
    op.execute(
        sa.text("UPDATE event_types SET icon_key = 'calendar_clock' WHERE code = 'planowane_wylaczenie'")
    )
    op.execute(
        sa.text("UPDATE event_types SET icon_key = 'hard_hat' WHERE code = 'remont'")
    )


def downgrade() -> None:
    op.drop_column("event_types", "icon_key")
