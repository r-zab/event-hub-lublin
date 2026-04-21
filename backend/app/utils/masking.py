"""Narzędzia do maskowania danych osobowych i wrażliwych wartości w logach (RODO)."""

import re

# Token RODO to ciąg dokładnie 64 znaków hex (unsubscribe_token z tabeli subscribers)
_HEX64_RE = re.compile(r'\b[0-9a-fA-F]{64}\b')


def mask_recipient(recipient: str) -> str:
    """Zamaskuj dane osobowe odbiorcy przed zapisem do logów / notification_log.

    - E-mail: m***k@lublin.eu (pierwsza + ostatnia litera local-part, pełna domena)
    - Telefon: +48 123 *** 89 (pierwsze 7 znaków + ostatnie 2)
    """
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


def mask_token(text: str) -> str:
    """Zamaskuj tokeny RODO (64-znakowe ciągi hex) w treści wiadomości.

    Zostawia pierwsze 6 znaków, resztę zastępuje '...' (np. '1a8e29...').
    """
    return _HEX64_RE.sub(lambda m: m.group()[:6] + "...", text)
