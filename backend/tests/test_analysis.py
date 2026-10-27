from datetime import UTC, date, datetime, time

import pandas as pd
import pytest

from app import analysis
from app.elexon import ActualRecord, ForecastRecord

TZ = "Europe/London"
GATE = time(9, 50)


def ts(s: str) -> pd.Timestamp:
    return pd.Timestamp(s, tz="UTC")


def forecasts(*rows: tuple[str, str, float]) -> pd.DataFrame:
    return analysis.forecasts_frame(
        ForecastRecord(publish_time=p, start_time=s, generation=g) for p, s, g in rows
    )


def actuals(*rows: tuple[str, float]) -> pd.DataFrame:
    return analysis.actuals_frame(ActualRecord(start_time=s, generation=g, fuel_type="WIND") for s, g in rows)


class TestMarketTime:
    def test_gate_closure_in_winter_is_utc(self):
        assert analysis.decision_time_utc(date(2026, 1, 14), GATE, TZ) == ts("2026-01-14T09:50")

    def test_gate_closure_in_summer_shifts_by_bst(self):
        assert analysis.decision_time_utc(date(2026, 7, 1), GATE, TZ) == ts("2026-07-01T08:50")

    def test_delivery_window_is_next_local_day(self):
        start, end = analysis.delivery_window_utc(date(2026, 1, 14), TZ)
        assert (start, end) == (ts("2026-01-15T00:00"), ts("2026-01-16T00:00"))

    @pytest.mark.parametrize(
        ("decision_date", "hours"),
        [(date(2026, 3, 28), 23), (date(2026, 10, 24), 25)],  # clocks change on the delivery day
    )
    def test_delivery_window_handles_clock_changes(self, decision_date, hours):
        start, end = analysis.delivery_window_utc(decision_date, TZ)
        assert (end - start) == pd.Timedelta(hours=hours)


class TestForecastSelection:
    window = (ts("2026-01-15T00:00"), ts("2026-01-16T00:00"))
    decision = ts("2026-01-14T09:50")

    def test_picks_latest_forecast_published_before_gate_closure(self):
        fc = forecasts(
            ("2026-01-14T07:30Z", "2026-01-15T10:00Z", 100),
            ("2026-01-14T09:30Z", "2026-01-15T10:00Z", 200),
            ("2026-01-14T11:30Z", "2026-01-15T10:00Z", 999),  # published after gate closure
        )
        out = analysis.forecast_at_decision(fc, self.decision, *self.window)
        assert out["forecast"].tolist() == [200]
        assert out["publish_time"].tolist() == [ts("2026-01-14T09:30")]

    def test_forecast_published_exactly_at_gate_closure_counts(self):
        fc = forecasts(("2026-01-14T09:50Z", "2026-01-15T10:00Z", 300))
        assert analysis.forecast_at_decision(fc, self.decision, *self.window)["forecast"].tolist() == [300]

    def test_selection_is_per_target_hour(self):
        # Latest publish doesn't cover hour 23:00; fall back to the older one for that hour only.
        fc = forecasts(
            ("2026-01-14T03:30Z", "2026-01-15T22:00Z", 1),
            ("2026-01-14T03:30Z", "2026-01-15T23:00Z", 2),
            ("2026-01-14T09:30Z", "2026-01-15T22:00Z", 3),
        )
        out = analysis.forecast_at_decision(fc, self.decision, *self.window)
        assert out["forecast"].tolist() == [3, 2]

    def test_targets_outside_delivery_day_are_excluded(self):
        fc = forecasts(
            ("2026-01-14T09:30Z", "2026-01-14T23:00Z", 1),
            ("2026-01-14T09:30Z", "2026-01-16T00:00Z", 2),
        )
        assert analysis.forecast_at_decision(fc, self.decision, *self.window).empty

    def test_duplicate_records_are_collapsed(self):
        fc = forecasts(
            ("2026-01-14T09:30Z", "2026-01-15T10:00Z", 5),
            ("2026-01-14T09:30Z", "2026-01-15T10:00Z", 5),
        )
        assert len(fc) == 1


class TestMetrics:
    def test_known_values(self):
        df = pd.DataFrame({"actual": [1000, 1000, 1000, 1000], "error": [-100.0, 100.0, 200.0, -200.0]})
        m = analysis.error_metrics(df)
        assert m is not None
        assert (m.n, m.mae, m.bias, m.mean_actual, m.nmae) == (4, 150.0, 0.0, 1000.0, 0.15)
        assert m.rmse == pytest.approx(158.1, abs=0.05)
        assert m.over_forecast_share == 0.5

    def test_rows_without_actuals_are_ignored(self):
        df = pd.DataFrame({"actual": [None, 500.0], "error": [None, -50.0]})
        m = analysis.error_metrics(df)
        assert m is not None and m.n == 1 and m.mae == 50.0

    def test_no_data_returns_none(self):
        assert analysis.error_metrics(pd.DataFrame({"actual": [None], "error": [None]})) is None

    def test_zero_mean_actual_has_no_nmae(self):
        m = analysis.error_metrics(pd.DataFrame({"actual": [0.0], "error": [-10.0]}))
        assert m is not None and m.nmae is None

    def test_energy_split_separates_over_and_under_forecast(self):
        df = pd.DataFrame({"error": [-300.0, 100.0, None, -200.0]})
        assert analysis.energy_split(df) == (500.0, 100.0)

    def test_histogram_counts_every_point(self):
        bins = analysis.error_histogram(pd.Series([-1200.0, -10.0, 0.0, 499.0, 501.0]), bin_width=500)
        assert sum(b.count for b in bins) == 5
        assert bins[0].lower == -1500 and bins[-1].upper == 1000


class TestHorizon:
    def test_buckets_by_lead_time_and_drops_negative_leads(self):
        fc = forecasts(
            ("2026-01-15T09:00Z", "2026-01-15T10:00Z", 100),  # lead 1h
            ("2026-01-15T05:00Z", "2026-01-15T10:00Z", 400),  # lead 5h
            ("2026-01-15T11:00Z", "2026-01-15T10:00Z", 999),  # published after target: ignored
        )
        act = actuals(("2026-01-15T10:00Z", 200))
        rows = analysis.horizon_table(
            fc, act, ts("2026-01-15"), ts("2026-01-16"), bucket_hours=3, max_lead_hours=72
        )
        assert [(lo, hi, m.mae) for lo, hi, m in rows] == [(0, 3, 100.0), (3, 6, 200.0)]


class TestRealElexonData:
    """Regression against real BMRS data for delivery day 2026-01-02.

    Reference MAE (3157 MW) was computed independently in JavaScript directly
    against the live API on 2026-10-27.
    """

    def test_gate_closure_forecast_for_2_january(self, real_data):
        acts, fcs = real_data
        start, end = analysis.delivery_window_utc(date(2026, 1, 1), TZ)
        selected = analysis.forecast_at_decision(
            analysis.forecasts_frame(fcs), analysis.decision_time_utc(date(2026, 1, 1), GATE, TZ), start, end
        )
        day = analysis.attach_actuals(selected, analysis.actuals_frame(acts))
        m = analysis.error_metrics(day)

        assert set(selected["publish_time"]) == {pd.Timestamp(datetime(2026, 1, 1, 9, 30, tzinfo=UTC))}
        assert m is not None and m.n == 24
        assert round(m.mae) == 3157
        assert m.bias < 0  # wind came in well below forecast that day
