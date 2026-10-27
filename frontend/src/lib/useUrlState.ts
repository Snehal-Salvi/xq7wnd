import { useCallback, useSyncExternalStore } from "react";

// Keeps view state in the query string so any screen can be shared as a link.

const subscribe = (notify: () => void) => {
  window.addEventListener("popstate", notify);
  return () => window.removeEventListener("popstate", notify);
};
const snapshot = () => window.location.search;

export function useUrlState(): [URLSearchParams, (patch: Record<string, string | null>) => void] {
  const search = useSyncExternalStore(subscribe, snapshot, () => "");
  const update = useCallback((patch: Record<string, string | null>) => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const next = params.toString();
    window.history.pushState(null, "", next ? `?${next}` : window.location.pathname);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);
  return [new URLSearchParams(search), update];
}
