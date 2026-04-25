"""Add department to users and created_by_department to events

Revision ID: 20260425d_department_fields
Revises: 20260425c_message_templates
Create Date: 2026-04-25

T2.5: Pole department (VARCHAR 3) na users; created_by_department (VARCHAR 3) na events.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260425d_department_fields"
down_revision: str | None = "20260425c_message_templates"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("department", sa.String(length=3), nullable=True))
    op.add_column("events", sa.Column("created_by_department", sa.String(length=3), nullable=True))


def downgrade() -> None:
    op.drop_column("events", "created_by_department")
    op.drop_column("users", "department")
