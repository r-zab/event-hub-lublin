"""Expand department column VARCHAR(3) -> VARCHAR(5) on users and events

Revision ID: 20260426b_expand_dept_cols
Revises: 20260426_departments
Create Date: 2026-04-26

Dopasowuje długość kolumn department do nowego modelu Department.code (VARCHAR 5).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260426b_expand_dept_cols"
down_revision: str | None = "20260426_departments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("users", "department", type_=sa.String(length=5), existing_nullable=True)
    op.alter_column("events", "created_by_department", type_=sa.String(length=5), existing_nullable=True)


def downgrade() -> None:
    op.alter_column("events", "created_by_department", type_=sa.String(length=3), existing_nullable=True)
    op.alter_column("users", "department", type_=sa.String(length=3), existing_nullable=True)
