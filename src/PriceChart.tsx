import { useCallback, useRef, useState } from "react";
import type { ChartRange, ChartSeriesPoint } from "./yahoo";
import "./PriceChart.css";

function formatAxisDate(ts: number, range: ChartRange): string {
  const d = new Date(ts * 1000);
  if (range === "1D") {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  if (range === "1W") {
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }
  if (range === "1M" || range === "3M") {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function formatPrice(n: number) {
  if (n >= 1000) return n.toFixed(2);
  if (n >= 100) return n.toFixed(2);
  if (n >= 10) return n.toFixed(2);
  return n.toFixed(4);
}

function interpolateAt(
  series: ChartSeriesPoint[],
  fracIndex: number
): { close: number; time: number } | null {
  const n = series.length;
  if (n < 2) return null;
  const fi = Math.max(0, Math.min(n - 1, fracIndex));
  const i0 = Math.floor(fi);
  const i1 = Math.min(i0 + 1, n - 1);
  const t = fi - i0;
  const close = series[i0].close * (1 - t) + series[i1].close * t;
  const time = series[i0].time * (1 - t) + series[i1].time * t;
  return { close, time };
}

type Props = {
  series: ChartSeriesPoint[];
  range: ChartRange;
  positive: boolean;
};

const VB_W = 400;
const VB_H = 160;
const PAD = 8;

/** Full-width chart with date labels + hover crosshair / value. */
export function PriceChart({ series, range, positive }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{
    xSvg: number;
    ySvg: number;
    price: number;
    timeLabel: string;
  } | null>(null);

  const closes = series.map((p) => p.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;

  const d = series
    .map((p, i) => {
      const x = PAD + (i / (series.length - 1)) * (VB_W - 2 * PAD);
      const y = VB_H - PAD - ((p.close - min) / span) * (VB_H - 2 * PAD);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  const stroke = positive ? "var(--rh-green)" : "var(--rh-red)";

  const idx = (k: number) => Math.round((k * (series.length - 1)) / 4);
  const tickIndices = [0, idx(1), idx(2), idx(3), series.length - 1];
  const uniqueTicks = [...new Set(tickIndices)].sort((a, b) => a - b);

  const updateFromClientX = useCallback(
    (clientX: number) => {
      const el = wrapRef.current;
      if (!el || series.length < 2) return;
      const rect = el.getBoundingClientRect();
      const xPx = clientX - rect.left;
      if (xPx < 0 || xPx > rect.width) {
        setHover(null);
        return;
      }
      const xSvg = (xPx / rect.width) * VB_W;
      const innerW = VB_W - 2 * PAD;
      const clampedX = Math.max(PAD, Math.min(VB_W - PAD, xSvg));
      const fracIndex = ((clampedX - PAD) / innerW) * (series.length - 1);
      const interp = interpolateAt(series, fracIndex);
      if (!interp) return;
      const ySvg =
        VB_H - PAD - ((interp.close - min) / span) * (VB_H - 2 * PAD);
      setHover({
        xSvg: clampedX,
        ySvg,
        price: interp.close,
        timeLabel: formatAxisDate(interp.time, range),
      });
    },
    [series, range, min, span]
  );

  const onPointerMove = (e: React.PointerEvent) => {
    updateFromClientX(e.clientX);
  };

  const onPointerLeave = () => {
    setHover(null);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    updateFromClientX(e.clientX);
  };

  if (series.length < 2) {
    return (
      <div className="pc-empty">Not enough data for this range.</div>
    );
  }

  return (
    <div className="pc-wrap">
      <div className="pc-y-axis" aria-hidden>
        <span className="tabular">{formatPrice(max)}</span>
        <span className="tabular">{formatPrice(min)}</span>
      </div>
      <div
        className="pc-svg-wrap"
        ref={wrapRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onPointerDown={onPointerDown}
        onPointerCancel={onPointerLeave}
      >
        <div className="pc-svg-inner">
          <svg
            className="pc-svg"
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="Price chart — move or drag over chart to see price and time"
          >
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {hover && (
              <g className="pc-crosshair" pointerEvents="none">
                <line
                  x1={hover.xSvg}
                  x2={hover.xSvg}
                  y1={0}
                  y2={VB_H}
                  stroke="rgba(255, 255, 255, 0.4)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={hover.xSvg}
                  cy={hover.ySvg}
                  r={5}
                  fill={stroke}
                  stroke="var(--rh-bg)"
                  strokeWidth="1.5"
                />
              </g>
            )}
          </svg>
        </div>
        {hover && (
          <div
            className="pc-tooltip"
            style={{
              left: `${(hover.xSvg / VB_W) * 100}%`,
            }}
          >
            <span className="pc-tooltip-price tabular">{formatPrice(hover.price)}</span>
            <span className="pc-tooltip-time">{hover.timeLabel}</span>
          </div>
        )}
      </div>
      <div className="pc-dates" role="presentation">
        {uniqueTicks.map((i) => (
          <span key={i} className="pc-date tabular">
            {formatAxisDate(series[i].time, range)}
          </span>
        ))}
      </div>
    </div>
  );
}

export const CHART_RANGES: ChartRange[] = ["1D", "1W", "1M", "3M", "1Y", "5Y", "ALL"];
