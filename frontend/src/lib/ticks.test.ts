import { niceTicks } from "./ticks";

describe("niceTicks", () => {
  it("uses half-GW steps for small ranges", () => {
    expect(niceTicks([1.3, 2.2])).toEqual({ domain: [0, 2.5], ticks: [0, 0.5, 1, 1.5, 2, 2.5] });
  });

  it("spans negative values and picks a wider step", () => {
    expect(niceTicks([-2.1, 2.2]).ticks).toEqual([-3, -2, -1, 0, 1, 2, 3]);
  });

  it("grows the step for generation-sized values", () => {
    expect(niceTicks([9.4, 18.7])).toEqual({ domain: [0, 20], ticks: [0, 5, 10, 15, 20] });
  });

  it("ignores missing values and handles empty input", () => {
    expect(niceTicks([null, undefined]).ticks).toEqual([0, 0.5, 1]);
  });
});
