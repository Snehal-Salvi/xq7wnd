import { useQuery } from "@tanstack/react-query";
import type { AccuracyReport, DecisionView, HorizonReport, Meta } from "./types";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function getJson<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T> {
  const query = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined),
  ).toString();
  const res = await fetch(`${BASE}${path}${query ? `?${query}` : ""}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* non-JSON error body: keep the generic message */
    }
    throw new ApiError(detail, res.status);
  }
  return (await res.json()) as T;
}

// Historical data does not change while the page is open.
const STATIC = { staleTime: Infinity, gcTime: 30 * 60_000 } as const;

export const useMeta = () =>
  useQuery({ queryKey: ["meta"], queryFn: () => getJson<Meta>("/api/meta"), ...STATIC });

export const useDecision = (date: string | undefined, gateClosure: string | undefined) =>
  useQuery({
    queryKey: ["decision", date, gateClosure],
    queryFn: () => getJson<DecisionView>(`/api/decisions/${date}`, { gate_closure: gateClosure }),
    enabled: Boolean(date),
    placeholderData: (prev) => prev, // keep the last chart on screen while stepping days
    ...STATIC,
  });

export const useAccuracy = (gateClosure: string | undefined) =>
  useQuery({
    queryKey: ["accuracy", gateClosure],
    queryFn: () => getJson<AccuracyReport>("/api/accuracy", { gate_closure: gateClosure }),
    placeholderData: (prev) => prev,
    ...STATIC,
  });

export const useHorizon = (bucketHours: number) =>
  useQuery({
    queryKey: ["horizon", bucketHours],
    queryFn: () => getJson<HorizonReport>("/api/accuracy/horizon", { bucket_hours: String(bucketHours) }),
    ...STATIC,
  });
