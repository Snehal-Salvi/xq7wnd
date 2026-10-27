export interface LegendItem {
  label: string;
  color: string;
  kind: "line" | "area" | "bar";
}

/** HTML legend above a chart: wraps on narrow screens and keeps text in ink, not series colour. */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="legend" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label}>
          <span className={`legend-key legend-key--${i.kind}`} style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
