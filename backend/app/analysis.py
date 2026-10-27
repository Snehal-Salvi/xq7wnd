"""Pure analysis functions: forecast selection at gate closure and error statistics.

Conventions
-----------
* All timestamps are timezone-aware UTC ``pandas.Timestamp``s.
* ``error = actual - forecast`` (MW). Negative = over-forecast = risk of buying too little.
* Forecasts (WINDFOR) are hourly; actuals (FUELHH) are half-hourly. Accuracy is
  measured on the hours where both exist, matched on ``start_time``.
"""

from collections.abc import Iterable
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from app.elexon import ActualRecord, ForecastRecord
from app.schemas import ErrorMetrics, HistogramBin

HOUR = pd.Timedelta(hours=1)


# --------------------------------------------------------------------------- frames


def actuals_frame(records: Iterable[ActualRecord]) -> pd.DataFrame:
    """Columns: start_time, actual. One row per settlement period, sorted."""
    df = pd.DataFrame([(r.start_time, r.generation) for r in records], columns=["start_time", "actual"])
    df["start_time"] = pd.to_datetime(df["start_time"], utc=True)
    return df.drop_duplicates("start_time", keep="last").sort_values("start_time").reset_index(drop=True)


def forecasts_frame(records: Iterable[ForecastRecord]) -> pd.DataFrame:
    """Columns: publish_time, start_time, forecast. Deduplicated on (publish_time, start_time)."""
    df = pd.DataFrame(
        [(r.publish_time, r.start_time, r.generation) for r in records],
        columns=["publish_time", "start_time", "forecast"],
    )
    for col in ("publish_time", "start_time"):
        df[col] = pd.to_datetime(df[col], utc=True)
    return (
        df.drop_duplicates(["publish_time", "start_time"], keep="last")
        .sort_values(["start_time", "publish_time"])
        .reset_index(drop=True)
    )


# --------------------------------------------------------------------------- market time


def decision_time_utc(decision_date: date, gate_closure: time, tz: str) -> pd.Timestamp:
    """Gate closure on the decision day, converted from market local time to UTC."""
    local = datetime.combine(decision_date, gate_closure, tzinfo=ZoneInfo(tz))
    return pd.Timestamp(local).tz_convert("UTC")


def delivery_window_utc(decision_date: date, tz: str) -> tuple[pd.Timestamp, pd.Timestamp]:
    """[start, end) of the delivery day (decision day + 1) in UTC. 23h/25h on clock-change days."""
    zone = ZoneInfo(tz)
    start = datetime.combine(decision_date + timedelta(days=1), time(0), tzinfo=zone)
    end = datetime.combine(decision_date + timedelta(days=2), time(0), tzinfo=zone)
    return pd.Timestamp(start).tz_convert("UTC"), pd.Timestamp(end).tz_convert("UTC")


# --------------------------------------------------------------------------- selection


def forecast_at_decision(
    forecasts: pd.DataFrame, decision_time: pd.Timestamp, start: pd.Timestamp, end: pd.Timestamp
) -> pd.DataFrame:
    """For each target hour in [start, end), the latest forecast published at or before decision_time.

    Returns columns: start_time, forecast, publish_time.
    """
    available = forecasts[
        (forecasts["publish_time"] <= decision_time)
        & (forecasts["start_time"] >= start)
        & (forecasts["start_time"] < end)
    ]
    return (
        available.sort_values("publish_time")
        .drop_duplicates("start_time", keep="last")
        .sort_values("start_time")[["start_time", "forecast", "publish_time"]]
        .reset_index(drop=True)
    )


def attach_actuals(forecast: pd.DataFrame, actuals: pd.DataFrame) -> pd.DataFrame:
    """Left-join actuals on start_time and add ``error`` (actual - forecast)."""
    merged = forecast.merge(actuals, on="start_time", how="left")
    merged["error"] = merged["actual"] - merged["forecast"]
    return merged


def backtest(
    forecasts: pd.DataFrame,
    actuals: pd.DataFrame,
    decision_dates: Iterable[date],
    gate_closure: time,
    tz: str,
) -> pd.DataFrame:
    """Gate-closure forecast vs actual for every decision date, stacked into one frame."""
    frames = []
    for d in decision_dates:
        start, end = delivery_window_utc(d, tz)
        fc = forecast_at_decision(forecasts, decision_time_utc(d, gate_closure, tz), start, end)
        fc["decision_date"] = d
        frames.append(fc)
    selected = (
        pd.concat(frames, ignore_index=True)
        if frames
        else pd.DataFrame(columns=["start_time", "forecast", "publish_time", "decision_date"])
    )
    return attach_actuals(selected, actuals)


# --------------------------------------------------------------------------- metrics


def error_metrics(df: pd.DataFrame) -> ErrorMetrics | None:
    """Metrics over rows with both forecast and actual; ``None`` if there are none."""
    valid = df.dropna(subset=["error", "actual"])
    if valid.empty:
        return None
    err = valid["error"].to_numpy(dtype=float)
    mean_actual = float(valid["actual"].mean())
    mae = float(np.abs(err).mean())
    p10, p50, p90 = np.percentile(err, [10, 50, 90])
    return ErrorMetrics(
        n=len(err),
        mae=round(mae, 1),
        rmse=round(float(np.sqrt((err**2).mean())), 1),
        bias=round(float(err.mean()), 1),
        p10=round(float(p10), 1),
        p50=round(float(p50), 1),
        p90=round(float(p90), 1),
        mean_actual=round(mean_actual, 1),
        over_forecast_share=round(float((err < 0).mean()), 4),
        nmae=round(mae / mean_actual, 4) if mean_actual > 0 else None,
    )


def energy_split(df: pd.DataFrame) -> tuple[float | None, float | None]:
    """(over-forecast MWh, under-forecast MWh) from hourly points (each point ≈ 1 hour)."""
    err = df["error"].dropna()
    if err.empty:
        return None, None
    return round(float((-err.clip(upper=0)).sum()), 1), round(float(err.clip(lower=0).sum()), 1)


def error_histogram(errors: pd.Series, bin_width: float = 500.0) -> list[HistogramBin]:
    err = errors.dropna().to_numpy(dtype=float)
    if err.size == 0:
        return []
    lo = np.floor(err.min() / bin_width) * bin_width
    hi = np.ceil(err.max() / bin_width) * bin_width
    edges = np.arange(lo, hi + bin_width, bin_width)
    counts, _ = np.histogram(err, bins=edges)
    return [
        HistogramBin(lower=float(a), upper=float(b), count=int(c))
        for a, b, c in zip(edges[:-1], edges[1:], counts, strict=True)
    ]


def horizon_table(
    forecasts: pd.DataFrame,
    actuals: pd.DataFrame,
    start: pd.Timestamp,
    end: pd.Timestamp,
    bucket_hours: int,
    max_lead_hours: int,
) -> list[tuple[float, float, ErrorMetrics]]:
    """Error by forecast lead time (target - publish) for targets in [start, end)."""
    window = forecasts[(forecasts["start_time"] >= start) & (forecasts["start_time"] < end)].copy()
    window["lead_h"] = (window["start_time"] - window["publish_time"]).dt.total_seconds() / 3600
    window = window[(window["lead_h"] >= 0) & (window["lead_h"] < max_lead_hours)]
    joined = attach_actuals(window, actuals)
    joined["bucket"] = (joined["lead_h"] // bucket_hours).astype(int)
    rows = []
    for bucket in sorted(joined["bucket"].unique()):
        metrics = error_metrics(joined[joined["bucket"] == bucket])
        if metrics is not None:
            lo = float(bucket * bucket_hours)
            rows.append((lo, lo + bucket_hours, metrics))
    return rows
