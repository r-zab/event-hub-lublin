"""Add street_audit_log table

Revision ID: 20260425_street_audit_log
Revises: 20260424_pending_subscribers
Create Date: 2026-04-25

Tabela audytowa rejestrująca operacje dodawania i edycji ulic przez dyspozytorów/adminów.
Przechowuje: user_id, street_id, akcję (create/update), stare i nowe dane JSON oraz timestamp.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260425_street_audit_log"
down_revision: str | None = "20260424_pending_subscribers"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "street_audit_log",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("street_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=10), nullable=False),
        sa.Column("old_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("new_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_street_audit_log_street_id"),
        "street_audit_log",
        ["street_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_street_audit_log_user_id"),
        "street_audit_log",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_street_audit_log_user_id"), table_name="street_audit_log")
    op.drop_index(op.f("ix_street_audit_log_street_id"), table_name="street_audit_log")
    op.drop_table("street_audit_log")
