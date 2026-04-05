import { useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";

const STORAGE_KEY = "stonks-portfolio-v1";
export const STARTING_CASH = 10_000;
export const MIN_STARTING_CASH = 100;

export type Holding = { symbol: string; shares: number };

export type PortfolioState = {
  cash: number;
  holdings: Holding[];
  /** Baseline for PnL and reset; chosen on first start. */
  startingCash: number;
  /** False until user picks starting capital (nothing saved until then). */
  started: boolean;
};

function defaultFresh(): PortfolioState {
  return {
    cash: 0,
    holdings: [],
    startingCash: STARTING_CASH,
    started: false,
  };
}

function load(): PortfolioState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultFresh();
    }
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("cash" in parsed) ||
      !("holdings" in parsed)
    ) {
      return defaultFresh();
    }
    const p = parsed as Record<string, unknown>;
    const cash = Number(p.cash);
    const holdings = p.holdings;
    if (!Number.isFinite(cash) || !Array.isArray(holdings)) {
      return defaultFresh();
    }
    const started = typeof p.started === "boolean" ? p.started : true;
    const startingCashRaw = p.startingCash;
    const startingCash =
      typeof startingCashRaw === "number" &&
      Number.isFinite(startingCashRaw) &&
      startingCashRaw > 0
        ? startingCashRaw
        : STARTING_CASH;

    const normalizeSavedSymbol = (s: string) => {
      const u = s.toUpperCase();
      if (u === "MMC") return "MRSH";
      return u;
    };

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
        .map((h) => ({ symbol: normalizeSavedSymbol((h as Holding).symbol), shares: h.shares })),
      startingCash,
      started,
    };
  } catch {
    return defaultFresh();
  }
}

function save(state: PortfolioState) {
  if (!state.started) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function usePortfolio() {
  const [state, setState] = useState<PortfolioState>(() => load());

  useEffect(() => {
    save(state);
  }, [state]);

  const startGame = useCallback((initialCash: number) => {
    const clamped = Math.max(MIN_STARTING_CASH, initialCash);
    const n = Math.round(clamped * 100) / 100;
    setState({ cash: n, holdings: [], startingCash: n, started: true });
  }, []);

  const buy = useCallback((symbol: string, shares: number, totalCost: number) => {
    const sym = symbol.toUpperCase();
    if (shares <= 0 || totalCost <= 0) return false;
    let ok = false;
    // Updater must run before we read `ok` — otherwise `return ok` is always false (React may defer updaters).
    flushSync(() => {
      setState((s) => {
        if (!s.started || s.cash + 1e-8 < totalCost) return s;
        ok = true;
        const next = [...s.holdings];
        const i = next.findIndex((h) => h.symbol === sym);
        if (i >= 0) next[i] = { symbol: sym, shares: next[i].shares + shares };
        else next.push({ symbol: sym, shares });
        return { ...s, cash: s.cash - totalCost, holdings: next };
      });
    });
    return ok;
  }, []);

  /** Sell at `pricePerShare` — proceeds are derived inside the update from actual shares sold so cash matches holdings (no phantom gain). */
  const sell = useCallback((symbol: string, sharesRequested: number, pricePerShare: number) => {
    const sym = symbol.toUpperCase();
    if (sharesRequested <= 0 || pricePerShare <= 0) return false;
    let ok = false;
    flushSync(() => {
      setState((s) => {
        if (!s.started) return s;
        const i = s.holdings.findIndex((h) => h.symbol === sym);
        if (i < 0) return s;
        const have = s.holdings[i].shares;
        const sellShares = Math.round(Math.min(sharesRequested, have) * 10000) / 10000;
        if (sellShares <= 0) return s;
        const proceeds = Math.round(sellShares * pricePerShare * 100) / 100;
        ok = true;
        const next = [...s.holdings];
        const remainder = Math.round((have - sellShares) * 10000) / 10000;
        if (remainder <= 1e-8) next.splice(i, 1);
        else next[i] = { symbol: sym, shares: remainder };
        return { ...s, cash: s.cash + proceeds, holdings: next };
      });
    });
    return ok;
  }, []);

  const reset = useCallback(() => {
    setState((s) => ({
      ...s,
      cash: s.startingCash,
      holdings: [],
      started: true,
    }));
  }, []);

  /** Clears saved game so the starting-cash screen shows again (nothing saved until they start). */
  const backToSetup = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setState(defaultFresh());
  }, []);

  const holdingFor = useCallback(
    (symbol: string) => {
      const sym = symbol.toUpperCase();
      return state.holdings.find((h) => h.symbol === sym)?.shares ?? 0;
    },
    [state.holdings]
  );

  return useMemo(
    () => ({
      ...state,
      buy,
      sell,
      reset,
      startGame,
      backToSetup,
      holdingFor,
    }),
    [state, buy, sell, reset, startGame, backToSetup, holdingFor]
  );
}
