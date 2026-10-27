import { useId, useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { DecisionView } from "../../api/types";
import { formatPower, formatTime } from "../../lib/format";
import { niceTicks } from "../../lib/ticks";
import { useChartTheme } from "../../lib/useChartTheme";
import { ChartLegend } from "./ChartLegend";

/** Values are in GW so the axis picks round ticks in the unit it displays. */
export interface ChartRow {
  t: number;
  forecast?: number;
  band?: [number, number];
  actual?: number;
  /** Forecast for the hour containing t, for tooltips on half-hour outturn points. */
  hourForecast?: number;
  /** Forecast line's value at t (interpolated between hours), used to shade the gap. */
  forecastAt?: number;
  /** [outturn, forecast] where outturn fell short; zero-height otherwise. */
  short?: [number, number];
  /** [forecast, outturn] where outturn came in above forecast; zero-height otherwise. */
  surplus?: [number, number];
}

const HOUR_MS = 3_600_000;
const toGW = (mw: number) => mw / 1000;

/** Hourly forecast and half-hourly outturn on one time axis, in GW. */
export function mergeSeries(view: DecisionView, showActuals: boolean): ChartRow[] {
  const rows = new Map<number, ChartRow>();
  const row = (iso: string) => {
    const t = new Date(iso).getTime();
    let r = rows.get(t);
    if (!r) rows.set(t, (r = { t }));
    return r;
  };
  for (const p of view.forecast_points) {
    const r = row(p.time);
    if (p.forecast !== null) r.forecast = toGW(p.forecast);
    if (p.band_low !== null && p.band_high !== null) r.band = [toGW(p.band_low), toGW(p.band_high)];
  }
  if (showActuals) {
    for (const p of view.actuals) if (p.actual !== null) row(p.time).actual = toGW(p.actual);
  }
  const sorted = [...rows.values()].sort((a, b) => a.t - b.t);
  for (const r of sorted) {
    const hour = Math.floor(r.t / HOUR_MS) * HOUR_MS;
    const here = rows.get(hour)?.forecast;
    const next = rows.get(hour + HOUR_MS)?.forecast;
    r.hourForecast = here;
    // The forecast line only spans its hourly points, so don't shade past the last one.
    r.forecastAt =
      here === undefined
        ? undefined
        : r.t === hour
          ? here
          : next === undefined
            ? undefined
            : here + ((next - here) * (r.t - hour)) / HOUR_MS;
    if (r.actual !== undefined && r.forecastAt !== undefined) {
      const f = r.forecastAt;
      r.short = [Math.min(r.actual, f), f];
      r.surplus = [f, Math.max(r.actual, f)];
    }
  }
  return sorted;
}

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as ChartRow;
  const gw = (v: number, signed = false) => formatPower(v * 1000, { signed });
  const forecast = row.forecast ?? row.hourForecast;
  const miss = row.actual !== undefined && forecast !== undefined ? row.actual - forecast : undefined;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-title">{formatTime(Number(label))}</p>
      {forecast !== undefined && (
        <p>
          <span className="swatch swatch--forecast" /> Forecast <b>{gw(forecast)}</b>
          {row.forecast === undefined && <span className="chart-tooltip-muted"> hourly</span>}
        </p>
      )}
      {row.actual !== undefined && (
        <p>
          <span className="swatch swatch--actual" /> Outturn <b>{gw(row.actual)}</b>
        </p>
      )}
      {miss !== undefined && (
        <p className={miss < 0 ? "chart-tooltip-short" : "chart-tooltip-muted"}>
          {miss < 0 ? `${gw(-miss)} short of forecast` : `${gw(miss)} above forecast`}
        </p>
      )}
      {row.band && (
        <p className="chart-tooltip-muted">
          Likely range {gw(row.band[0])} – {gw(row.band[1])}
        </p>
      )}
    </div>
  );
}

export function DeliveryDayChart({ view, showActuals }: { view: DecisionView; showActuals: boolean }) {
  const theme = useChartTheme();
  const gradientId = useId().replace(/:/g, "");
  const data = useMemo(() => mergeSeries(view, showActuals), [view, showActuals]);
  const y = useMemo(() => niceTicks(data.flatMap((r) => [r.forecast, r.actual, ...(r.band ?? [])])), [data]);
  const start = new Date(view.delivery_start).getTime();
  const end = new Date(view.delivery_end).getTime();
  const ticks = useMemo(() => {
    const out = [];
    for (let t = start; t <= end; t += 3 * HOUR_MS) out.push(t);
    return out;
  }, [start, end]);

  return (
    <>
      <ChartLegend
        items={[
          { label: "Forecast at gate closure", color: theme.forecast, kind: "line" },
          ...(showActuals
            ? [
                { label: "Outturn", color: theme.actual, kind: "line" as const },
                { label: "Short of forecast", color: theme.short, kind: "area" as const },
                { label: "Above forecast", color: theme.surplus, kind: "area" as const },
              ]
            : []),
          { label: "Likely range (P10–P90)", color: theme.band, kind: "area" },
        ]}
      />
      <div className="chart" style={{ height: 380 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={theme.forecast} stopOpacity={0.16} />
                <stop offset="100%" stopColor={theme.forecast} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[start, end]}
              ticks={ticks}
              tickFormatter={formatTime}
              stroke={theme.grid}
              tick={{ fill: theme.muted, fontSize: 12 }}
              tickLine={false}
              tickMargin={8}
            />
            <YAxis
              domain={y.domain}
              ticks={y.ticks}
              tickFormatter={(v: number) => `${v} GW`}
              tick={{ fill: theme.muted, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <Tooltip content={ChartTooltip} cursor={{ stroke: theme.muted, strokeDasharray: "3 3" }} />
            <Area dataKey="band" stroke="none" fill={theme.band} connectNulls isAnimationActive={false} />
            {!showActuals && (
              <Area
                dataKey="forecast"
                stroke="none"
                fill={`url(#${gradientId})`}
                connectNulls
                isAnimationActive={false}
              />
            )}
            {showActuals && (
              <Area dataKey="short" stroke="none" fill={theme.short} connectNulls isAnimationActive={false} />
            )}
            {showActuals && (
              <Area
                dataKey="surplus"
                stroke="none"
                fill={theme.surplus}
                connectNulls
                isAnimationActive={false}
              />
            )}
            <Line
              dataKey="forecast"
              stroke={theme.forecast}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: theme.surface }}
              connectNulls
              isAnimationActive={false}
            />
            {showActuals && (
              <Line
                dataKey="actual"
                stroke={theme.actual}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: theme.surface }}
                connectNulls
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
