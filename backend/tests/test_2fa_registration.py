"""Testy integracyjne T3.6 — przepływ 2FA rejestracji subskrybenta.

Pokrywa:
- happy path: /init → odczyt kodu z DB → /verify → 201, subskrybent utworzony
- blokada błędnego kodu przy /verify → 400
- blokada wygasłego tokenu przy /verify → 410
- blokada duplikatu email przy /init → 409

Uwaga: /init ma rate-limit 3/min. Ten moduł wywołuje /init maksymalnie 2 razy
(testy 1 i 4), więc nie przekroczy limitu.

Sesja DB tworzona inline (nie jako pytest fixture) — unika problemów z
pytest-asyncio session-scoped event loop na Windows.
"""

import json
import secrets
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.models.building import Building
from app.models.pending_subscriber import PendingSubscriber
from app.models.subscriber import Subscriber

INIT_URL = "/api/v1/subscribers/init"
VERIFY_URL = "/api/v1/subscribers/verify"


def _unique_email(tag: str) -> str:
    """Generuje unikalny email testowy — nie trafi do prawdziwej skrzynki (.invalid)."""
    return f"t3.6.{tag}.{secrets.token_hex(4)}@mpwik-test.invalid"


def _make_session():
    """Tworzy silnik i fabrykę sesji do bezpośrednich operacji na DB."""
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return engine, Session


async def _get_real_address():
    """Pobiera pierwszy dostępny (street_id, house_number) z tabeli buildings."""
    engine, Session = _make_session()
    try:
        async with Session() as s:
            result = await s.execute(
                select(Building.street_id, Building.house_number)
                .where(Building.house_number.isnot(None))
                .limit(1)
            )
            row = result.first()
    finally:
        await engine.dispose()
    return row


def _pending_record(email: str, street_id: int, house_number: str, **kwargs) -> PendingSubscriber:
    """Fabryka PendingSubscriber — omija /init i rate-limit."""
    defaults = {
        "verification_code": "123456",
        "attempts": 0,
        "expires_at": datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=24),
    }
    defaults.update(kwargs)
    return PendingSubscriber(
        pending_id=secrets.token_hex(32),
        subscriber_data=json.dumps({
            "phone": None,
            "email": email,
            "rodo_consent": True,
            "night_sms_consent": False,
            "notify_by_email": True,
            "notify_by_sms": False,
            "addresses": [{
                "street_id": street_id,
                "street_name": "TestStreet",
                "house_number": house_number,
                "flat_number": None,
            }],
        }),
        **defaults,
    )


# ---------------------------------------------------------------------------
# T3.6 test 1 — pełny flow 2FA przez API
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_2fa_full_flow_via_api(async_client):
    """init → odczyt kodu z DB → verify → 201, pola subskrybenta poprawne."""
    addr = await _get_real_address()
    if addr is None:
        pytest.skip("Brak budynków w bazie — test integracyjny wymaga danych GIS.")

    email = _unique_email("full")
    payload = {
        "email": email,
        "rodo_consent": True,
        "notify_by_email": True,
        "addresses": [{
            "street_id": addr[0],
            "street_name": "TestStreet",
            "house_number": addr[1],
        }],
    }

    res = await async_client.post(INIT_URL, json=payload)
    assert res.status_code == 200, f"/init failed: {res.status_code} {res.text}"
    pending_id = res.json()["pending_id"]

    # Odczytaj kod bezpośrednio z DB — mock gateway nie zwraca go w odpowiedzi
    engine, Session = _make_session()
    try:
        async with Session() as s:
            row = await s.execute(
                select(PendingSubscriber).where(PendingSubscriber.pending_id == pending_id)
            )
            pending = row.scalar_one()
            code = pending.verification_code
    finally:
        await engine.dispose()

    try:
        res = await async_client.post(
            VERIFY_URL, json={"pending_id": pending_id, "code": code}
        )
        assert res.status_code == 201, f"/verify failed: {res.status_code} {res.text}"
        body = res.json()
        assert body["email"] == email
        assert body["unsubscribe_token"], "Brak unsubscribe_token w odpowiedzi"
        assert len(body["addresses"]) == 1
    finally:
        engine2, Session2 = _make_session()
        try:
            async with Session2() as s:
                sub = (await s.execute(
                    select(Subscriber).where(Subscriber.email == email)
                )).scalar_one_or_none()
                if sub:
                    await s.delete(sub)
                    await s.commit()
        finally:
            await engine2.dispose()


# ---------------------------------------------------------------------------
# T3.6 test 2 — błędny kod → 400 (bez wywołania /init)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_2fa_wrong_code_returns_400(async_client):
    """Weryfikacja błędnym kodem → 400 Bad Request (pending wstawiony bezpośrednio do DB)."""
    addr = await _get_real_address()
    if addr is None:
        pytest.skip("Brak budynków w bazie — test integracyjny wymaga danych GIS.")

    pending = _pending_record(_unique_email("wrongcode"), addr[0], addr[1])

    engine, Session = _make_session()
    try:
        async with Session() as s:
            s.add(pending)
            await s.commit()
        pending_id = pending.pending_id

        res = await async_client.post(
            VERIFY_URL, json={"pending_id": pending_id, "code": "999999"}
        )
        assert res.status_code == 400, (
            f"Oczekiwano 400 dla błędnego kodu, otrzymano {res.status_code}: {res.text}"
        )
        assert "Nieprawidłowy kod" in res.json()["detail"]
    finally:
        async with Session() as s:
            await s.execute(
                delete(PendingSubscriber).where(PendingSubscriber.pending_id == pending_id)
            )
            await s.commit()
        await engine.dispose()


# ---------------------------------------------------------------------------
# T3.6 test 3 — wygasły token → 410 (bez wywołania /init)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_2fa_expired_token_returns_410(async_client):
    """Weryfikacja po TTL → 410 Gone — endpoint usuwa wygasły rekord automatycznie."""
    addr = await _get_real_address()
    if addr is None:
        pytest.skip("Brak budynków w bazie — test integracyjny wymaga danych GIS.")

    pending = _pending_record(
        _unique_email("expired"), addr[0], addr[1],
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1),
    )

    engine, Session = _make_session()
    try:
        async with Session() as s:
            s.add(pending)
            await s.commit()

        # /verify usuwa wygasły pending automatycznie → brak jawnego cleanup
        res = await async_client.post(
            VERIFY_URL,
            json={"pending_id": pending.pending_id, "code": pending.verification_code},
        )
        assert res.status_code == 410, (
            f"Oczekiwano 410 dla wygasłego tokenu, otrzymano {res.status_code}: {res.text}"
        )
    finally:
        await engine.dispose()


# ---------------------------------------------------------------------------
# T3.6 test 4 — duplikat email na /init → 409 (1 wywołanie /init)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_2fa_duplicate_email_on_init_returns_409(async_client):
    """Próba /init z emailem istniejącego subskrybenta → 409 Conflict."""
    addr = await _get_real_address()
    if addr is None:
        pytest.skip("Brak budynków w bazie — test integracyjny wymaga danych GIS.")

    email = _unique_email("dup409")
    sub = Subscriber(
        email=email,
        rodo_consent=True,
        notify_by_email=True,
        notify_by_sms=False,
        night_sms_consent=False,
        unsubscribe_token=secrets.token_hex(32),
    )

    engine, Session = _make_session()
    try:
        async with Session() as s:
            s.add(sub)
            await s.commit()

        payload = {
            "email": email,
            "rodo_consent": True,
            "notify_by_email": True,
            "addresses": [{
                "street_id": addr[0],
                "street_name": "TestStreet",
                "house_number": addr[1],
            }],
        }
        res = await async_client.post(INIT_URL, json=payload)
        assert res.status_code == 409, (
            f"Oczekiwano 409 dla duplikatu email, otrzymano {res.status_code}: {res.text}"
        )
        assert "już zarejestrowany" in res.json()["detail"]
    finally:
        async with Session() as s:
            existing = (await s.execute(
                select(Subscriber).where(Subscriber.email == email)
            )).scalar_one_or_none()
            if existing:
                await s.delete(existing)
                await s.commit()
        await engine.dispose()
