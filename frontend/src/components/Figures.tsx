import type { ReactNode } from "react";

export interface Figure {
  label: string;
  value: ReactNode;
  note?: ReactNode;
}

/** A row of key numbers. A definition list, not cards: the numbers are the content. */
export function Figures({ items, label }: { items: Figure[]; label: string }) {
  return (
    <dl className="figures" aria-label={label}>
      {items.map((f) => (
        <div key={f.label} className="figure">
          <dt>{f.label}</dt>
          <dd>
            <span className="figure-value">{f.value}</span>
            {f.note && <span className="figure-note">{f.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
