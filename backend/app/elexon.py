"""Async client for the Elexon BMRS Insights API (FUELHH actuals, WINDFOR forecasts).

Both datasets are fetched through their ``/stream`` endpoints in fixed-size date
chunks, concurrently, with retry + exponential backoff on transient failures.
"""

import asyncio
import logging
from datetime import date, datetime, timedelta
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, TypeAdapter

logger = logging.getLogger(__name__)

_RETRYABLE_STATUS = {429, 500, 502, 503, 504}


class UpstreamError(RuntimeError):
    """Raised when Elexon cannot be reached or returns an unusable response."""


class ActualRecord(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    start_time: datetime
    generation: float
    fuel_type: str

    @classmethod
    def from_api(cls, raw: dict[str, Any]) -> "ActualRecord":
        return cls(start_time=raw["startTime"], generation=raw["generation"], fuel_type=raw["fuelType"])


class ForecastRecord(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    start_time: datetime
    publish_time: datetime
    generation: float

    @classmethod
    def from_api(cls, raw: dict[str, Any]) -> "ForecastRecord":
        return cls(start_time=raw["startTime"], publish_time=raw["publishTime"], generation=raw["generation"])


_RAW_LIST = TypeAdapter(list[dict[str, Any]])


def _date_chunks(start: date, end: date, days: int) -> list[tuple[date, date]]:
    """Split the inclusive range [start, end] into inclusive chunks of ``days`` days."""
    chunks, cursor = [], start
    while cursor <= end:
        chunk_end = min(cursor + timedelta(days=days - 1), end)
        chunks.append((cursor, chunk_end))
        cursor = chunk_end + timedelta(days=1)
    return chunks


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


class ElexonClient:
    def __init__(
        self,
        http: httpx.AsyncClient,
        *,
        max_retries: int = 3,
        chunk_days: int = 7,
        backoff_s: float = 0.5,
    ) -> None:
        self._http = http
        self._max_retries = max_retries
        self._chunk_days = chunk_days
        self._backoff_s = backoff_s

    async def aclose(self) -> None:
        await self._http.aclose()

    async def _get(self, path: str, params: dict[str, str]) -> list[dict[str, Any]]:
        last_error = ""
        for attempt in range(self._max_retries + 1):
            if attempt:
                delay = self._backoff_s * 2 ** (attempt - 1)
                logger.warning("Elexon %s failed (%s); retry %d in %.1fs", path, last_error, attempt, delay)
                await asyncio.sleep(delay)
            try:
                response = await self._http.get(path, params=params)
            except httpx.TransportError as exc:
                last_error = repr(exc)
                continue
            if response.status_code in _RETRYABLE_STATUS:
                last_error = f"HTTP {response.status_code}"
                continue
            if response.is_error:
                raise UpstreamError(f"Elexon {path} returned HTTP {response.status_code}")
            try:
                return _RAW_LIST.validate_python(response.json())
            except ValueError as exc:  # invalid JSON or not a list of objects
                raise UpstreamError(f"Elexon returned an unexpected payload for {path}") from exc
        raise UpstreamError(f"Elexon {path} unavailable after {self._max_retries + 1} attempts: {last_error}")

    async def fetch_wind_actuals(self, settlement_from: date, settlement_to: date) -> list[ActualRecord]:
        """Half-hourly outturn of wind generation (FUELHH, fuelType=WIND), inclusive date range."""

        async def fetch(chunk: tuple[date, date]) -> list[dict[str, Any]]:
            return await self._get(
                "/datasets/FUELHH/stream",
                {
                    "settlementDateFrom": chunk[0].isoformat(),
                    "settlementDateTo": chunk[1].isoformat(),
                    "fuelType": "WIND",
                },
            )

        pages = await asyncio.gather(
            *(fetch(c) for c in _date_chunks(settlement_from, settlement_to, self._chunk_days))
        )
        records = [ActualRecord.from_api(r) for page in pages for r in page]
        return [r for r in records if r.fuel_type == "WIND"]

    async def fetch_wind_forecasts(
        self, publish_from: datetime, publish_to: datetime
    ) -> list[ForecastRecord]:
        """All WINDFOR forecasts published in [publish_from, publish_to)."""
        windows = []
        cursor = publish_from
        while cursor < publish_to:
            nxt = min(cursor + timedelta(days=self._chunk_days), publish_to)
            windows.append((cursor, nxt))
            cursor = nxt

        async def fetch(window: tuple[datetime, datetime]) -> list[dict[str, Any]]:
            # The API treats publishDateTimeTo as inclusive; shave a second so
            # adjacent windows don't double-count a publish exactly on the boundary.
            return await self._get(
                "/datasets/WINDFOR/stream",
                {
                    "publishDateTimeFrom": _iso(window[0]),
                    "publishDateTimeTo": _iso(window[1] - timedelta(seconds=1)),
                },
            )

        pages = await asyncio.gather(*(fetch(w) for w in windows))
        return [ForecastRecord.from_api(r) for page in pages for r in page]
