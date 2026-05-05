"""Placeholder — session_id already added in 20260502_add_session_id

Revision ID: 20260503_add_session_id_users
Revises: 20260502_add_session_id
Create Date: 2026-05-03
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260503_add_session_id_users"
down_revision: str | None = "20260502_add_session_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
