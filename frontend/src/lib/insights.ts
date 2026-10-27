import type { ErrorMetrics } from "../api/types";
import { formatPercent, formatPower } from "./format";

/** The finding, in one sentence a buyer can repeat. */
export function headline(m: ErrorMetrics, gateClosure: string): string {
  const direction = m.bias < 0 ? "above" : "below";
  const share = m.bias < 0 ? m.over_forecast_share : 1 - m.over_forecast_share;
  return (
    `In January, the wind forecast in force at ${gateClosure} missed outturn by ${formatPower(m.mae)} ` +
    `in a typical hour, and ran ${direction} it ${formatPercent(share)} of the time.`
  );
}

/** Short hero statement: which way the forecast leans, and how often. */
export function heroStatement(m: ErrorMetrics): string {
  return m.bias < 0
    ? `The forecast promised more wind than arrived in ${formatPercent(m.over_forecast_share)} of January’s hours.`
    : `The wind beat its forecast in ${formatPercent(1 - m.over_forecast_share)} of January’s hours.`;
}
