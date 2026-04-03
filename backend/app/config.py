"""Application configuration from environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from .env file."""

    # App
    APP_NAME: str = "Event Hub Lublin"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://eventhub:devpassword@localhost:5432/eventhub"

    # Security
    SECRET_KEY: str = "change-this-to-a-random-string-minimum-32-characters-long"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # SMS
    SMS_GATEWAY_TYPE: str = "mock"
    SMS_GATEWAY_URL: str = "http://mock"
    SMS_GATEWAY_API_KEY: str = "mock-key"
    # SMSEagle
    SMSEAGLE_URL: str = "http://smseagle-device/api/v2"
    SMSEAGLE_API_TOKEN: str = ""

    # Email
    ENABLE_EMAIL_NOTIFICATIONS: bool = True
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "awarie@eventhub.lublin.pl"
    SMTP_USE_TLS: bool = True

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    # Geocoding
    NOMINATIM_URL: str = "https://nominatim.openstreetmap.org"
    NOMINATIM_USER_AGENT: str = "EventHubLublin/1.0"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"  # ignoruj zmienne Docker Compose (POSTGRES_*) i inne nieznane


settings = Settings()
