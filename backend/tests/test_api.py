import asyncio

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import create_app, get_service
from app.service import WindDataService
from tests.conftest import FakeElexonClient


@pytest.fixture
def make_client(real_data, pilot_settings):
    def _make(fail: bool = False) -> tuple[TestClient, FakeElexonClient]:
        fake = FakeElexonClient(*real_data, fail=fail)
        service = WindDataService(fake, pilot_settings)  # type: ignore[arg-type]
        app = create_app()
        app.dependency_overrides[get_service] = lambda: service
        app.dependency_overrides[get_settings] = lambda: pilot_settings
        return TestClient(app), fake

    return _make


def test_health(make_client):
    client, _ = make_client()
    assert client.get("/api/health").json() == {"status": "ok"}


def test_meta_lists_pilot_decision_dates(make_client):
    body = make_client()[0].get("/api/meta").json()
    assert body["decision_dates"] == ["2026-01-01"]
    assert body["default_gate_closure"] == "09:50:00"


def test_decision_view_uses_forecast_in_force_at_gate_closure(make_client):
    client, _ = make_client()
    res = client.get("/api/decisions/2026-01-01")
    assert res.status_code == 200
    body = res.json()
    assert body["forecast_publish_time"].startswith("2026-01-01T09:30")
    assert body["forecast_age_minutes"] == 20
    assert len(body["forecast_points"]) == 24 and len(body["actuals"]) == 48
    assert round(body["metrics"]["mae"]) == 3157
    assert res.headers["cache-control"].startswith("public")
    assert "x-request-id" in res.headers


def test_earlier_gate_closure_uses_earlier_forecast(make_client):
    body = make_client()[0].get("/api/decisions/2026-01-01", params={"gate_closure": "08:00"}).json()
    assert body["forecast_publish_time"].startswith("2026-01-01T07:30")


@pytest.mark.parametrize(
    ("path", "status"),
    [
        ("/api/decisions/2026-02-15", 404),  # outside the pilot window
        ("/api/decisions/not-a-date", 422),
        ("/api/decisions/2026-01-01?gate_closure=25:00", 422),
        ("/api/accuracy/horizon?bucket_hours=0", 422),
    ],
)
def test_invalid_requests(make_client, path, status):
    assert make_client()[0].get(path).status_code == status


def test_accuracy_report(make_client):
    body = make_client()[0].get("/api/accuracy").json()
    assert body["overall"]["n"] == 24
    assert [d["delivery_date"] for d in body["daily"]] == ["2026-01-02"]
    assert len(body["by_hour"]) == 24
    assert sum(b["count"] for b in body["histogram"]) == 24


def test_horizon_report(make_client):
    body = make_client()[0].get("/api/accuracy/horizon", params={"bucket_hours": 6}).json()
    assert body["decision_lead_range_h"] == [14.17, 37.17]
    assert all(b["lead_to_h"] - b["lead_from_h"] == 6 for b in body["buckets"])


def test_upstream_failure_maps_to_502(make_client):
    res = make_client(fail=True)[0].get("/api/accuracy")
    assert res.status_code == 502
    assert "unavailable" in res.json()["detail"]


async def test_concurrent_first_requests_fetch_once(real_data, pilot_settings):
    fake = FakeElexonClient(*real_data)
    service = WindDataService(fake, pilot_settings)  # type: ignore[arg-type]
    await asyncio.gather(*(service.load() for _ in range(5)))
    assert fake.calls == 2  # one actuals + one forecasts request, not ten
