"""
WebSocket Connection Manager — broadcast zmian zdarzeń do podłączonych klientów.
"""

import logging

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._active: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._active.append(ws)
        logger.debug("WS connect: aktywne połączenia=%d", len(self._active))

    def disconnect(self, ws: WebSocket) -> None:
        self._active.remove(ws)
        logger.debug("WS disconnect: aktywne połączenia=%d", len(self._active))

    async def broadcast(self, message: dict) -> None:
        """Wyślij wiadomość do wszystkich podłączonych klientów. Martwe połączenia usuwa automatycznie."""
        dead: list[WebSocket] = []
        for ws in self._active:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._active.remove(ws)
        if dead:
            logger.debug("WS broadcast: usunięto %d martwych połączeń", len(dead))


ws_manager = ConnectionManager()
