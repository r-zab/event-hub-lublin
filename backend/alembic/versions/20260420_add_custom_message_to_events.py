"""Add custom_message column to events

Revision ID: 20260420_custom_message_events
Revises: 20260418_building_audit_log
Create Date: 2026-04-20

Kolumna custom_message (Text, nullable) umożliwia dyspozytorowi nadpisanie
automatycznie generowanego szablonu SMS/e-mail własną treścią powiadomienia.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260420_custom_message_events"
down_revision: str | None = "20260418_building_audit_log"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("events", sa.Column("custom_message", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("events", "custom_message")
