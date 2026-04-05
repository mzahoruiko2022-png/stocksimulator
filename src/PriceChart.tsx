import { useCallback, useMemo, useRef, useState } from "react";
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

/** Y-axis span for portfolio $ totals: pad so small % moves aren’t a flat line; keep min ≥ 0 when data is. */
function computeYExtent(
  closes: number[],
  variant: "default" | "portfolio"
): { min: number; max: number; span: number } {
  if (closes.length < 2) {
    return { min: 0, max: 1, span: 1 };
  }
  const rawMin = Math.min(...closes);
  const rawMax = Math.max(...closes);
  if (variant !== "portfolio") {
    const span = Math.max(rawMax - rawMin, 1e-12);
    return { min: rawMin, max: rawMax, span };
  }
  const span0 = rawMax - rawMin;
  const mid = (rawMin + rawMax) / 2;
  const magnitude = Math.max(Math.abs(rawMin), Math.abs(rawMax), Math.abs(mid), 1);
  const pad = Math.max(span0 * 0.12, magnitude * 0.0001);
  let vmin = rawMin - pad;
  const vmax = rawMax + pad;
  if (vmin < 0 && rawMin >= 0) vmin = Math.max(0, rawMin - pad * 0.85);
  const span = vmax - vmin;
  if (span < 1e-9) {
    const bump = Math.max(magnitude * 1e-8, 1);
    return { min: rawMin - bump, max: rawMax + bump, span: Math.max(2 * bump, 1e-12) };
  }
  return { min: vmin, max: vmax, span };
}

/** Axis ticks for large dollar ranges — avoids “10,000,000” twice when min/max differ slightly. */
function formatPortfolioAxis(n: number, span: number): string {
  const abs = Math.abs(n);
  if (span >= 1e9 || abs >= 1e9) return `$${(n / 1e9).toFixed(3)}B`;
  if (span >= 1e6 || abs >= 1e6) return `$${(n / 1e6).toFixed(3)}M`;
  if (span >= 1e3 || abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function formatPortfolioTooltip(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
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
  /** Portfolio totals: padded Y-axis + clearer $ labels so huge balances still show movement. */
  variant?: "default" | "portfolio";
};

const VB_W = 400;
const VB_H = 160;
const PAD = 8;

/** Full-width chart with date labels + hover crosshair / value. */
export function PriceChart({ series, range, positive, variant = "default" }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{
    xSvg: number;
    ySvg: number;
    price: number;
    timeLabel: string;
  } | null>(null);

  const { min, max, span } = useMemo(() => {
    const closes = series.map((p) => p.close);
    return computeYExtent(closes, variant);
  }, [series, variant]);

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

  const formatYLabel = (v: number) =>
    variant === "portfolio" ? formatPortfolioAxis(v, span) : formatPrice(v);
  const formatHoverPrice = (v: number) =>
    variant === "portfolio" ? formatPortfolioTooltip(v) : formatPrice(v);

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
        <span className="tabular">{formatYLabel(max)}</span>
        <span className="tabular">{formatYLabel(min)}</span>
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
            <span className="pc-tooltip-price tabular">{formatHoverPrice(hover.price)}</span>
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
