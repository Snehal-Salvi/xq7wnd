import { useId } from "react";
import { formatDate } from "../lib/format";

const nextDay = (isoDate: string) => {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export function DayStepper({
  dates,
  value,
  onChange,
}: {
  dates: string[];
  value: string;
  onChange: (d: string) => void;
}) {
  const id = useId();
  const i = dates.indexOf(value);
  return (
    <div className="control">
      <label htmlFor={id}>Decision day</label>
      <div className="stepper">
        <button
          type="button"
          className="button button--icon"
          aria-label="Previous day"
          disabled={i <= 0}
          onClick={() => onChange(dates[i - 1]!)}
        >
          ‹
        </button>
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {dates.map((d) => (
            <option key={d} value={d}>
              {formatDate(d)}, for delivery {formatDate(nextDay(d))}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="button button--icon"
          aria-label="Next day"
          disabled={i < 0 || i >= dates.length - 1}
          onClick={() => onChange(dates[i + 1]!)}
        >
          ›
        </button>
      </div>
    </div>
  );
}

export function GateClosureInput({
  value,
  defaultValue,
  onChange,
}: {
  value: string;
  defaultValue: string;
  onChange: (t: string | null) => void;
}) {
  const id = useId();
  return (
    <div className="control">
      <label htmlFor={id}>Gate closure (UK time)</label>
      <div className="stepper">
        <input
          id={id}
          type="time"
          step={600}
          value={value}
          onChange={(e) =>
            e.target.value && onChange(e.target.value === defaultValue ? null : e.target.value)
          }
        />
        {value !== defaultValue && (
          <button type="button" className="button button--quiet" onClick={() => onChange(null)}>
            Reset to {defaultValue}
          </button>
        )}
      </div>
    </div>
  );
}
