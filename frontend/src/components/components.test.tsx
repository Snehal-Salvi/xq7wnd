import { render, screen } from "@testing-library/react";
import type { AccuracyReport, DecisionView } from "../api/types";
import accuracy from "../test/fixtures/accuracy.json";
import decision from "../test/fixtures/decision.json";
import { headline, heroStatement } from "../lib/insights";
import { mergeSeries } from "./charts/DeliveryDayChart";
import { GateClosureTimeline, positionPct } from "./GateClosureTimeline";

const view = decision as DecisionView;

describe("positionPct", () => {
  it("maps times onto the strip and clamps outside it", () => {
    expect(positionPct(50, 0, 100)).toBe(50);
    expect(positionPct(-10, 0, 100)).toBe(0);
    expect(positionPct(150, 0, 100)).toBe(100);
    expect(positionPct(5, 10, 10)).toBe(0);
  });
});

describe("mergeSeries", () => {
  it("puts hourly forecasts and half-hourly outturn on one time axis", () => {
    const rows = mergeSeries(view, true);
    expect(rows).toHaveLength(48);
    expect(rows.filter((r) => r.forecast !== undefined)).toHaveLength(24);
    expect(rows[0]).toMatchObject({ t: Date.parse("2026-01-02T00:00:00Z"), forecast: 18.699 });
    expect(rows[0]?.band?.[0]).toBeLessThan(18.699);
    // Half-hour outturn rows carry their hour's forecast for the tooltip.
    expect(rows[1]?.forecast).toBeUndefined();
    expect(rows[1]?.hourForecast).toBe(18.699);
    expect(rows.every((r, i) => i === 0 || r.t > rows[i - 1]!.t)).toBe(true);
    // Shading follows the forecast line: interpolated between hours, none after the last hour.
    expect(rows[1]?.forecastAt).toBeCloseTo((rows[0]!.forecast! + rows[2]!.forecast!) / 2);
    expect(rows.at(-1)?.short).toBeUndefined();
  });

  it("omits outturn when hidden", () => {
    expect(mergeSeries(view, false).some((r) => r.actual !== undefined)).toBe(false);
  });
});

describe("GateClosureTimeline", () => {
  it("labels publish, gate closure and the lead-time span", () => {
    render(
      <GateClosureTimeline
        decisionDate={view.decision_date}
        publishTime={view.forecast_publish_time}
        decisionTime={view.decision_time}
        deliveryStart={view.delivery_start}
        deliveryEnd={view.delivery_end}
      />,
    );
    expect(screen.getByText("Forecast published 09:30")).toBeInTheDocument();
    expect(screen.getByText("Gate closure 09:50")).toBeInTheDocument();
    expect(screen.getByText("14 h 10 min to 37 h 10 min", { exact: false })).toBeInTheDocument();
  });
});

describe("heroStatement", () => {
  it("leads with the direction and frequency of the miss", () => {
    const m = (accuracy as AccuracyReport).overall!;
    expect(heroStatement(m)).toMatch(
      /^The forecast promised more wind than arrived in \d+% of January’s hours\.$/,
    );
    expect(heroStatement({ ...m, bias: 500, over_forecast_share: 0.3 })).toBe(
      "The wind beat its forecast in 70% of January’s hours.",
    );
  });
});

describe("headline", () => {
  it("states the typical miss and the direction of bias", () => {
    const m = (accuracy as AccuracyReport).overall!;
    expect(headline(m, "09:50")).toMatch(
      /missed outturn by 3\.2 GW in a typical hour, and ran above it \d+% of the time/,
    );
  });
});
