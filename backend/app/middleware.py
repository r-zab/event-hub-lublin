"""Custom middleware — Trusted Proxy (T1.4).

Zastępuje uvicorn.middleware.proxy_headers.ProxyHeadersMiddleware,
która w uvicorn 0.30 ma bug powodujący przetwarzanie X-Forwarded-For
niezależnie od wartości trusted_hosts przy określonych konfiguracjach.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)


class TrustedProxyMiddleware:
    """Przepisuje scope['client'] na realny IP z X-Forwarded-For
    TYLKO gdy łączący host jest na liście TRUSTED_PROXIES.
    Gdy host nie jest zaufany — nagłówek jest ignorowany (Zero Trust).
    """

    def __init__(self, app: Any, trusted_hosts: list[str]) -> None:
        self.app = app
        self.trusted_hosts = frozenset(h.strip() for h in trusted_hosts if h.strip())
        self.always_trust = "*" in self.trusted_hosts
        logger.info(
            "TrustedProxyMiddleware: trusted=%s always_trust=%s",
            self.trusted_hosts,
            self.always_trust,
        )

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] in ("http", "websocket"):
            client = scope.get("client")
            client_host = client[0] if client else None
            trusted = self.always_trust or (
                client_host is not None and client_host in self.trusted_hosts
            )

            if trusted:
                headers = dict(scope.get("headers", []))
                xff = headers.get(b"x-forwarded-for", b"").decode("latin1")
                if xff:
                    ips = [ip.strip() for ip in xff.split(",")]
                    # Najbardziej prawy IP spoza listy trusted = realny klient
                    real_ip = next(
                        (ip for ip in reversed(ips) if ip not in self.trusted_hosts),
                        ips[0] if self.always_trust else None,
                    )
                    if real_ip:
                        scope["client"] = (real_ip, 0)

                proto = headers.get(b"x-forwarded-proto", b"").decode("latin1").strip()
                if proto:
                    if scope["type"] == "websocket":
                        scope["scheme"] = proto.replace("http", "ws")
                    else:
                        scope["scheme"] = proto

        await self.app(scope, receive, send)
