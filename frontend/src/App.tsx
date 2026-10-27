import { lazy, Suspense } from "react";
import { useAccuracy, useMeta } from "./api/client";
import { Hero, type View } from "./components/Hero";
import { ErrorBlock, LoadingBlock } from "./components/Status";
import { trimSeconds } from "./lib/format";
import { useUrlState } from "./lib/useUrlState";

// Pages load on demand so the first paint doesn't wait for the charting library.
const DecisionPage = lazy(() => import("./pages/DecisionPage").then((m) => ({ default: m.DecisionPage })));
const AccuracyPage = lazy(() => import("./pages/AccuracyPage").then((m) => ({ default: m.AccuracyPage })));

export function App() {
  const meta = useMeta();
  const [params, update] = useUrlState();
  const view: View = params.get("view") === "accuracy" ? "accuracy" : "day";

  // The hero always summarises the standard 09:50 gate closure.
  const summary = useAccuracy(undefined);

  const dates = meta.data?.decision_dates ?? [];
  const defaultGate = meta.data ? trimSeconds(meta.data.default_gate_closure) : "09:50";
  const gate = params.get("gate") ?? defaultGate;
  const requested = params.get("date");
  const date = requested && dates.includes(requested) ? requested : (dates.at(-1) ?? "");

  return (
    <>
      <Hero
        view={view}
        onView={(v) => update({ view: v === "day" ? null : v })}
        report={summary.data}
        gateClosure={defaultGate}
        selectedDate={view === "day" && date ? date : null}
        onSelectDate={(d) => update({ view: null, date: d })}
      />

      <main className="shell">
        {meta.isError && <ErrorBlock error={meta.error} onRetry={() => void meta.refetch()} />}
        {meta.isPending && <LoadingBlock label="Connecting to the forecast service…" />}
        {meta.data && (
          <Suspense fallback={<LoadingBlock label="Loading…" />}>
            {view === "accuracy" ? (
              <AccuracyPage
                gateClosure={gate}
                defaultGateClosure={defaultGate}
                onChange={update}
                onOpenDay={(d) => update({ view: null, date: d })}
              />
            ) : (
              <DecisionPage
                dates={dates}
                date={date}
                gateClosure={gate}
                defaultGateClosure={defaultGate}
                showActuals={params.get("outturn") !== "off"}
                onChange={update}
              />
            )}
          </Suspense>
        )}
      </main>

      <footer className="footer shell">
        <span>Data: Elexon BMRS, FUELHH outturn and WINDFOR forecasts for national GB wind.</span>
        <span>All times UK local.</span>
      </footer>
    </>
  );
}
