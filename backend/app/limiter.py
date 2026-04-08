"""Shared slowapi Limiter instance.

Import this in routers to use @limiter.limit() decorators.
Import in main.py to attach app.state.limiter and register the exception handler.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
