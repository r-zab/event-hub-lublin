"""Add pending_subscribers table for 2FA registration

Revision ID: 20260424_pending_subscribers
Revises: 20260422b_indexes_unique
Create Date: 2026-04-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260424_pending_subscribers"
down_revision: str | None = "20260422b_indexes_unique"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "pending_subscribers",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("pending_id", sa.String(64), nullable=False, unique=True),
        sa.Column("verification_code", sa.String(6), nullable=False),
        sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=False), nullable=False),
        sa.Column("subscriber_data", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.text("now()")),
    )
    op.create_index("idx_pending_subscribers_pending_id", "pending_subscribers", ["pending_id"])
    op.create_index("idx_pending_subscribers_expires_at", "pending_subscribers", ["expires_at"])


def downgrade() -> None:
    op.drop_index("idx_pending_subscribers_expires_at", table_name="pending_subscribers")
    op.drop_index("idx_pending_subscribers_pending_id", table_name="pending_subscribers")
    op.drop_table("pending_subscribers")
