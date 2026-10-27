import { useSyncExternalStore } from "react";

// Recharts writes colours as SVG attributes, so read the resolved CSS tokens
// once per colour scheme rather than relying on var() inside attributes.

export interface ChartTheme {
  forecast: string;
  actual: string;
  band: string;
  ink: string;
  muted: string;
  grid: string;
  surface: string;
  highlight: string;
}

const query = typeof window !== "undefined" ? window.matchMedia?.("(prefers-color-scheme: dark)") : undefined;

const subscribe = (notify: () => void) => {
  query?.addEventListener("change", notify);
  return () => query?.removeEventListener("change", notify);
};

let cached: { dark: boolean; theme: ChartTheme } | undefined;

function read(): ChartTheme {
  const dark = Boolean(query?.matches);
  if (cached?.dark === dark) return cached.theme;
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const theme = {
    forecast: v("--forecast", "#2a78d6"),
    actual: v("--actual", "#eb6834"),
    band: v("--band", "rgba(42,120,214,0.16)"),
    ink: v("--ink", "#14212b"),
    muted: v("--muted", "#5b6b76"),
    grid: v("--grid", "#e3e9ec"),
    surface: v("--surface", "#ffffff"),
    highlight: v("--highlight", "rgba(20,33,43,0.06)"),
  };
  cached = { dark, theme };
  return theme;
}

export const useChartTheme = () => useSyncExternalStore(subscribe, read, read);
