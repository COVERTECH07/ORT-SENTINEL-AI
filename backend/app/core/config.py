from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    app_name: str = "ORT SENTINEL AI"
    environment: str = "development"
    api_prefix: str = "/api"
    secret_key: str = Field(
        default="change-this-secret-key-before-production",
        validation_alias=AliasChoices("JWT_SECRET_KEY", "SECRET_KEY"),
    )
    access_token_minutes: int = Field(
        default=30,
        validation_alias=AliasChoices("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "ACCESS_TOKEN_MINUTES"),
    )
    refresh_token_days: int = Field(
        default=14,
        validation_alias=AliasChoices("JWT_REFRESH_TOKEN_EXPIRE_DAYS", "REFRESH_TOKEN_DAYS"),
    )
    database_url: str = Field(
        default="sqlite:///./ort_sentinel_fallback.db",
        validation_alias="DATABASE_URL",
    )
    database_connect_timeout_seconds: int = Field(default=5, ge=1, le=60)
    cors_origins: str = (
        "http://localhost:3000,http://localhost:5173,http://localhost:8080,"
        "https://ort-sentinel-ai.vercel.app,https://*.vercel.app"
    )
    seed_demo_data: bool = Field(default=True, validation_alias="SEED_DEMO_DATA")
    waste_threshold_grams: float = Field(default=100.0, validation_alias="WASTE_THRESHOLD_GRAMS")
    money_per_kg: float = Field(default=50.0, validation_alias="MONEY_PER_KG")
    co2_per_kg: float = Field(default=2.5, validation_alias="CO2_PER_KG")
    redis_url: str | None = None
    mqtt_host: str | None = Field(default=None, validation_alias=AliasChoices("MQTT_BROKER", "MQTT_HOST"))
    mqtt_port: int = 1883
    mqtt_topic: str = "ort-sentinel/hardware/events"
    hardware_api_key: str | None = None
    default_waste_threshold_kg: float = 0.1
    default_conversion_factor_kwh_per_kg: float = 3.5
    default_conversion_factor_co2_kg_per_kg: float = 2.5
    log_level: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @model_validator(mode="after")
    def require_production_secret(self):
        if self.waste_threshold_grams <= 0 or self.money_per_kg <= 0 or self.co2_per_kg <= 0:
            raise ValueError("Waste threshold and conversion factors must be positive")
        if self.environment.lower() == "production" and (
            self.secret_key == "change-this-secret-key-before-production"
            or len(self.secret_key) < 32
        ):
            raise ValueError("Production requires a SECRET_KEY of at least 32 characters")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
