"""Retroaktywne maskowanie danych osobowych w notification_log (RODO)

Revision ID: 20260421_mask_notif_recipients
Revises: 20260420_custom_message_events
Create Date: 2026-04-21

Maskuje pole `recipient` we wszystkich istniejących rekordach:
- E-mail: m***k@lublin.eu
- Telefon: +48 123 *** 89
Operacja nieodwracalna (downgrade jest no-op).
"""

import sqlalchemy as sa
from alembic import op

revision: str = "20260421_mask_notif_recipients"
down_revision: str = "20260420_custom_message_events"
branch_labels = None
depends_on = None


def _mask_recipient(recipient: str) -> str:
    if not recipient:
        return recipient
    if "@" in recipient:
        local, _, domain = recipient.partition("@")
        if len(local) <= 2:
            return f"***@{domain}"
        return f"{local[0]}***{local[-1]}@{domain}"
    r = recipient.strip()
    if len(r) <= 5:
        return "***"
    keep_start = min(7, len(r) - 2)
    return f"{r[:keep_start]} *** {r[-2:]}"


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text("SELECT id, recipient FROM notification_log")
    ).fetchall()

    updates = [
        {"masked": _mask_recipient(recipient), "row_id": row_id}
        for row_id, recipient in rows
        if _mask_recipient(recipient) != recipient
    ]

    if updates:
        bind.execute(
            sa.text("UPDATE notification_log SET recipient = :masked WHERE id = :row_id"),
            updates,
        )


def downgrade() -> None:
    # Nieodwracalne — oryginalne dane osobowe nie mogą być przywrócone
    pass
