"""Add auto_extend and auto_close flags to events

Revision ID: 20260422_auto_extend_close
Revises: 20260421_mask_notif_recipients
Create Date: 2026-04-22

auto_extend (bool, default False) — APScheduler przedłuża estimated_end o +1h gdy czas minie.
auto_close  (bool, default False) — APScheduler zmienia status na 'usunieta' gdy czas minie.
Obie flagi wzajemnie się wykluczają (walidacja po stronie frontendu).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260422_auto_extend_close"
down_revision: str | None = "20260421_mask_notif_recipients"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column("auto_extend", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "events",
        sa.Column("auto_close", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("events", "auto_close")
    op.drop_column("events", "auto_extend")
