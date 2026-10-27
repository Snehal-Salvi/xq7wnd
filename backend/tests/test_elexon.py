from datetime import UTC, date, datetime

import httpx
import pytest
import respx

from app.elexon import ElexonClient, UpstreamError

BASE = "https://elexon.test/bmrs/api/v1"
FUEL = f"{BASE}/datasets/FUELHH/stream"
WIND = f"{BASE}/datasets/WINDFOR/stream"

ACTUAL = {
    "dataset": "FUELHH",
    "fuelType": "WIND",
    "generation": 14202,
    "publishTime": "2026-01-03T00:00:00Z",
    "settlementDate": "2026-01-02",
    "settlementPeriod": 48,
    "startTime": "2026-01-02T23:30:00Z",
}
FORECAST = {
    "dataset": "WINDFOR",
    "generation": 19176,
    "publishTime": "2026-01-02T11:30:00Z",
    "startTime": "2026-01-01T21:00:00Z",
}


@pytest.fixture
async def client():
    async with httpx.AsyncClient(base_url=BASE) as http:
        yield ElexonClient(http, max_retries=2, chunk_days=7, backoff_s=0)


@respx.mock
async def test_parses_actuals_and_requests_wind_only(client):
    route = respx.get(FUEL).respond(json=[ACTUAL, {**ACTUAL, "fuelType": "CCGT"}])
    records = await client.fetch_wind_actuals(date(2026, 1, 2), date(2026, 1, 2))

    assert [(r.start_time, r.generation) for r in records] == [
        (datetime(2026, 1, 2, 23, 30, tzinfo=UTC), 14202)
    ]
    params = route.calls.last.request.url.params
    assert params["fuelType"] == "WIND" and params["settlementDateFrom"] == "2026-01-02"


@respx.mock
async def test_long_ranges_are_fetched_in_chunks(client):
    route = respx.get(FUEL).respond(json=[])
    await client.fetch_wind_actuals(date(2026, 1, 1), date(2026, 1, 10))
    ranges = sorted(
        (c.request.url.params["settlementDateFrom"], c.request.url.params["settlementDateTo"])
        for c in route.calls
    )
    assert ranges == [("2026-01-01", "2026-01-07"), ("2026-01-08", "2026-01-10")]


@respx.mock
async def test_forecast_windows_do_not_overlap(client):
    route = respx.get(WIND).respond(json=[FORECAST])
    records = await client.fetch_wind_forecasts(
        datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 1, 10, tzinfo=UTC)
    )
    windows = sorted(
        (c.request.url.params["publishDateTimeFrom"], c.request.url.params["publishDateTimeTo"])
        for c in route.calls
    )
    assert windows == [
        ("2026-01-01T00:00:00Z", "2026-01-07T23:59:59Z"),
        ("2026-01-08T00:00:00Z", "2026-01-09T23:59:59Z"),
    ]
    assert records[0].publish_time == datetime(2026, 1, 2, 11, 30, tzinfo=UTC)


@respx.mock
async def test_retries_transient_failures(client):
    route = respx.get(FUEL)
    route.side_effect = [httpx.Response(503), httpx.ConnectError("down"), httpx.Response(200, json=[ACTUAL])]
    records = await client.fetch_wind_actuals(date(2026, 1, 2), date(2026, 1, 2))
    assert len(records) == 1 and route.call_count == 3


@respx.mock
async def test_gives_up_after_max_retries(client):
    route = respx.get(FUEL).respond(503)
    with pytest.raises(UpstreamError, match="after 3 attempts"):
        await client.fetch_wind_actuals(date(2026, 1, 2), date(2026, 1, 2))
    assert route.call_count == 3


@respx.mock
async def test_client_errors_are_not_retried(client):
    route = respx.get(FUEL).respond(400)
    with pytest.raises(UpstreamError, match="HTTP 400"):
        await client.fetch_wind_actuals(date(2026, 1, 2), date(2026, 1, 2))
    assert route.call_count == 1


@respx.mock
async def test_unexpected_payload_is_rejected(client):
    respx.get(FUEL).respond(json={"error": "not a list"})
    with pytest.raises(UpstreamError, match="unexpected payload"):
        await client.fetch_wind_actuals(date(2026, 1, 2), date(2026, 1, 2))
