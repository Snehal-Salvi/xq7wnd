import {
  formatDate,
  formatDay,
  formatDuration,
  formatEnergy,
  formatPercent,
  formatPower,
  formatRange,
  formatTime,
} from "./format";

describe("formatPower", () => {
  it.each([
    [1995.6, {}, "2.0 GW"],
    [640, {}, "0.64 GW"],
    [-1728, { signed: true }, "−1.7 GW"],
    [502.7, { signed: true }, "+0.50 GW"],
    [null, {}, "–"],
  ])("%s → %s", (mw, opts, expected) => {
    expect(formatPower(mw, opts)).toBe(expected);
  });
});

describe("formatRange", () => {
  it("keeps sign and one decimal on both ends", () => {
    expect(formatRange(-3412, 484)).toBe("−3.4 to +0.5 GW");
    expect(formatRange(-4183.9, 502.7)).toBe("−4.2 to +0.5 GW");
  });
});

describe("market time", () => {
  it("shows UTC instants in UK local time, including summer time", () => {
    expect(formatTime("2026-01-14T09:50:00Z")).toBe("09:50");
    expect(formatTime("2026-07-01T08:50:00Z")).toBe("09:50");
  });

  it("formats a calendar date without shifting it across timezones", () => {
    expect(formatDate("2026-01-14")).toBe("Wed 14 Jan");
  });

  it("names the UK day of an instant (BST midnight is 23:00 UTC the day before)", () => {
    expect(formatDay("2026-06-30T23:00:00Z")).toBe("Wed 1 Jul");
  });
});

describe("other formats", () => {
  it("energy, percent and duration", () => {
    expect(formatEnergy(312_345)).toBe("312.3 GWh");
    expect(formatPercent(0.7516)).toBe("75%");
    expect(formatDuration(20)).toBe("20 min");
    expect(formatDuration(850)).toBe("14 h 10 min");
    expect(formatDuration(120)).toBe("2 h");
  });
});
