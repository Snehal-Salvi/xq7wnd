import { formatDate, formatDay, formatDuration, formatTime } from "../lib/format";

interface Props {
  decisionDate: string;
  publishTime: string | null;
  decisionTime: string;
  deliveryStart: string;
  deliveryEnd: string;
}

/** Position of `t` along [start, end] as a percentage, clamped to the strip. */
export function positionPct(t: number, start: number, end: number): number {
  if (end <= start) return 0;
  return Math.min(100, Math.max(0, ((t - start) / (end - start)) * 100));
}

const HOUR = 3_600_000;

/**
 * Strip from midnight on the decision day to the end of the delivery day, showing
 * when the forecast was published, when the purchase must be committed, and which
 * hours it covers. It makes the 14–38 h lead time of a day-ahead decision visible.
 */
export function GateClosureTimeline({
  decisionDate,
  publishTime,
  decisionTime,
  deliveryStart,
  deliveryEnd,
}: Props) {
  const start = new Date(deliveryStart).getTime() - 24 * HOUR;
  const end = new Date(deliveryEnd).getTime();
  const gate = new Date(decisionTime).getTime();
  const published = publishTime ? new Date(publishTime).getTime() : null;
  const pos = (t: number) => `${positionPct(t, start, end)}%`;
  const leadFrom = (new Date(deliveryStart).getTime() - gate) / 60_000;
  const leadTo = (end - HOUR - gate) / 60_000;

  return (
    <figure className="timeline" aria-label="Decision timeline">
      <div className="timeline-track">
        <div
          className="timeline-day timeline-day--decision"
          style={{ left: 0, width: pos(new Date(deliveryStart).getTime()) }}
        >
          <span>
            <b>Decision day</b> {formatDate(decisionDate)}
          </span>
        </div>
        <div
          className="timeline-day timeline-day--delivery"
          style={{ left: pos(new Date(deliveryStart).getTime()), right: 0 }}
        >
          <span>
            <b>Delivery day</b> {formatDay(deliveryStart)}
          </span>
        </div>
        <div className="timeline-lead" style={{ left: pos(gate), right: 0 }} aria-hidden />
        {published !== null && (
          <div className="timeline-marker timeline-marker--publish" style={{ left: pos(published) }}>
            <span className="timeline-label timeline-label--above">
              Forecast published {formatTime(published)}
            </span>
          </div>
        )}
        <div className="timeline-marker timeline-marker--gate" style={{ left: pos(gate) }}>
          <span className="timeline-label timeline-label--below">Gate closure {formatTime(gate)}</span>
        </div>
      </div>
      <figcaption>
        The purchase is committed at gate closure, so every hour of the delivery day is forecast{" "}
        <strong>
          {formatDuration(leadFrom)} to {formatDuration(leadTo)}
        </strong>{" "}
        ahead.
      </figcaption>
    </figure>
  );
}
