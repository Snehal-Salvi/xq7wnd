// Mirrors backend/app/schemas.py. Times are ISO-8601 UTC strings.

export interface ErrorMetrics {
  n: number;
  mae: number;
  rmse: number;
  bias: number;
  p10: number;
  p50: number;
  p90: number;
  mean_actual: number;
  over_forecast_share: number;
  nmae: number | null;
}

export interface Meta {
  decision_dates: string[];
  default_gate_closure: string; // "HH:MM:SS"
  timezone: string;
  data_source: string;
}

export interface SeriesPoint {
  time: string;
  forecast: number | null;
  actual: number | null;
  error: number | null;
  band_low: number | null;
  band_high: number | null;
}

export interface DecisionView {
  decision_date: string;
  decision_time: string;
  delivery_start: string;
  delivery_end: string;
  forecast_publish_time: string | null;
  forecast_age_minutes: number | null;
  forecast_points: SeriesPoint[];
  actuals: SeriesPoint[];
  forecast_energy_mwh: number;
  actual_energy_mwh: number | null;
  over_forecast_mwh: number | null;
  under_forecast_mwh: number | null;
  metrics: ErrorMetrics | null;
  band_quantiles: [number, number] | null;
}

export interface DailyAccuracy {
  decision_date: string;
  delivery_date: string;
  metrics: ErrorMetrics | null;
  over_forecast_mwh: number | null;
  under_forecast_mwh: number | null;
}

export interface HourAccuracy {
  hour: number;
  metrics: ErrorMetrics;
}

export interface HistogramBin {
  lower: number;
  upper: number;
  count: number;
}

export interface AccuracyReport {
  gate_closure: string;
  overall: ErrorMetrics | null;
  daily: DailyAccuracy[];
  by_hour: HourAccuracy[];
  histogram: HistogramBin[];
}

export interface HorizonBucket {
  lead_from_h: number;
  lead_to_h: number;
  metrics: ErrorMetrics;
}

export interface HorizonReport {
  bucket_hours: number;
  decision_lead_range_h: [number, number];
  buckets: HorizonBucket[];
}
