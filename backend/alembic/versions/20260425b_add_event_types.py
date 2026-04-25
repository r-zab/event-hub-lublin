"""Add event_types dictionary table + seed + FK on events.event_type

Revision ID: 20260425b_event_types
Revises: 20260425_street_audit_log
Create Date: 2026-04-25

T2.1: Słownik typów zdarzeń konfigurowalny przez admina (zamiast hardkodowanych stringów).
- Tworzy tabelę event_types
- Seeduje 3 obecne typy (awaria, planowane_wylaczenie, remont) z aktualnymi kolorami
- Dodaje FK z events.event_type → event_types.code (referential integrity)
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260425b_event_types"
down_revision: str | None = "20260425_street_audit_log"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "event_types",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=30), nullable=False),
        sa.Column("name_pl", sa.String(length=100), nullable=False),
        sa.Column("default_color_rgb", sa.String(length=7), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index(
        op.f("ix_event_types_code"),
        "event_types",
        ["code"],
        unique=False,
    )

    # Seed: 3 obecne typy z kolorami zgodnymi z TYPE_COLORS w EventMap.tsx
    op.execute(
        sa.text(
            "INSERT INTO event_types (code, name_pl, default_color_rgb, is_active, sort_order) VALUES "
            "('awaria', 'Awaria', '#DC2626', true, 1), "
            "('planowane_wylaczenie', 'Planowane wyłączenie', '#2563EB', true, 2), "
            "('remont', 'Remont', '#D97706', true, 3)"
        )
    )

    # FK z events.event_type → event_types.code (po seedzie, żeby istniejące rekordy nie naruszały integralności)
    op.create_foreign_key(
        "fk_events_event_type_event_types",
        source_table="events",
        referent_table="event_types",
        local_cols=["event_type"],
        remote_cols=["code"],
        ondelete="RESTRICT",
        onupdate="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("fk_events_event_type_event_types", "events", type_="foreignkey")
    op.drop_index(op.f("ix_event_types_code"), table_name="event_types")
    op.drop_table("event_types")
