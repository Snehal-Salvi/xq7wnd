import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyAccuracy, HistogramBin, HorizonReport, HourAccuracy } from "../../api/types";
import { formatDate, formatPower } from "../../lib/format";
import { ChartLegend } from "./ChartLegend";
import { niceTicks } from "../../lib/ticks";
import { useChartTheme, type ChartTheme } from "../../lib/useChartTheme";

// Charts plot GW (not MW) so the axis chooses round ticks in the unit it shows.
const toGW = (mw: number | null | undefined) => (mw === null || mw === undefined ? null : mw / 1000);
const showGW = (gw: unknown, signed = false) => formatPower(Number(gw) * 1000, { signed });
const hourLabel = (h: unknown) => `${String(h).padStart(2, "0")}:00`;
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function useAxes(theme: ChartTheme) {
  const common = { stroke: theme.muted, tick: { fill: theme.muted, fontSize: 12 }, tickLine: false } as const;
  return {
    x: common,
    y: { ...common, axisLine: false, width: 56, tickFormatter: (v: number) => `${v} GW` },
    tooltip: {
      contentStyle: {
        background: theme.surface,
        border: `1px solid ${theme.grid}`,
        borderRadius: 6,
        fontSize: 13,
      },
      labelStyle: { color: theme.ink, fontWeight: 600 },
      itemStyle: { color: theme.ink },
    },
  };
}

/** One bar per delivery day: how far the gate-closure forecast missed, on average. */
export function DailyErrorChart({
  daily,
  onSelect,
}: {
  daily: DailyAccuracy[];
  onSelect?: (decisionDate: string) => void;
}) {
  const theme = useChartTheme();
  const a = useAxes(theme);
  const data = daily.map((d) => ({
    date: d.decision_date,
    delivery: d.delivery_date,
    mae: toGW(d.metrics?.mae),
  }));
  const y = niceTicks(data.map((d) => d.mae));
  return (
    <div className="chart" style={{ height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={theme.grid} vertical={false} />
          <XAxis
            dataKey="delivery"
            tickFormatter={(d: string) => shortDate.format(new Date(`${d}T12:00:00Z`))}
            interval={6}
            {...a.x}
          />
          <YAxis {...a.y} domain={y.domain} ticks={y.ticks} />
          <Tooltip
            {...a.tooltip}
            labelFormatter={(d) => `Delivery ${formatDate(String(d))}`}
            formatter={(v) => [showGW(v), "Mean absolute error"]}
            cursor={{ fill: theme.highlight }}
          />
          <Bar
            dataKey="mae"
            fill={theme.forecast}
            radius={[3, 3, 0, 0]}
            cursor={onSelect ? "pointer" : undefined}
            onClick={(entry: { payload?: { date: string } }) =>
              entry.payload && onSelect?.(entry.payload.date)
            }
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Mean error (bias) and MAE by hour of the delivery day. Same unit, one axis. */
export function HourProfileChart({ byHour }: { byHour: HourAccuracy[] }) {
  const theme = useChartTheme();
  const a = useAxes(theme);
  const data = byHour.map((h) => ({ hour: h.hour, bias: toGW(h.metrics.bias), mae: toGW(h.metrics.mae) }));
  const y = niceTicks(data.flatMap((d) => [d.bias, d.mae]));
  return (
    <>
      <ChartLegend
        items={[
          { label: "Average miss (outturn − forecast)", color: theme.actual, kind: "bar" },
          { label: "Mean absolute error", color: theme.forecast, kind: "line" },
        ]}
      />
      <div className="chart" style={{ height: 240 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis dataKey="hour" tickFormatter={hourLabel} interval={3} {...a.x} />
            <YAxis {...a.y} domain={y.domain} ticks={y.ticks} />
            <ReferenceLine y={0} stroke={theme.muted} />
            <Tooltip
              {...a.tooltip}
              labelFormatter={hourLabel}
              formatter={(v, name) => [showGW(v, name !== "Mean absolute error"), name]}
              cursor={{ fill: theme.highlight }}
            />
            <Bar
              dataKey="bias"
              name="Average miss (outturn − forecast)"
              fill={theme.actual}
              radius={2}
              isAnimationActive={false}
            />
            <Line
              dataKey="mae"
              name="Mean absolute error"
              stroke={theme.forecast}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/** Distribution of hourly misses on a true numeric GW axis, with zero marked. */
export function ErrorHistogram({ bins }: { bins: HistogramBin[] }) {
  const theme = useChartTheme();
  const a = useAxes(theme);
  const data = bins.map((b) => ({
    mid: (b.lower + b.upper) / 2000,
    lower: b.lower,
    upper: b.upper,
    count: b.count,
  }));
  const lo = Math.floor((bins[0]?.lower ?? 0) / 1000);
  const hi = Math.ceil((bins.at(-1)?.upper ?? 0) / 1000);
  const ticks = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  return (
    <div className="chart" style={{ height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={data} barCategoryGap={1} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={theme.grid} vertical={false} />
          <XAxis
            dataKey="mid"
            type="number"
            domain={[lo, hi]}
            ticks={ticks}
            interval={ticks.length > 10 ? 1 : 0}
            tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}`.replace("-", "−")}
            {...a.x}
          />
          <YAxis {...a.x} axisLine={false} width={56} allowDecimals={false} />
          <ReferenceLine x={0} stroke={theme.ink} strokeDasharray="3 3" />
          <Tooltip
            {...a.tooltip}
            labelFormatter={(_, p) => {
              const b = p?.[0]?.payload as { lower: number; upper: number } | undefined;
              return b
                ? `${formatPower(b.lower, { signed: true })} to ${formatPower(b.upper, { signed: true })}`
                : "";
            }}
            formatter={(v) => [`${String(v)} hours`, "Count"]}
            cursor={{ fill: theme.highlight }}
          />
          <Bar dataKey="count" fill={theme.forecast} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** MAE against lead time, with the band of lead times a day-ahead decision actually uses. */
export function HorizonChart({ report }: { report: HorizonReport }) {
  const theme = useChartTheme();
  const a = useAxes(theme);
  const half = report.bucket_hours / 2;
  const data = report.buckets.map((b) => ({
    lead: (b.lead_from_h + b.lead_to_h) / 2,
    mae: toGW(b.metrics.mae),
  }));
  const [from, to] = report.decision_lead_range_h;
  const y = niceTicks(data.map((d) => d.mae));
  return (
    <div className="chart" style={{ height: 280 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 16, left: 0 }}>
          <CartesianGrid stroke={theme.grid} vertical={false} />
          <ReferenceArea
            x1={from}
            x2={to}
            fill={theme.highlight}
            label={{ value: "Day-ahead decisions", position: "insideTop", fill: theme.muted, fontSize: 12 }}
          />
          <XAxis
            dataKey="lead"
            type="number"
            domain={[0, 72]}
            ticks={[0, 12, 24, 36, 48, 60, 72]}
            tickFormatter={(h: number) => `${h} h`}
            label={{
              value: "Hours between forecast and delivery",
              position: "insideBottom",
              dy: 14,
              fill: theme.muted,
              fontSize: 12,
            }}
            {...a.x}
          />
          <YAxis {...a.y} domain={y.domain} ticks={y.ticks} />
          <Tooltip
            {...a.tooltip}
            labelFormatter={(h) => `${Number(h) - half}–${Number(h) + half} h ahead`}
            formatter={(v) => [showGW(v), "Mean absolute error"]}
          />
          <Line
            dataKey="mae"
            stroke={theme.forecast}
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, fill: theme.surface }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
