"""Add departments table with seed data

Revision ID: 20260426_departments
Revises: 20260425d_department_fields
Create Date: 2026-04-26

Tworzy tabelę departments i seeduje trzema działami MPWiK Lublin.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260426_departments"
down_revision: str | None = "20260425d_department_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SEED = [
    {"code": "TSK", "name": "Techniczny - Sieć Kanalizacyjna"},
    {"code": "TSW", "name": "Techniczny - Sieć Wodociągowa"},
    {"code": "TP", "name": "Techniczny - Produkcja"},
]


def upgrade() -> None:
    departments = op.create_table(
        "departments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(length=5), nullable=False, unique=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
    )
    op.create_index("ix_departments_code", "departments", ["code"], unique=True)
    op.bulk_insert(departments, _SEED)


def downgrade() -> None:
    op.drop_index("ix_departments_code", table_name="departments")
    op.drop_table("departments")
