import type { KeyboardEvent } from "react";
import type { DailyAccuracy } from "../api/types";
import { formatDate, formatPower } from "../lib/format";

interface Props {
  daily: DailyAccuracy[] | undefined;
  selected: string | null;
  onSelect: (decisionDate: string) => void;
}

/**
 * January at a glance: one column per delivery day, height = typical forecast miss.
 * Doubles as the day picker. Arrow keys move between days.
 */
export function DayStrip({ daily, selected, onSelect }: Props) {
  const max = Math.max(1, ...(daily ?? []).map((d) => d.metrics?.mae ?? 0));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!daily || !selected || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    const i = daily.findIndex((d) => d.decision_date === selected);
    const next = daily[i + (e.key === "ArrowRight" ? 1 : -1)];
    if (next) {
      e.preventDefault();
      onSelect(next.decision_date);
      requestAnimationFrame(() =>
        document.querySelector<HTMLButtonElement>(`[data-day="${next.decision_date}"]`)?.focus(),
      );
    }
  };

  if (!daily) return <div className="day-strip day-strip--loading" aria-hidden />;

  return (
    <div className="day-strip" role="group" aria-label="Delivery days in January" onKeyDown={onKeyDown}>
      {daily.map((d) => {
        const mae = d.metrics?.mae ?? 0;
        const isSelected = d.decision_date === selected;
        const label = `${formatDate(d.delivery_date)}: typical miss ${formatPower(mae)}`;
        return (
          <button
            key={d.decision_date}
            type="button"
            data-day={d.decision_date}
            className="day-strip-day"
            aria-pressed={isSelected}
            aria-label={label}
            title={label}
            tabIndex={isSelected || (!selected && d === daily[0]) ? 0 : -1}
            onClick={() => onSelect(d.decision_date)}
          >
            <span className="day-strip-track">
              <span className="day-strip-bar" style={{ height: `${Math.max(6, (mae / max) * 100)}%` }} />
            </span>
            <span className="day-strip-label">{Number(d.delivery_date.slice(8))}</span>
          </button>
        );
      })}
    </div>
  );
}
