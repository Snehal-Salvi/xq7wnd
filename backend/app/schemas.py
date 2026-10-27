"""Response models shared by the analysis layer and the HTTP API."""

from datetime import date, datetime, time

from pydantic import BaseModel, Field


class ErrorMetrics(BaseModel):
    """Error statistics where error = actual - forecast (MW).

    Negative bias means forecasts ran *above* outturn (over-forecast → shortfall risk).
    """

    n: int = Field(description="Number of matched (forecast, actual) points")
    mae: float = Field(description="Mean absolute error, MW")
    rmse: float = Field(description="Root mean squared error, MW")
    bias: float = Field(description="Mean error (actual - forecast), MW")
    p10: float = Field(description="10th percentile of error, MW")
    p50: float = Field(description="Median error, MW")
    p90: float = Field(description="90th percentile of error, MW")
    mean_actual: float = Field(description="Mean actual generation over the matched points, MW")
    over_forecast_share: float = Field(description="Fraction of points where forecast exceeded actual")
    nmae: float | None = Field(description="MAE / mean actual generation (fraction); None if mean is 0")


class Meta(BaseModel):
    decision_dates: list[date]
    default_gate_closure: time
    timezone: str
    data_source: str = "Elexon BMRS: FUELHH (fuelType=WIND) actuals, WINDFOR forecasts"


class SeriesPoint(BaseModel):
    time: datetime
    forecast: float | None = None
    actual: float | None = None
    error: float | None = None
    band_low: float | None = Field(None, description="forecast + P10 historical error")
    band_high: float | None = Field(None, description="forecast + P90 historical error")


class DecisionView(BaseModel):
    decision_date: date
    decision_time: datetime = Field(description="Gate closure in UTC")
    delivery_start: datetime
    delivery_end: datetime
    forecast_publish_time: datetime | None = Field(
        description="Publish time of the forecast in force at gate closure"
    )
    forecast_age_minutes: float | None = Field(description="Minutes between that publish and gate closure")
    forecast_points: list[SeriesPoint] = Field(
        description="Hourly forecast at gate closure, with actuals and band"
    )
    actuals: list[SeriesPoint] = Field(description="Half-hourly actual generation for the delivery day")
    forecast_energy_mwh: float
    actual_energy_mwh: float | None
    over_forecast_mwh: float | None = Field(description="Energy forecast but not delivered (shortfall risk)")
    under_forecast_mwh: float | None = Field(description="Energy delivered beyond forecast (surplus)")
    metrics: ErrorMetrics | None
    band_quantiles: tuple[float, float] | None = Field(
        description="(P10, P90) of January gate-closure errors, MW"
    )


class DailyAccuracy(BaseModel):
    decision_date: date
    delivery_date: date
    metrics: ErrorMetrics | None
    over_forecast_mwh: float | None
    under_forecast_mwh: float | None


class HourAccuracy(BaseModel):
    hour: int = Field(description="Hour of delivery day, UK local time")
    metrics: ErrorMetrics


class HistogramBin(BaseModel):
    lower: float
    upper: float
    count: int


class AccuracyReport(BaseModel):
    gate_closure: time
    overall: ErrorMetrics | None
    daily: list[DailyAccuracy]
    by_hour: list[HourAccuracy]
    histogram: list[HistogramBin]


class HorizonBucket(BaseModel):
    lead_from_h: float
    lead_to_h: float
    metrics: ErrorMetrics


class HorizonReport(BaseModel):
    bucket_hours: int
    decision_lead_range_h: tuple[float, float] = Field(
        description="Lead times covered by a day-ahead decision at the default gate closure"
    )
    buckets: list[HorizonBucket]
