import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "stonks-portfolio-v1";
export const STARTING_CASH = 10_000;

export type Holding = { symbol: string; shares: number };

export type PortfolioState = {
  cash: number;
  holdings: Holding[];
};

function load(): PortfolioState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { cash: STARTING_CASH, holdings: [] };
    }
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("cash" in parsed) ||
      !("holdings" in parsed)
    ) {
      return { cash: STARTING_CASH, holdings: [] };
    }
    const cash = Number((parsed as PortfolioState).cash);
    const holdings = (parsed as PortfolioState).holdings;
    if (!Number.isFinite(cash) || !Array.isArray(holdings)) {
      return { cash: STARTING_CASH, holdings: [] };
    }
    return {
      cash,
      holdings: holdings
        .filter(
          (h): h is Holding =>
            typeof h === "object" &&
            h !== null &&
            typeof (h as Holding).symbol === "string" &&
            typeof (h as Holding).shares === "number" &&
            (h as Holding).shares > 0
        )
        .map((h) => ({ symbol: h.symbol.toUpperCase(), shares: h.shares })),
    };
  } catch {
    return { cash: STARTING_CASH, holdings: [] };
  }
}

function save(state: PortfolioState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function usePortfolio() {
  const [state, setState] = useState<PortfolioState>(() => load());

  useEffect(() => {
    save(state);
  }, [state]);

  const buy = useCallback((symbol: string, shares: number, totalCost: number) => {
    const sym = symbol.toUpperCase();
    if (shares <= 0 || totalCost <= 0) return false;
    let ok = false;
    setState((s) => {
      if (s.cash < totalCost) return s;
      ok = true;
      const next = [...s.holdings];
      const i = next.findIndex((h) => h.symbol === sym);
      if (i >= 0) next[i] = { symbol: sym, shares: next[i].shares + shares };
      else next.push({ symbol: sym, shares });
      return { cash: s.cash - totalCost, holdings: next };
    });
    return ok;
  }, []);

  /** Sell at `pricePerShare` — proceeds are derived inside the update from actual shares sold so cash matches holdings (no phantom gain). */
  const sell = useCallback((symbol: string, sharesRequested: number, pricePerShare: number) => {
    const sym = symbol.toUpperCase();
    if (sharesRequested <= 0 || pricePerShare <= 0) return false;
    let ok = false;
    setState((s) => {
      const i = s.holdings.findIndex((h) => h.symbol === sym);
      if (i < 0) return s;
      const have = s.holdings[i].shares;
      const sellShares = Math.round(Math.min(sharesRequested, have) * 10000) / 10000;
      if (sellShares <= 0) return s;
      const proceeds = Math.round(sellShares * pricePerShare * 100) / 100;
      ok = true;
      const next = [...s.holdings];
      let remainder = Math.round((have - sellShares) * 10000) / 10000;
      if (remainder <= 1e-8) next.splice(i, 1);
      else next[i] = { symbol: sym, shares: remainder };
      return { cash: s.cash + proceeds, holdings: next };
    });
    return ok;
  }, []);

  const reset = useCallback(() => {
    setState({ cash: STARTING_CASH, holdings: [] });
  }, []);

  const holdingFor = useCallback(
    (symbol: string) => {
      const sym = symbol.toUpperCase();
      return state.holdings.find((h) => h.symbol === sym)?.shares ?? 0;
    },
    [state.holdings]
  );

  return useMemo(
    () => ({ ...state, buy, sell, reset, holdingFor }),
    [state, buy, sell, reset, holdingFor]
  );
}
