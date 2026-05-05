"""Testy T3.6 — walidacja deduplikacji adresów subskrybenta (poziom schematu Pydantic).

Weryfikuje reguły w SubscriberCreate.addresses_not_empty:
  - zakaz duplikatu (street_id + house_number) w jednym żądaniu
  - limit max 5 adresów na rejestrację

Testy jednostkowe na schemacie — brak wywołań API, brak zużycia rate-limitu.
"""

import pytest
from pydantic import ValidationError

from app.schemas.subscriber import SubscriberCreate


def _payload(addresses: list[dict], email: str = "test@example.com") -> dict:
    return {
        "email": email,
        "rodo_consent": True,
        "notify_by_email": True,
        "notify_by_sms": False,
        "addresses": addresses,
    }


# ---------------------------------------------------------------------------
# Duplikaty
# ---------------------------------------------------------------------------

def test_duplicate_address_same_street_id_rejected():
    """Dwa adresy z identycznym street_id + house_number → ValidationError."""
    with pytest.raises(ValidationError) as exc_info:
        SubscriberCreate(**_payload([
            {"street_id": 1, "street_name": "Testowa", "house_number": "5"},
            {"street_id": 1, "street_name": "Testowa", "house_number": "5"},
        ]))
    errors = str(exc_info.value)
    assert "duplikat" in errors.lower() or "Duplikat" in errors


def test_duplicate_address_no_street_id_rejected():
    """Dwa adresy bez street_id (None, None) z tym samym house_number → ValidationError.

    Klucz deduplikacji: (street_id, house_number.strip().lower()).
    Dwa adresy z street_id=None i tym samym numerem to duplikat.
    """
    with pytest.raises(ValidationError):
        SubscriberCreate(**_payload([
            {"street_name": "Lipowa", "house_number": "10"},
            {"street_name": "Lipowa", "house_number": "10"},
        ]))


def test_same_number_different_street_id_allowed():
    """Ten sam numer budynku na różnych ulicach (różny street_id) to NIE duplikat."""
    sub = SubscriberCreate(**_payload([
        {"street_id": 1, "street_name": "Lipowa", "house_number": "5"},
        {"street_id": 2, "street_name": "Kwiatowa", "house_number": "5"},
    ]))
    assert len(sub.addresses) == 2


def test_house_number_case_insensitive_dedup():
    """Deduplikacja ignoruje wielkość liter: '5A' i '5a' to duplikat."""
    with pytest.raises(ValidationError):
        SubscriberCreate(**_payload([
            {"street_id": 1, "street_name": "Testowa", "house_number": "5A"},
            {"street_id": 1, "street_name": "Testowa", "house_number": "5a"},
        ]))


# ---------------------------------------------------------------------------
# Limit adresów
# ---------------------------------------------------------------------------

def test_max_5_addresses_limit_enforced():
    """6 unikalnych adresów → ValidationError z komunikatem o limicie 5."""
    addresses = [
        {"street_id": i, "street_name": f"Ulica {i}", "house_number": str(i)}
        for i in range(1, 7)
    ]
    with pytest.raises(ValidationError) as exc_info:
        SubscriberCreate(**_payload(addresses))
    assert "5" in str(exc_info.value)


def test_exactly_5_addresses_passes():
    """Dokładnie 5 unikalnych adresów przechodzi walidację Pydantic."""
    addresses = [
        {"street_id": i, "street_name": f"Ulica {i}", "house_number": str(i)}
        for i in range(1, 6)
    ]
    sub = SubscriberCreate(**_payload(addresses))
    assert len(sub.addresses) == 5


def test_empty_addresses_rejected():
    """Pusta lista adresów → ValidationError."""
    with pytest.raises(ValidationError):
        SubscriberCreate(**_payload([]))
