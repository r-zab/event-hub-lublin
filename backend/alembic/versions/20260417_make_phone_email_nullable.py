"""Make subscriber phone and email nullable with partial unique indexes

Revision ID: 20260417_nullable_phone_email
Revises: 20260416_geom_buildings
Create Date: 2026-04-17

Umożliwia rejestrację subskrybentów z tylko jednym kanałem komunikacji
(SMS bez e-mail lub e-mail bez telefonu). NULL nie koliduje z unikatem
dzięki partial unique index z warunkiem WHERE column IS NOT NULL.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260417_nullable_phone_email"
down_revision: str | None = "20260416_geom_buildings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Usuń stare unique constraints (zastąpimy partial index-ami)
    op.drop_constraint("uq_subscribers_email", "subscribers", type_="unique")
    op.drop_constraint("uq_subscribers_phone", "subscribers", type_="unique")

    # Zezwól na NULL w obu kolumnach
    op.alter_column("subscribers", "phone", nullable=True, existing_type=sa.String(20))
    op.alter_column("subscribers", "email", nullable=True, existing_type=sa.String(100))

    # Partial unique indexes — NULL nie koliduje z unikatem
    op.execute(
        "CREATE UNIQUE INDEX uq_subscribers_phone_notnull "
        "ON subscribers (phone) WHERE phone IS NOT NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_subscribers_email_notnull "
        "ON subscribers (email) WHERE email IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_subscribers_phone_notnull")
    op.execute("DROP INDEX IF EXISTS uq_subscribers_email_notnull")

    op.alter_column("subscribers", "phone", nullable=False, existing_type=sa.String(20))
    op.alter_column("subscribers", "email", nullable=False, existing_type=sa.String(100))

    op.create_unique_constraint("uq_subscribers_email", "subscribers", ["email"])
    op.create_unique_constraint("uq_subscribers_phone", "subscribers", ["phone"])
