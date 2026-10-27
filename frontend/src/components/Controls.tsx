import { useId } from "react";

export function DayNav({
  dates,
  value,
  onChange,
}: {
  dates: string[];
  value: string;
  onChange: (d: string) => void;
}) {
  const i = dates.indexOf(value);
  return (
    <div className="day-nav" role="group" aria-label="Step through decision days">
      <button
        type="button"
        className="icon-button"
        aria-label="Previous day"
        disabled={i <= 0}
        onClick={() => onChange(dates[i - 1]!)}
      >
        <svg viewBox="0 0 16 16" aria-hidden>
          <path d="M10 3 5 8l5 5" />
        </svg>
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Next day"
        disabled={i < 0 || i >= dates.length - 1}
        onClick={() => onChange(dates[i + 1]!)}
      >
        <svg viewBox="0 0 16 16" aria-hidden>
          <path d="m6 3 5 5-5 5" />
        </svg>
      </button>
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
      <label htmlFor={id}>Gate closure, UK time</label>
      <div className="control-row">
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
          <button type="button" className="text-button" onClick={() => onChange(null)}>
            Reset to {defaultValue}
          </button>
        )}
      </div>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden>
        <span className="switch-thumb" />
      </span>
      {label}
    </label>
  );
}
