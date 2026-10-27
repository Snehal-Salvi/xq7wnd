import { useAccuracy, useHorizon } from "../api/client";
import type { HorizonReport } from "../api/types";
import {
  DailyEnergyChart,
  ErrorHistogram,
  HorizonChart,
  HourProfileChart,
} from "../components/charts/AccuracyCharts";
import { GateClosureInput } from "../components/Controls";
import { Figures } from "../components/Figures";
import { ErrorBlock, LoadingBlock } from "../components/Status";
import { formatPercent, formatPower, formatRange } from "../lib/format";
import { headline } from "../lib/insights";

interface Props {
  gateClosure: string;
  defaultGateClosure: string;
  onChange: (patch: Record<string, string | null>) => void;
  onOpenDay: (decisionDate: string) => void;
}

function horizonNote(report: HorizonReport): string | null {
  const first = report.buckets[0];
  const [from, to] = report.decision_lead_range_h;
  const inWindow = report.buckets.filter((b) => b.lead_from_h < to && b.lead_to_h > from);
  if (!first || inWindow.length === 0) return null;
  const avg = inWindow.reduce((s, b) => s + b.metrics.mae, 0) / inWindow.length;
  return (
    `Day-ahead purchases rely on forecasts ${Math.round(from)}–${Math.round(to)} h out, where the typical miss ` +
    `is ${formatPower(avg)}, against ${formatPower(first.metrics.mae)} for the freshest forecasts.`
  );
}

export function AccuracyPage({ gateClosure, defaultGateClosure, onChange, onOpenDay }: Props) {
  const accuracy = useAccuracy(gateClosure === defaultGateClosure ? undefined : gateClosure);
  const horizon = useHorizon(3);
  const report = accuracy.data;
  const m = report?.overall;

  return (
    <section aria-labelledby="accuracy-heading" className="page">
      <div className="page-head">
        <div>
          <h2 id="accuracy-heading" className="page-title">
            How much to trust the forecast
          </h2>
          <p className="page-lede">
            {m
              ? headline(m, gateClosure)
              : "Every January purchase decision replayed against the wind that actually arrived."}
          </p>
        </div>
        <div className="toolbar">
          <GateClosureInput
            value={gateClosure}
            defaultValue={defaultGateClosure}
            onChange={(g) => onChange({ gate: g })}
          />
        </div>
      </div>

      {accuracy.isError && <ErrorBlock error={accuracy.error} onRetry={() => void accuracy.refetch()} />}
      {!report && accuracy.isPending && <LoadingBlock label="Replaying January’s decisions…" />}

      {report && m && (
        <div className={accuracy.isFetching ? "is-refreshing" : undefined}>
          <div className="figure-groups figure-groups--single">
            <Figures
              label={`January at ${gateClosure} gate closure`}
              items={[
                {
                  label: "Mean absolute error",
                  value: formatPower(m.mae),
                  note: `${formatPercent(m.nmae)} of average outturn`,
                },
                {
                  label: "Root mean square error",
                  value: formatPower(m.rmse),
                  note: "Weights the big misses",
                },
                {
                  label: "Average miss",
                  value: formatPower(m.bias, { signed: true }),
                  note: "Negative means the forecast ran high",
                  tone: m.bias < 0 ? "short" : undefined,
                },
                {
                  label: "8 in 10 hours within",
                  value: formatRange(m.p10, m.p90),
                  note: `${m.n} hours compared`,
                },
              ]}
            />
          </div>

          <div className="chart-grid">
            <article className="panel panel--wide">
              <div className="panel-head">
                <h3>Energy the forecast missed, day by day</h3>
                <p>Wind energy short of forecast hangs below the line. Select a day to open it.</p>
              </div>
              <DailyEnergyChart daily={report.daily} onSelect={onOpenDay} />
            </article>
            <article className="panel">
              <div className="panel-head">
                <h3>Where the misses fall</h3>
                <p>Hours by size of miss, outturn minus forecast, in GW.</p>
              </div>
              <ErrorHistogram bins={report.histogram} />
            </article>
            <article className="panel">
              <div className="panel-head">
                <h3>Misses by hour of the day</h3>
                <p>Bars below zero mean the forecast ran high at that hour.</p>
              </div>
              <HourProfileChart byHour={report.by_hour} />
            </article>
            <article className="panel panel--wide">
              <div className="panel-head">
                <h3>Fresher forecasts miss less</h3>
                <p>
                  {horizon.data ? horizonNote(horizon.data) : "Error by how far ahead the forecast was made."}
                </p>
              </div>
              {horizon.data ? (
                <HorizonChart report={horizon.data} />
              ) : horizon.isError ? (
                <ErrorBlock error={horizon.error} onRetry={() => void horizon.refetch()} />
              ) : (
                <LoadingBlock label="Loading lead-time analysis…" height={280} />
              )}
            </article>
          </div>

          <details className="disclosure">
            <summary>How these numbers are calculated</summary>
            <ul className="method">
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
