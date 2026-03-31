/** Shared math for order size (not position — that’s only from Buy/Sell). */

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Max shares affordable with cash at this price. */
export function maxBuyShares(cash: number, price: number): number {
  if (price <= 0 || cash <= 0) return 0;
  return Math.floor((cash / price) * 10000) / 10000;
}

/** Upper bound for the order field: can’t exceed max buy or current position (for sell). */
export function maxOrderShares(maxBuy: number, own: number): number {
  return round4(Math.max(maxBuy, own));
}

export function formatQtyDisplay(v: number): string {
  if (v === 0) return "0";
  const s = v.toFixed(4);
  return s.replace(/\.?0+$/, "") || "0";
}

export function incQty(v: number, maxOrder: number): number {
  if (maxOrder <= 0) return 0;
  const step = maxOrder >= 1 ? 1 : Math.min(0.01, maxOrder);
  return round4(Math.min(v + step, maxOrder));
}

export function decQty(v: number): number {
  if (v <= 0) return 0;
  const step = v > 1 ? 1 : Math.min(0.01, v);
  return round4(Math.max(v - step, 0));
}
