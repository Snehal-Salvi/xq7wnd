// All market times are shown in UK local time, whatever the viewer's own timezone.
export const MARKET_TZ = "Europe/London";

const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: MARKET_TZ, hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: MARKET_TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const dayTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: MARKET_TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatTime = (iso: string | number) => timeFmt.format(new Date(iso));
export const formatDayTime = (iso: string | number) => dayTimeFmt.format(new Date(iso));

/** "2026-01-14" (a calendar date, not an instant) → "Wed 14 Jan". */
export const formatDate = (isoDate: string) => dayFmt.format(new Date(`${isoDate}T12:00:00Z`));

/** An instant → its UK calendar day, e.g. "2026-01-15T00:00:00Z" → "Thu 15 Jan". */
export const formatDay = (iso: string | number) => dayFmt.format(new Date(iso));

/** MW shown as GW: two decimals under 1 GW, else one. 1995.6 → "2.0 GW", 640 → "0.64 GW". */
export function formatPower(mw: number | null | undefined, { signed = false } = {}): string {
  if (mw === null || mw === undefined || Number.isNaN(mw)) return "–";
  const gw = mw / 1000;
  const digits = Math.abs(gw) < 1 ? 2 : 1;
  const text = gw.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const sign = signed && gw > 0 ? "+" : "";
  return `${sign}${text.replace("-", "−")} GW`;
}

export function formatEnergy(mwh: number | null | undefined): string {
  if (mwh === null || mwh === undefined) return "–";
  return `${(mwh / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} GWh`;
}

export const formatPercent = (fraction: number | null | undefined, digits = 0) =>
  fraction === null || fraction === undefined ? "–" : `${(fraction * 100).toFixed(digits)}%`;

/** Minutes → "20 min" or "2 h 10 min". */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "–";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

/** "09:50:00" → "09:50". */
export const trimSeconds = (t: string) => t.slice(0, 5);
