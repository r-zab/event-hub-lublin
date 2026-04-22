"""Add indexes to notification_log and unique constraint to subscriber_addresses

Revision ID: 20260422b_indexes_unique
Revises: 20260422_auto_extend_close
Create Date: 2026-04-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260422b_indexes_unique"
down_revision: str | None = "20260422_auto_extend_close"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "idx_notification_log_sent_at",
        "notification_log",
        [sa.text("sent_at DESC")],
    )
    op.create_index(
        "idx_notification_log_status",
        "notification_log",
        ["status"],
    )
    op.create_unique_constraint(
        "uix_subscriber_address",
        "subscriber_addresses",
        ["subscriber_id", "street_id", "house_number"],
    )


def downgrade() -> None:
    op.drop_constraint("uix_subscriber_address", "subscriber_addresses", type_="unique")
    op.drop_index("idx_notification_log_status", table_name="notification_log")
    op.drop_index("idx_notification_log_sent_at", table_name="notification_log")
