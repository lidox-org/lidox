from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    app_name: str = "Lidox API (FastAPI)"
    app_version: str = "0.1.0"
    environment: str = Field(default="development", alias="NODE_ENV")

    api_port: int = Field(default=3001, alias="API_PORT")
    fastapi_port: int = Field(default=8001, alias="FASTAPI_PORT")
    cors_origin: str = Field(default="http://localhost:5173", alias="CORS_ORIGIN")

    database_url: str = Field(
        default="postgresql://lidox:lidox_dev@localhost:5432/lidox",
        alias="DATABASE_URL",
    )
    redis_url: str = Field(default="redis://localhost:6379", alias="REDIS_URL")

    jwt_secret: str = Field(
        default="dev-jwt-secret-change-in-production",
        alias="JWT_SECRET",
    )
    jwt_algorithm: str = "HS256"
    jwt_expiration: str = Field(default="15m", alias="JWT_EXPIRATION")
    refresh_token_expiration_days: int = Field(
        default=7,
        alias="REFRESH_TOKEN_EXPIRATION_DAYS",
    )
    groq_api_key: str = Field(default="", alias="GROQ_API_KEY")
    groq_default_model: str = Field(
        default="llama-3.3-70b-versatile",
        alias="GROQ_DEFAULT_MODEL",
    )
    access_cookie_name: str = "access_token"
    refresh_cookie_name: str = "refresh_token"

    model_config = SettingsConfigDict(
        env_file=str(ROOT_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    @property
    def service_port(self) -> int:
        return self.fastapi_port or self.api_port


@lru_cache
def get_settings() -> Settings:
    return Settings()
