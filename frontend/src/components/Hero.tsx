import type { AccuracyReport } from "../api/types";
import { formatPower, formatRange } from "../lib/format";
import { heroStatement } from "../lib/insights";
import { DayStrip } from "./DayStrip";
import { WindField } from "./WindField";

export type View = "day" | "accuracy";

const TABS: { id: View; label: string }[] = [
  { id: "day", label: "Delivery day" },
  { id: "accuracy", label: "Forecast accuracy" },
];

interface Props {
  view: View;
  onView: (v: View) => void;
  report: AccuracyReport | undefined;
  gateClosure: string;
  selectedDate: string | null;
  onSelectDate: (decisionDate: string) => void;
}

export function Hero({ view, onView, report, gateClosure, selectedDate, onSelectDate }: Props) {
  const m = report?.overall;
  return (
    <header className="hero">
      <WindField />
      <div className="hero-inner">
        <div className="hero-bar">
          <p className="brand">
            <svg viewBox="0 0 32 32" aria-hidden className="brand-mark">
              <path d="M4 20c4-8 7-8 11 0s7 8 11 0" />
              <path d="M4 12c4-6 7-6 11 0s7 6 11 0" />
            </svg>
            Wind Position
          </p>
          <nav className="tabs" aria-label="Views">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className="tab"
                aria-current={view === t.id ? "page" : undefined}
                onClick={() => onView(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        <p className="hero-context">GB national wind, day-ahead purchases, January 2026</p>
        <h1 className="hero-title">
          {m ? heroStatement(m) : "Replaying every January purchase decision against the wind that arrived."}
        </h1>

        <dl className="hero-stats">
          <div>
            <dt>Typical miss per hour</dt>
            <dd>{m ? formatPower(m.mae) : "–"}</dd>
          </div>
          <div>
            <dt>Average bias</dt>
            <dd>{m ? formatPower(m.bias, { signed: true }) : "–"}</dd>
          </div>
          <div>
            <dt>8 in 10 hours within</dt>
            <dd>{m ? formatRange(m.p10, m.p90) : "–"}</dd>
          </div>
          <div>
            <dt>Gate closure</dt>
            <dd>{gateClosure} UK</dd>
          </div>
        </dl>

        <div className="hero-strip">
          <p className="hero-strip-title">
            Typical miss by delivery day
            <span>{view === "day" ? "Select a day to inspect it" : "Select a day to open it"}</span>
          </p>
          <DayStrip daily={report?.daily} selected={selectedDate} onSelect={onSelectDate} />
        </div>
      </div>
    </header>
  );
}
