import { useDecision } from "../api/client";
import type { DecisionView } from "../api/types";
import { DeliveryDayChart } from "../components/charts/DeliveryDayChart";
import { DayStepper, GateClosureInput } from "../components/Controls";
import { Figures, type Figure } from "../components/Figures";
import { GateClosureTimeline } from "../components/GateClosureTimeline";
import { ErrorBlock, LoadingBlock } from "../components/Status";
import { formatDayTime, formatDuration, formatEnergy, formatPower, formatTime } from "../lib/format";

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
      value: v.forecast_publish_time ? `Published ${formatTime(v.forecast_publish_time)}` : "None available",
      note:
        v.forecast_age_minutes !== null
          ? `${formatDuration(v.forecast_age_minutes)} before gate closure`
          : undefined,
    },
    {
      label: "Forecast wind energy",
      value: formatEnergy(v.forecast_energy_mwh),
      note: `Across ${v.forecast_points.length} hours of delivery`,
    },
    {
      label: "Likely range per hour",
      value: band
        ? `${formatPower(band[0], { signed: true })} to ${formatPower(band[1], { signed: true })}`
        : "–",
      note: "Outturn vs forecast, 8 in 10 January hours",
    },
  ];
}

function outturnFigures(v: DecisionView): Figure[] {
  return [
    {
      label: "Outturn wind energy",
      value: formatEnergy(v.actual_energy_mwh),
      note: "Metered after delivery",
    },
    {
      label: "Average miss",
      value: formatPower(v.metrics?.mae),
      note: v.metrics ? `${formatPower(v.metrics.bias, { signed: true })} on balance` : undefined,
    },
    {
      label: "Wind short of forecast",
      value: formatEnergy(v.over_forecast_mwh),
      note: "Energy that had to be bought later",
    },
  ];
}

function DataTable({ view }: { view: DecisionView }) {
  return (
    <details className="data-table">
      <summary>Show the hourly numbers</summary>
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
                <td>{formatPower(p.error, { signed: true })}</td>
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
    <section aria-labelledby="decision-heading">
      <div className="page-intro">
        <h2 id="decision-heading">What the wind forecast said when the purchase was made</h2>
        <p>
          Pick the day the day-ahead purchase was committed. You’ll see the latest forecast that existed at
          gate closure for each hour of the following day, and how far outturn tends to stray from it.
        </p>
      </div>

      <div className="controls">
        <DayStepper dates={dates} value={date} onChange={(d) => onChange({ date: d })} />
        <GateClosureInput
          value={gateClosure}
          defaultValue={defaultGateClosure}
          onChange={(g) => onChange({ gate: g })}
        />
        <label className="toggle">
          <input
            type="checkbox"
            checked={showActuals}
            onChange={(e) => onChange({ outturn: e.target.checked ? null : "off" })}
          />
          Compare with outturn
        </label>
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
          <Figures label="At gate closure" items={decisionFigures(view)} />
          {showActuals && <Figures label="After delivery" items={outturnFigures(view)} />}
          <DeliveryDayChart view={view} showActuals={showActuals} />
          <p className="chart-caption">
            Times in UK local time. Gate closure {formatDayTime(view.decision_time)}. The shaded range is the
            forecast plus the 10th–90th percentile of January’s gate-closure misses.
          </p>
          <DataTable view={view} />
        </div>
      )}
    </section>
  );
}
