import { useAccuracy, useHorizon } from "../api/client";
import type { ErrorMetrics, HorizonReport } from "../api/types";
import {
  DailyErrorChart,
  ErrorHistogram,
  HorizonChart,
  HourProfileChart,
} from "../components/charts/AccuracyCharts";
import { GateClosureInput } from "../components/Controls";
import { Figures } from "../components/Figures";
import { ErrorBlock, LoadingBlock } from "../components/Status";
import { formatPower, formatPercent } from "../lib/format";

interface Props {
  gateClosure: string;
  defaultGateClosure: string;
  onChange: (patch: Record<string, string | null>) => void;
  onOpenDay: (decisionDate: string) => void;
}

/** The finding, in one sentence a buyer can repeat. */
export function headline(m: ErrorMetrics, gateClosure: string): string {
  const direction = m.bias < 0 ? "above" : "below";
  const share = m.bias < 0 ? m.over_forecast_share : 1 - m.over_forecast_share;
  return (
    `In January, the wind forecast in force at ${gateClosure} missed outturn by ${formatPower(m.mae)} ` +
    `in a typical hour, and ran ${direction} it ${formatPercent(share)} of the time.`
  );
}

function horizonNote(report: HorizonReport): string | null {
  const first = report.buckets[0];
  const [from, to] = report.decision_lead_range_h;
  const inWindow = report.buckets.filter((b) => b.lead_from_h < to && b.lead_to_h > from);
  if (!first || inWindow.length === 0) return null;
  const avg = inWindow.reduce((s, b) => s + b.metrics.mae, 0) / inWindow.length;
  return (
    `Day-ahead purchases rely on forecasts ${Math.round(from)}–${Math.round(to)} h out, where the typical miss is ` +
    `${formatPower(avg)}, against ${formatPower(first.metrics.mae)} for the freshest forecasts.`
  );
}

export function AccuracyPage({ gateClosure, defaultGateClosure, onChange, onOpenDay }: Props) {
  const accuracy = useAccuracy(gateClosure === defaultGateClosure ? undefined : gateClosure);
  const horizon = useHorizon(3);
  const report = accuracy.data;
  const m = report?.overall;

  return (
    <section aria-labelledby="accuracy-heading">
      <div className="page-intro">
        <h2 id="accuracy-heading">How much to trust the forecast</h2>
        <p>
          Every January purchase decision replayed: the forecast in force at gate closure against what the
          wind actually delivered, hour by hour.
        </p>
      </div>

      <div className="controls">
        <GateClosureInput
          value={gateClosure}
          defaultValue={defaultGateClosure}
          onChange={(g) => onChange({ gate: g })}
        />
      </div>

      {accuracy.isError && <ErrorBlock error={accuracy.error} onRetry={() => void accuracy.refetch()} />}
      {!report && accuracy.isPending && <LoadingBlock label="Replaying January’s decisions…" />}

      {report && m && (
        <div className={accuracy.isFetching ? "is-refreshing" : undefined}>
          <p className="headline">{headline(m, gateClosure)}</p>
          <Figures
            label="January summary"
            items={[
              {
                label: "Mean absolute error",
                value: formatPower(m.mae),
                note: `${formatPercent(m.nmae)} of average outturn`,
              },
              { label: "Root mean square error", value: formatPower(m.rmse), note: "Weights the big misses" },
              {
                label: "Average miss",
                value: formatPower(m.bias, { signed: true }),
                note: "Negative: forecast too high",
              },
              {
                label: "8 in 10 hours within",
                value: `${formatPower(m.p10, { signed: true })} to ${formatPower(m.p90, { signed: true })}`,
                note: `${m.n} hours compared`,
              },
            ]}
          />

          <div className="chart-grid">
            <article className="panel">
              <h3>Typical miss by delivery day</h3>
              <p className="panel-note">Select a bar to open that day.</p>
              <DailyErrorChart daily={report.daily} onSelect={onOpenDay} />
            </article>
            <article className="panel">
              <h3>Where the misses fall</h3>
              <p className="panel-note">Hours by size of miss, outturn minus forecast, in GW.</p>
              <ErrorHistogram bins={report.histogram} />
            </article>
            <article className="panel">
              <h3>Misses by hour of the day</h3>
              <p className="panel-note">Bars below zero mean the forecast ran high at that hour.</p>
              <HourProfileChart byHour={report.by_hour} />
            </article>
            <article className="panel">
              <h3>Fresher forecasts miss less</h3>
              {horizon.data ? (
                <>
                  <p className="panel-note">{horizonNote(horizon.data)}</p>
                  <HorizonChart report={horizon.data} />
                </>
              ) : horizon.isError ? (
                <ErrorBlock error={horizon.error} onRetry={() => void horizon.refetch()} />
              ) : (
                <LoadingBlock label="Loading lead-time analysis…" height={280} />
              )}
            </article>
          </div>

          <details className="method">
            <summary>How these numbers are calculated</summary>
            <ul>
              <li>
                Data: Elexon BMRS. Outturn is half-hourly <code>FUELHH</code> generation for fuel type WIND;
                forecasts are hourly <code>WINDFOR</code> publications (about eight a day, each looking up to
                three days ahead).
              </li>
              <li>
                For each January decision day, the forecast used for an hour of the next day is the latest one
                published at or before gate closure (09:50 UK time for the GB day-ahead auction, adjustable
                above).
              </li>
              <li>
                Forecast and outturn are compared on the hours where both exist. Miss = outturn − forecast, so
                a negative number means the forecast promised more wind than arrived.
              </li>
              <li>
                The likely range is the 10th–90th percentile of all January misses at that gate closure. It is
                measured on the same month it is shown on, so it describes January rather than predicting
                February.
              </li>
            </ul>
          </details>
        </div>
      )}
    </section>
  );
}
