/** Shared currency / percent helpers for UI. */

export function formatMoney(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function pctChange(price: number, prev: number) {
  if (prev === 0) return 0;
  return ((price - prev) / prev) * 100;
}
