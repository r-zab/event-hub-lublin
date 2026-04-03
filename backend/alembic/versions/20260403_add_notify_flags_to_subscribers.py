"""add notify_by_email and notify_by_sms to subscribers

Revision ID: b1c2d3e4f5a6
Revises: 937cb6bd3ab4
Create Date: 2026-04-03 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b1c2d3e4f5a6"
down_revision: str | None = "937cb6bd3ab4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "subscribers",
        sa.Column("notify_by_email", sa.Boolean(), server_default="true", nullable=False),
    )
    op.add_column(
        "subscribers",
        sa.Column("notify_by_sms", sa.Boolean(), server_default="true", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("subscribers", "notify_by_sms")
    op.drop_column("subscribers", "notify_by_email")
