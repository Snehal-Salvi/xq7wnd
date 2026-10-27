"""Loads the pilot dataset once (with TTL) and assembles API views from it."""

import asyncio
import time as monotonic_time
from datetime import date, time, timedelta
from typing import Any

import pandas as pd

from app import analysis
from app.config import Settings
from app.elexon import ElexonClient
from app.schemas import (
    AccuracyReport,
    DailyAccuracy,
    DecisionView,
    HorizonBucket,
    HorizonReport,
    HourAccuracy,
    SeriesPoint,
)


class OutOfScopeError(ValueError):
    """Requested decision date is outside the pilot window."""


def _records(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Rows as dicts, with NaN replaced by None so they serialise as JSON null."""
    clean = df.astype(object).where(df.notna(), None)
    return [{str(k): v for k, v in row.items()} for row in clean.to_dict("records")]


class WindDataService:
    def __init__(self, client: ElexonClient, settings: Settings) -> None:
        self._client = client
        self._settings = settings
        self._lock = asyncio.Lock()
        self._loaded_at: float | None = None
        self._forecasts = pd.DataFrame()
        self._actuals = pd.DataFrame()

    async def aclose(self) -> None:
        await self._client.aclose()

    # ------------------------------------------------------------------ data

    @property
    def decision_dates(self) -> list[date]:
        s = self._settings
        days = (s.last_decision_date - s.first_decision_date).days
        return [s.first_decision_date + timedelta(days=i) for i in range(days + 1)]

    def _window(self) -> tuple[pd.Timestamp, pd.Timestamp]:
        s = self._settings
        start, _ = analysis.delivery_window_utc(s.first_decision_date, s.market_timezone)
        _, end = analysis.delivery_window_utc(s.last_decision_date, s.market_timezone)
        return start, end

    def _is_fresh(self) -> bool:
        return self._loaded_at is not None and (
            monotonic_time.monotonic() - self._loaded_at < self._settings.cache_ttl_s
        )

    async def load(self) -> tuple[pd.DataFrame, pd.DataFrame]:
        """Return (forecasts, actuals), fetching from Elexon at most once per TTL."""
        if self._is_fresh():
            return self._forecasts, self._actuals
        async with self._lock:  # one fetch even under concurrent first requests
            if not self._is_fresh():
                s = self._settings
                start, end = self._window()
                forecasts, actuals = await asyncio.gather(
                    self._client.fetch_wind_forecasts(
                        (start - pd.Timedelta(hours=s.max_lead_hours)).to_pydatetime(), end.to_pydatetime()
                    ),
                    self._client.fetch_wind_actuals(
                        s.first_decision_date + timedelta(days=1), s.last_decision_date + timedelta(days=1)
                    ),
                )
                self._forecasts = analysis.forecasts_frame(forecasts)
                self._actuals = analysis.actuals_frame(actuals)
                self._loaded_at = monotonic_time.monotonic()
        return self._forecasts, self._actuals

    # ------------------------------------------------------------------ views

    async def _backtest(self, gate_closure: time) -> pd.DataFrame:
        forecasts, actuals = await self.load()
        return analysis.backtest(
            forecasts, actuals, self.decision_dates, gate_closure, self._settings.market_timezone
        )

    async def decision_view(self, decision_date: date, gate_closure: time) -> DecisionView:
        if decision_date not in self.decision_dates:
            raise OutOfScopeError(
                f"{decision_date} is outside the pilot window "
                f"({self.decision_dates[0]} to {self.decision_dates[-1]})"
            )
        tz = self._settings.market_timezone
        forecasts, actuals = await self.load()
        bt = await self._backtest(gate_closure)
        month = analysis.error_metrics(bt)
        band = (month.p10, month.p90) if month else None

        decision_time = analysis.decision_time_utc(decision_date, gate_closure, tz)
        start, end = analysis.delivery_window_utc(decision_date, tz)
        day = analysis.attach_actuals(
            analysis.forecast_at_decision(forecasts, decision_time, start, end), actuals
        )
        day_actuals = actuals[(actuals["start_time"] >= start) & (actuals["start_time"] < end)]

        if band:
            day["band_low"] = (day["forecast"] + band[0]).clip(lower=0)  # generation can't go negative
            day["band_high"] = day["forecast"] + band[1]
        publish = day["publish_time"].max() if not day.empty else None
        over, under = analysis.energy_split(day)
        actual_energy = (
            day_actuals["actual"].sum() * 0.5 if not day_actuals.empty else None
        )  # half-hours → MWh

        return DecisionView(
            decision_date=decision_date,
            decision_time=decision_time,
            delivery_start=start,
            delivery_end=end,
            forecast_publish_time=publish,
            forecast_age_minutes=(decision_time - publish).total_seconds() / 60
            if publish is not None
            else None,
            forecast_points=[
                SeriesPoint(
                    time=r["start_time"],
                    forecast=r["forecast"],
                    actual=r["actual"],
                    error=r["error"],
                    band_low=r.get("band_low"),
                    band_high=r.get("band_high"),
                )
                for r in _records(day)
            ],
            actuals=[SeriesPoint(time=r["start_time"], actual=r["actual"]) for r in _records(day_actuals)],
            forecast_energy_mwh=round(float(day["forecast"].sum()), 1),  # hourly points → MWh
            actual_energy_mwh=round(float(actual_energy), 1) if actual_energy is not None else None,
            over_forecast_mwh=over,
            under_forecast_mwh=under,
            metrics=analysis.error_metrics(day),
            band_quantiles=band,
        )

    async def accuracy(self, gate_closure: time) -> AccuracyReport:
        tz = self._settings.market_timezone
        bt = await self._backtest(gate_closure)
        daily = []
        for d in self.decision_dates:
            group = bt[bt["decision_date"] == d]
            over, under = analysis.energy_split(group)
            daily.append(
                DailyAccuracy(
                    decision_date=d,
                    delivery_date=d + timedelta(days=1),
                    metrics=analysis.error_metrics(group),
                    over_forecast_mwh=over,
                    under_forecast_mwh=under,
                )
            )
        by_hour = []
        if not bt.empty:
            local_hour = pd.to_datetime(bt["start_time"], utc=True).dt.tz_convert(tz).dt.hour
            for hour, group in bt.groupby(local_hour):
                metrics = analysis.error_metrics(group)
                if metrics:
                    by_hour.append(HourAccuracy(hour=int(hour), metrics=metrics))
        return AccuracyReport(
            gate_closure=gate_closure,
            overall=analysis.error_metrics(bt),
            daily=daily,
            by_hour=by_hour,
            histogram=analysis.error_histogram(bt["error"]),
        )

    async def horizon(self, bucket_hours: int) -> HorizonReport:
        s = self._settings
        forecasts, actuals = await self.load()
        start, end = self._window()
        rows = analysis.horizon_table(forecasts, actuals, start, end, bucket_hours, s.max_lead_hours)
        # Lead times a day-ahead decision covers: delivery-day midnight → next midnight, from gate closure.
        d0 = s.first_decision_date
        decision = analysis.decision_time_utc(d0, s.default_gate_closure, s.market_timezone)
        d_start, d_end = analysis.delivery_window_utc(d0, s.market_timezone)
        lead_range = (
            (d_start - decision) / analysis.HOUR,
            (d_end - analysis.HOUR - decision) / analysis.HOUR,
        )
        return HorizonReport(
            bucket_hours=bucket_hours,
            decision_lead_range_h=(round(lead_range[0], 2), round(lead_range[1], 2)),
            buckets=[HorizonBucket(lead_from_h=lo, lead_to_h=hi, metrics=m) for lo, hi, m in rows],
        )
