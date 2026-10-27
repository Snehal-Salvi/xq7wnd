import type { ReactNode } from "react";

export interface Figure {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  /** "short" marks a figure about wind that fell short of forecast. */
  tone?: "short";
}

/** A titled group of key numbers. A definition list: the numbers are the content. */
export function Figures({ items, label }: { items: Figure[]; label: string }) {
  return (
    <section className="figure-group" aria-label={label}>
      <h3 className="figure-group-title">{label}</h3>
      <dl className="figures">
        {items.map((f) => (
          <div key={f.label} className={f.tone ? `figure figure--${f.tone}` : "figure"}>
            <dt>{f.label}</dt>
            <dd>
              <span className="figure-value">{f.value}</span>
              {f.note && <span className="figure-note">{f.note}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
