import { useMemo } from "react";
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
import { ChartLegend } from "./ChartLegend";
import { niceTicks } from "../../lib/ticks";
import { useChartTheme } from "../../lib/useChartTheme";

/** Values are in GW so the axis picks round ticks in the unit it displays. */
export interface ChartRow {
  t: number;
  forecast?: number;
  band?: [number, number];
  actual?: number;
  /** Forecast for the hour containing t, for tooltips on half-hour outturn points. */
  hourForecast?: number;
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
  for (const r of sorted) r.hourForecast = rows.get(Math.floor(r.t / HOUR_MS) * HOUR_MS)?.forecast;
  return sorted;
}

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as ChartRow;
  const gw = (v: number, signed = false) => formatPower(v * 1000, { signed });
  const forecast = row.forecast ?? row.hourForecast;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-title">{formatTime(Number(label))}</p>
      {forecast !== undefined && (
        <p>
          <span className="swatch swatch--forecast" /> Forecast {gw(forecast)}
          {row.forecast === undefined && <span className="chart-tooltip-muted"> (hourly)</span>}
        </p>
      )}
      {row.band && (
        <p className="chart-tooltip-muted">
          Likely range {gw(row.band[0])} – {gw(row.band[1])}
        </p>
      )}
      {row.actual !== undefined && (
        <p>
          <span className="swatch swatch--actual" /> Outturn {gw(row.actual)}
        </p>
      )}
      {row.actual !== undefined && forecast !== undefined && (
        <p className="chart-tooltip-muted">Miss {gw(row.actual - forecast, true)}</p>
      )}
    </div>
  );
}

export function DeliveryDayChart({ view, showActuals }: { view: DecisionView; showActuals: boolean }) {
  const theme = useChartTheme();
  const data = useMemo(() => mergeSeries(view, showActuals), [view, showActuals]);
  const y = useMemo(() => niceTicks(data.flatMap((r) => [r.forecast, r.actual, ...(r.band ?? [])])), [data]);
  const start = new Date(view.delivery_start).getTime();
  const end = new Date(view.delivery_end).getTime();
  const ticks = useMemo(() => {
    const out = [];
    for (let t = start; t <= end; t += 3 * 3_600_000) out.push(t);
    return out;
  }, [start, end]);

  return (
    <>
      <ChartLegend
        items={[
          { label: "Forecast at gate closure", color: theme.forecast, kind: "line" },
          { label: "Likely range (P10–P90)", color: theme.band, kind: "area" },
          ...(showActuals ? [{ label: "Outturn", color: theme.actual, kind: "line" as const }] : []),
        ]}
      />
      <div className="chart" style={{ height: 360 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[start, end]}
              ticks={ticks}
              tickFormatter={formatTime}
              stroke={theme.muted}
              tick={{ fill: theme.muted, fontSize: 12 }}
              tickLine={false}
            />
            <YAxis
              domain={y.domain}
              ticks={y.ticks}
              tickFormatter={(v: number) => `${v} GW`}
              stroke={theme.muted}
              tick={{ fill: theme.muted, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <Tooltip content={ChartTooltip} cursor={{ stroke: theme.muted, strokeDasharray: "3 3" }} />
            <Area
              dataKey="band"
              name="Likely range (P10–P90)"
              stroke="none"
              fill={theme.band}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              dataKey="forecast"
              name="Forecast at gate closure"
              stroke={theme.forecast}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            {showActuals && (
              <Line
                dataKey="actual"
                name="Outturn"
                stroke={theme.actual}
                strokeWidth={2}
                dot={false}
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
