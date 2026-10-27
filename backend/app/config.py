"""Application settings, loaded from environment variables (prefix ``APP_``)."""

from datetime import date, time
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="APP_", env_file=".env", extra="ignore")

    elexon_base_url: str = "https://data.elexon.co.uk/bmrs/api/v1"
    elexon_timeout_s: float = 30.0
    elexon_max_retries: int = 3
    elexon_chunk_days: int = 7

    # GB day-ahead auction gate closure (N2EX/EPEX), UK local time.
    market_timezone: str = "Europe/London"
    default_gate_closure: time = time(9, 50)

    # Scope of the pilot: purchase decisions taken in January 2026.
    first_decision_date: date = date(2026, 1, 1)
    last_decision_date: date = date(2026, 1, 31)

    # Forecasts are published with up to ~72h lead; fetch this far back for horizon analysis.
    max_lead_hours: int = 72

    cache_ttl_s: int = 6 * 3600
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:8080"]
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
