"""
SMS i Email gateways — abstrakcje kanałów powiadomień.

MockSMSGateway: loguje wysyłkę (środowisko dev).
EmailSender: aiosmtplib lub mock gdy SMTP niezskonfigurowany.
"""

import logging
from abc import ABC, abstractmethod

import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# SMS
# ---------------------------------------------------------------------------


class SMSGateway(ABC):
    """Abstrakcyjny interfejs bramki SMS."""

    @abstractmethod
    async def send(self, phone: str, message: str) -> bool:
        """Wyślij SMS. Zwraca True przy sukcesie, False przy błędzie."""


class MockSMSGateway(SMSGateway):
    """Mock bramki SMS — loguje wysyłkę, nie wysyła niczego przez sieć."""

    async def send(self, phone: str, message: str) -> bool:
        """Symuluj wysyłkę SMS — loguj do konsoli."""
        logger.info("[MOCK SMS] -> %s: %s", phone, message)
        return True


def get_sms_gateway() -> SMSGateway:
    """Fabryka bramki SMS — wybór wg SMS_GATEWAY_TYPE z config."""
    gateway_type = settings.SMS_GATEWAY_TYPE.lower()
    if gateway_type == "mock":
        return MockSMSGateway()
    # Rozszerzalne: elif gateway_type == "mpwik": return MPWiKSMSGateway()
    logger.warning("Nieznany SMS_GATEWAY_TYPE=%r, używam Mock", gateway_type)
    return MockSMSGateway()


# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------


class EmailSender:
    """Asynchroniczna wysyłka email przez aiosmtplib."""

    def __init__(self) -> None:
        self._mock_mode = not settings.SMTP_USER or settings.SMTP_HOST in ("localhost", "")

    async def send(self, recipient: str, subject: str, body: str) -> bool:
        """Wyślij email. W trybie mock — loguje zamiast wysyłać."""
        if self._mock_mode:
            logger.info("[MOCK EMAIL] -> %s | %s | %s", recipient, subject, body[:80])
            return True

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_FROM
        msg["To"] = recipient
        msg.attach(MIMEText(body, "plain", "utf-8"))

        try:
            await aiosmtplib.send(
                msg,
                hostname=settings.SMTP_HOST,
                port=settings.SMTP_PORT,
                username=settings.SMTP_USER or None,
                password=settings.SMTP_PASSWORD or None,
                use_tls=settings.SMTP_USE_TLS,
            )
            logger.info("Email wysłany -> %s", recipient)
            return True
        except Exception as exc:
            logger.error("Błąd wysyłki email -> %s: %s", recipient, exc)
            return False
