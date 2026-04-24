"""Punkt startowy serwera — czyta TRUSTED_PROXIES z .env i przekazuje do uvicorn."""
import uvicorn
from app.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        forwarded_allow_ips=settings.TRUSTED_PROXIES,
    )
