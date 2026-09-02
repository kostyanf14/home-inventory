from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

INSECURE_DEV_SECRET = "dev_secret_key_change_in_production_1234567890"
MIN_SECRET_LENGTH = 32


class Settings(BaseSettings):
    PROJECT_NAME: str = "Home Inventory API"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: Literal["development", "production", "test"] = "development"
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    CORS_ORIGINS: str = "http://127.0.0.1:5173,http://localhost:5173"
    AUTH_RATE_LIMIT: int = 10
    AUTH_RATE_WINDOW_SECONDS: int = 900
    PASSWORD_MIN_LENGTH: int = 8
    EXTERNAL_LOOKUP_TIMEOUT_SECONDS: float = 5.0

    DATABASE_URL: str = "sqlite+aiosqlite:///./home_inventory.db"

    model_config = SettingsConfigDict(case_sensitive=True, env_file=".env", extra="ignore")

    @field_validator("ENVIRONMENT", mode="before")
    @classmethod
    def normalize_environment(cls, value: object) -> object:
        if isinstance(value, str):
            return value.lower()
        return value

    @model_validator(mode="after")
    def require_secret_outside_dev(self):
        secret = (self.SECRET_KEY or "").strip()
        if self.ENVIRONMENT in {"development", "test"}:
            if not secret:
                self.SECRET_KEY = INSECURE_DEV_SECRET
            return self
        if not secret or secret == INSECURE_DEV_SECRET or len(secret) < MIN_SECRET_LENGTH:
            raise ValueError(
                "SECRET_KEY must be set to a unique value of at least "
                f"{MIN_SECRET_LENGTH} characters when ENVIRONMENT is production"
            )
        self.SECRET_KEY = secret
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def docs_enabled(self) -> bool:
        return self.ENVIRONMENT != "production"

    @property
    def auto_create_tables(self) -> bool:
        """Alembic owns the production schema; dev/test keep the create_all shortcut."""
        return self.ENVIRONMENT != "production"


settings = Settings()
