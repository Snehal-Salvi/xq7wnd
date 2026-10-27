import { useDecision } from "../api/client";
import type { DecisionView } from "../api/types";
import { DeliveryDayChart } from "../components/charts/DeliveryDayChart";
import { DayNav, GateClosureInput, Switch } from "../components/Controls";
import { Figures, type Figure } from "../components/Figures";
import { GateClosureTimeline } from "../components/GateClosureTimeline";
import { ErrorBlock, LoadingBlock } from "../components/Status";
import {
  formatDate,
  formatDay,
  formatDuration,
  formatEnergy,
  formatPercent,
  formatPower,
  formatRange,
  formatTime,
} from "../lib/format";

interface Props {
  dates: string[];
  date: string;
  gateClosure: string;
  defaultGateClosure: string;
  showActuals: boolean;
  onChange: (patch: Record<string, string | null>) => void;
}

function decisionFigures(v: DecisionView): Figure[] {
  const band = v.band_quantiles;
  return [
    {
      label: "Forecast in force",
      value: v.forecast_publish_time ? formatTime(v.forecast_publish_time) : "None",
      note:
        v.forecast_age_minutes !== null
          ? `Published ${formatDuration(v.forecast_age_minutes)} before gate closure`
          : undefined,
    },
    {
      label: "Wind energy forecast",
      value: formatEnergy(v.forecast_energy_mwh),
      note: `Across ${v.forecast_points.length} delivery hours`,
    },
    {
      label: "Likely miss per hour",
      value: band ? formatRange(band[0], band[1]) : "–",
      note: "8 in 10 January hours fell in this range",
    },
  ];
}

function outturnFigures(v: DecisionView): Figure[] {
  const shortfallShare =
    v.over_forecast_mwh !== null && v.forecast_energy_mwh > 0
      ? v.over_forecast_mwh / v.forecast_energy_mwh
      : null;
  return [
    {
      label: "Wind energy delivered",
      value: formatEnergy(v.actual_energy_mwh),
      note: "Metered outturn",
    },
    {
      label: "Typical miss per hour",
      value: formatPower(v.metrics?.mae),
      note: v.metrics ? `${formatPower(v.metrics.bias, { signed: true })} on balance` : undefined,
    },
    {
      label: "Wind short of forecast",
      value: formatEnergy(v.over_forecast_mwh),
      note: shortfallShare !== null ? `${formatPercent(shortfallShare)} of the forecast energy` : undefined,
      tone: "short",
    },
  ];
}

function DataTable({ view }: { view: DecisionView }) {
  return (
    <details className="disclosure">
      <summary>Hourly numbers</summary>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Hour</th>
              <th scope="col">Forecast</th>
              <th scope="col">Likely range</th>
              <th scope="col">Outturn</th>
              <th scope="col">Miss</th>
            </tr>
          </thead>
          <tbody>
            {view.forecast_points.map((p) => (
              <tr key={p.time}>
                <th scope="row">{formatTime(p.time)}</th>
                <td>{formatPower(p.forecast)}</td>
                <td>
                  {p.band_low !== null ? `${formatPower(p.band_low)} – ${formatPower(p.band_high)}` : "–"}
                </td>
                <td>{formatPower(p.actual)}</td>
                <td className={p.error !== null && p.error < 0 ? "is-short" : undefined}>
                  {formatPower(p.error, { signed: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function DecisionPage({ dates, date, gateClosure, defaultGateClosure, showActuals, onChange }: Props) {
  const query = useDecision(date, gateClosure === defaultGateClosure ? undefined : gateClosure);
  const view = query.data;

  return (
    <section aria-labelledby="decision-heading" className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Decision on {formatDate(date)}</p>
          <h2 id="decision-heading" className="page-title">
            {view ? `Delivery ${formatDay(view.delivery_start)}` : "Delivery day"}
          </h2>
        </div>
        <div className="toolbar">
          <DayNav dates={dates} value={date} onChange={(d) => onChange({ date: d })} />
          <GateClosureInput
            value={gateClosure}
            defaultValue={defaultGateClosure}
            onChange={(g) => onChange({ gate: g })}
          />
          <Switch
            checked={showActuals}
            onChange={(on) => onChange({ outturn: on ? null : "off" })}
            label="Compare with outturn"
          />
        </div>
      </div>

      {query.isError && <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />}
      {!view && query.isPending && <LoadingBlock label="Loading the forecast for this day…" />}

      {view && (
        <div className={query.isFetching ? "is-refreshing" : undefined}>
          <GateClosureTimeline
            decisionDate={view.decision_date}
            publishTime={view.forecast_publish_time}
            decisionTime={view.decision_time}
            deliveryStart={view.delivery_start}
            deliveryEnd={view.delivery_end}
          />

          <div className={showActuals ? "figure-groups" : "figure-groups figure-groups--single"}>
            <Figures label="At gate closure" items={decisionFigures(view)} />
            {showActuals && <Figures label="After delivery" items={outturnFigures(view)} />}
          </div>

          <article className="panel panel--chart">
            <div className="panel-head">
              <h3>Forecast against what the wind delivered</h3>
              <p>
                Hourly forecast in force at gate closure, half-hourly outturn. Shading between the lines shows
                wind that fell short of forecast or came in above it.
              </p>
            </div>
            <DeliveryDayChart view={view} showActuals={showActuals} />
            <DataTable view={view} />
          </article>
        </div>
      )}
    </section>
  );
}
