"""Add start_time to events

Revision ID: 1f213e3939ab
Revises: 20260410_notif_fk
Create Date: 2026-04-13 00:52:35.606236

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '1f213e3939ab'
down_revision: Union[str, None] = '20260410_notif_fk'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'events',
        sa.Column('start_time', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('events', 'start_time')
