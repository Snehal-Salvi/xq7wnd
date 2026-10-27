import { lazy, Suspense } from "react";
import { useMeta } from "./api/client";
import type { Meta } from "./api/types";
import { ErrorBlock, LoadingBlock } from "./components/Status";
import { trimSeconds } from "./lib/format";
import { useUrlState } from "./lib/useUrlState";

// Pages load on demand so the first paint doesn't wait for the charting library.
const DecisionPage = lazy(() => import("./pages/DecisionPage").then((m) => ({ default: m.DecisionPage })));
const AccuracyPage = lazy(() => import("./pages/AccuracyPage").then((m) => ({ default: m.AccuracyPage })));

type View = "day" | "accuracy";

const TABS: { id: View; label: string }[] = [
  { id: "day", label: "Delivery day" },
  { id: "accuracy", label: "Forecast accuracy" },
];

interface ContentProps {
  meta: Meta;
  view: View;
  params: URLSearchParams;
  update: (patch: Record<string, string | null>) => void;
}

function Content({ meta, view, params, update }: ContentProps) {
  const dates = meta.decision_dates;
  const defaultGate = trimSeconds(meta.default_gate_closure);
  const gate = params.get("gate") ?? defaultGate;
  const requested = params.get("date");
  const date = requested && dates.includes(requested) ? requested : (dates.at(-1) ?? "");

  if (view === "accuracy") {
    return (
      <AccuracyPage
        gateClosure={gate}
        defaultGateClosure={defaultGate}
        onChange={update}
        onOpenDay={(d) => update({ view: null, date: d })}
      />
    );
  }
  return (
    <DecisionPage
      dates={dates}
      date={date}
      gateClosure={gate}
      defaultGateClosure={defaultGate}
      showActuals={params.get("outturn") !== "off"}
      onChange={update}
    />
  );
}

export function App() {
  const meta = useMeta();
  const [params, update] = useUrlState();
  const view: View = params.get("view") === "accuracy" ? "accuracy" : "day";

  return (
    <div className="shell">
      <header className="masthead">
        <div>
          <h1>Wind Position</h1>
          <p className="tagline">
            GB wind forecasts for day-ahead power purchases. Pilot covering January 2026.
          </p>
        </div>
        <nav className="tabs" aria-label="Views">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="tab"
              aria-current={view === t.id ? "page" : undefined}
              onClick={() => update({ view: t.id === "day" ? null : t.id })}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {meta.isError && <ErrorBlock error={meta.error} onRetry={() => void meta.refetch()} />}
        {meta.isPending && <LoadingBlock label="Connecting to the forecast service…" />}
        {meta.data && (
          <Suspense fallback={<LoadingBlock label="Loading…" />}>
            <Content meta={meta.data} view={view} params={params} update={update} />
          </Suspense>
        )}
      </main>

      <footer className="footer">
        Data: Elexon BMRS (FUELHH outturn, WINDFOR forecasts), national GB wind. All times UK local.
      </footer>
    </div>
  );
}
