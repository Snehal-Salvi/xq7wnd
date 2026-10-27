/**
 * Round axis ticks for values in GW: picks a 0.5/1/2/5 GW step so there are
 * roughly 4–6 gridlines, and a domain that starts and ends on a tick.
 */
export function niceTicks(values: Array<number | null | undefined>, { includeZero = true } = {}) {
  const finite = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  let lo = finite.length ? Math.min(...finite) : 0;
  let hi = finite.length ? Math.max(...finite) : 1;
  if (includeZero) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  if (hi === lo) hi = lo + 1;
  const step = [0.5, 1, 2, 5, 10].find((s) => (hi - lo) / s <= 6) ?? 10;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= end + 1e-9; t += step) ticks.push(Math.round(t * 10) / 10);
  return { domain: [start, end] as [number, number], ticks };
}
