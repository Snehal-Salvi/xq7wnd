import { useSyncExternalStore } from "react";

// Recharts writes colours as SVG attributes, so read the resolved CSS tokens
// once per colour scheme rather than relying on var() inside attributes.

export interface ChartTheme {
  forecast: string;
  actual: string;
  band: string;
  short: string;
  surplus: string;
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
    band: v("--band", "rgba(93,112,130,0.14)"),
    short: v("--short", "rgba(235,104,52,0.26)"),
    surplus: v("--surplus", "rgba(42,120,214,0.2)"),
    ink: v("--ink", "#102a43"),
    muted: v("--muted", "#5d7082"),
    grid: v("--grid", "#e4eaef"),
    surface: v("--surface", "#ffffff"),
    highlight: v("--highlight", "rgba(16,42,67,0.05)"),
  };
  cached = { dark, theme };
  return theme;
}

export const useChartTheme = () => useSyncExternalStore(subscribe, read, read);
