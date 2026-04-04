"""add unique constraint to subscriber email and phone

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-04-04 10:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c2d3e4f5a6b7"
down_revision: str | None = "b1c2d3e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_unique_constraint("uq_subscribers_email", "subscribers", ["email"])
    op.create_unique_constraint("uq_subscribers_phone", "subscribers", ["phone"])


def downgrade() -> None:
    op.drop_constraint("uq_subscribers_phone", "subscribers", type_="unique")
    op.drop_constraint("uq_subscribers_email", "subscribers", type_="unique")
