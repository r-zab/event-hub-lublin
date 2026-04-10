"""notification_log event_id FK: add ON DELETE SET NULL

Revision ID: 20260410_notif_fk
Revises: 20260410_timestamp_with_timezone
Create Date: 2026-04-10
"""

from alembic import op

revision = "20260410_notif_fk"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the old FK (no ondelete) and re-create with ON DELETE SET NULL
    op.drop_constraint(
        "notification_log_event_id_fkey",
        "notification_log",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "notification_log_event_id_fkey",
        "notification_log",
        "events",
        ["event_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "notification_log_event_id_fkey",
        "notification_log",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "notification_log_event_id_fkey",
        "notification_log",
        "events",
        ["event_id"],
        ["id"],
    )
