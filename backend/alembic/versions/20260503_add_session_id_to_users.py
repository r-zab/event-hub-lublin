"""Add session_id column to users table

Revision ID: 20260503_add_session_id_users
Revises: 20260426b_expand_dept_cols
Create Date: 2026-05-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260503_add_session_id_users"
down_revision: str | None = "20260426b_expand_dept_cols"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("session_id", sa.String(length=36), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "session_id")
