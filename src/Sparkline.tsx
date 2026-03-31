import "./Sparkline.css";

type Props = {
  points: number[];
  positive: boolean;
  /** compact = row chip; expanded = detail panel */
  size?: "sm" | "lg";
};

/** Robinhood-style price line — green if last >= first, else red. */
export function Sparkline({ points, positive, size = "sm" }: Props) {
  const w = size === "lg" ? 320 : 72;
  const h = size === "lg" ? 120 : 32;
  const pad = size === "lg" ? 6 : 2;

  if (points.length < 2) {
    return (
      <div
        className={`spark spark--empty spark--${size}`}
        style={{ width: size === "lg" ? "100%" : w, height: h }}
        aria-hidden
      />
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;

  const d = points
    .map((p, i) => {
      const x = pad + (i / (points.length - 1)) * (w - 2 * pad);
      const y = h - pad - ((p - min) / span) * (h - 2 * pad);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const stroke = positive ? "var(--rh-green)" : "var(--rh-red)";

  return (
    <svg
      className={`spark spark--${size}`}
      viewBox={`0 0 ${w} ${h}`}
      width={size === "lg" ? "100%" : w}
      height={h}
      preserveAspectRatio={size === "lg" ? "none" : "xMidYMid meet"}
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={size === "lg" ? 2 : 1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
