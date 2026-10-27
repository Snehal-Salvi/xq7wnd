"""End-to-end check against the live Elexon API for the whole January 2026 pilot.

Skipped by default. Run with:  RUN_LIVE=1 pytest -m live

Reference values were computed independently (JavaScript, directly against the
BMRS API) on 2026-10-27: 744 hourly points, gate closure 09:50 UK time.
"""

import os

import httpx
import pytest

from app.config import Settings
from app.elexon import ElexonClient
from app.service import WindDataService

pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(not os.getenv("RUN_LIVE"), reason="set RUN_LIVE=1 to hit the real Elexon API"),
]

REFERENCE = {
    "n": 744,
    "mae": 1995.6,
    "rmse": 2498.8,
    "bias": -1728.0,
    "p10": -4183.9,
    "p50": -1506.5,
    "p90": 502.7,
}


async def test_january_backtest_matches_independent_reference():
    settings = Settings()
    async with httpx.AsyncClient(base_url=settings.elexon_base_url, timeout=60) as http:
        service = WindDataService(ElexonClient(http), settings)
        report = await service.accuracy(settings.default_gate_closure)

    assert report.overall is not None
    got = report.overall.model_dump()
    for key, expected in REFERENCE.items():
        assert got[key] == pytest.approx(expected, abs=0.2), key
    assert all(day.metrics is not None and day.metrics.n == 24 for day in report.daily)
