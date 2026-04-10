"""Convert TIMESTAMP columns to TIMESTAMP WITH TIME ZONE

⚠️  NIE URUCHAMIAJ tej migracji bez przeczytania komentarza poniżej.

Strategia:
- Dane w bazie są przechowywane jako UTC (PostgreSQL TIMESTAMP bez strefy).
- Ta migracja zmienia typ na TIMESTAMP WITH TIME ZONE (TIMESTAMPTZ).
- PostgreSQL automatycznie interpretuje istniejące wartości jako UTC i przechowuje je
  jako UTC w nowym typie — dane NIE zostaną zmienione, tylko typ kolumny.
- Po migracji narzędzia (DBeaver, psql) będą wyświetlać czas z podaną strefą UTC (+00:00).
- Backend (SQLAlchemy naive datetime) nadal działa poprawnie — Pydantic field_serializer
  dodaje timezone.utc do naive datetime przed serializacją do JSON.

Aby uruchomić:
    cd backend
    python -m alembic upgrade head

Revision ID: d4e5f6a7b8c9
Revises: add_unique_to_subscriber_email_phone (20260404)
Create Date: 2026-04-10
"""

from alembic import op
import sqlalchemy as sa

revision = "d4e5f6a7b8c9"
down_revision = "c2d3e4f5a6b7"
branch_labels = None
depends_on = None

# Kolumny do konwersji: (tabela, kolumna)
_TIMESTAMP_COLUMNS = [
    ("users", "created_at"),
    ("streets", ),  # brak timestampów
    ("events", "created_at"),
    ("events", "updated_at"),
    ("events", "estimated_end"),
    ("event_history", "changed_at"),
    ("subscribers", "created_at"),
    ("subscriber_addresses", "created_at"),
    ("notification_log", "sent_at"),
    ("api_keys", "created_at"),
]

_TIMESTAMPTZ = sa.TIMESTAMP(timezone=True)
_TIMESTAMP = sa.TIMESTAMP(timezone=False)


def upgrade() -> None:
    for table, column in [
        ("users", "created_at"),
        ("events", "created_at"),
        ("events", "updated_at"),
        ("events", "estimated_end"),
        ("event_history", "changed_at"),
        ("subscribers", "created_at"),
        ("subscriber_addresses", "created_at"),
        ("notification_log", "sent_at"),
        ("api_keys", "created_at"),
    ]:
        op.alter_column(
            table,
            column,
            type_=_TIMESTAMPTZ,
            postgresql_using=f"{column} AT TIME ZONE 'UTC'",
            existing_nullable=(column == "estimated_end"),
        )


def downgrade() -> None:
    for table, column in [
        ("users", "created_at"),
        ("events", "created_at"),
        ("events", "updated_at"),
        ("events", "estimated_end"),
        ("event_history", "changed_at"),
        ("subscribers", "created_at"),
        ("subscriber_addresses", "created_at"),
        ("notification_log", "sent_at"),
        ("api_keys", "created_at"),
    ]:
        op.alter_column(
            table,
            column,
            type_=_TIMESTAMP,
            postgresql_using=f"{column} AT TIME ZONE 'UTC'",
            existing_nullable=(column == "estimated_end"),
        )
