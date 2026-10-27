from datetime import date, datetime, timedelta
from pathlib import Path

import pytest

from app.config import Settings
from app.elexon import ActualRecord, ForecastRecord

FIXTURE = Path(__file__).parent / "fixtures" / "elexon_2026-01-02.txt"


def load_real_fixture() -> tuple[list[ActualRecord], list[ForecastRecord]]:
    """Decode the compact real-data snapshot (see header of the fixture file)."""
    actuals: list[ActualRecord] = []
    forecasts: list[ForecastRecord] = []
    base: datetime | None = None
    half_hour = timedelta(minutes=30)
    for line in FIXTURE.read_text().splitlines():
        if line.startswith("BASE"):
            base = datetime.fromisoformat(line.split()[1].replace("Z", "+00:00"))
        elif line.startswith("A "):
            assert base
            _, start, values = line.split()
            for i, v in enumerate(values.split(",")):
                actuals.append(
                    ActualRecord(
                        start_time=base + (int(start) + i) * half_hour, generation=float(v), fuel_type="WIND"
                    )
                )
        elif line.startswith("F "):
            assert base
            _, pub, start, values = line.split()
            for i, v in enumerate(values.split(",")):
                forecasts.append(
                    ForecastRecord(
                        publish_time=base + int(pub) * half_hour,
                        start_time=base + (int(start) + 2 * i) * half_hour,
                        generation=float(v),
                    )
                )
    return actuals, forecasts


class FakeElexonClient:
    """In-memory stand-in for ElexonClient that honours the requested ranges."""

    def __init__(self, actuals: list[ActualRecord], forecasts: list[ForecastRecord], fail: bool = False):
        self.actuals, self.forecasts, self.fail = actuals, forecasts, fail
        self.calls = 0

    async def fetch_wind_actuals(self, settlement_from: date, settlement_to: date) -> list[ActualRecord]:
        self.calls += 1
        if self.fail:
            from app.elexon import UpstreamError

            raise UpstreamError("boom")
        # Settlement dates are UK-local days; in January local time == UTC.
        return [a for a in self.actuals if settlement_from <= a.start_time.date() <= settlement_to]

    async def fetch_wind_forecasts(
        self, publish_from: datetime, publish_to: datetime
    ) -> list[ForecastRecord]:
        self.calls += 1
        return [f for f in self.forecasts if publish_from <= f.publish_time < publish_to]

    async def aclose(self) -> None:
        pass


@pytest.fixture
def real_data() -> tuple[list[ActualRecord], list[ForecastRecord]]:
    return load_real_fixture()


@pytest.fixture
def pilot_settings() -> Settings:
    """Pilot window narrowed to the single decision day covered by the real fixture."""
    return Settings(first_decision_date=date(2026, 1, 1), last_decision_date=date(2026, 1, 1))
