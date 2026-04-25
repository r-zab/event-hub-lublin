"""Add message_templates dictionary table

Revision ID: 20260425c_message_templates
Revises: 20260425b_event_types
Create Date: 2026-04-25

T2.2: Słownik szablonów komunikatów do pola opisu zdarzenia (np. "woda niezdatna do picia").
- Tworzy tabelę message_templates
- Każdy szablon może być powiązany z konkretnym typem zdarzenia (event_type_id) lub być uniwersalny (NULL)
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260425c_message_templates"
down_revision: str | None = "20260425b_event_types"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "message_templates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("event_type_id", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["event_type_id"], ["event_types.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index(
        op.f("ix_message_templates_event_type_id"),
        "message_templates",
        ["event_type_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_message_templates_event_type_id"), table_name="message_templates")
    op.drop_table("message_templates")
