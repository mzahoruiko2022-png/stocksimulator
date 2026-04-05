import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { companyBySymbol, COMPANIES } from "./companies";
import { CompanyAvatar } from "./CompanyAvatar";
import { CompanyDetail } from "./CompanyDetail";
import { TradeQtyStepper } from "./TradeQtyStepper";
import { maxBuyShares, maxOrderShares, round4 } from "./tradeQty";
import { CHART_RANGES, PriceChart } from "./PriceChart";
import { Sparkline } from "./Sparkline";
import {
  MIN_STARTING_CASH,
  STARTING_CASH,
  usePortfolio,
} from "./usePortfolio";
import {
  fetchQuotes,
  normalizeYahooChartSymbol,
  type ChartRange,
  type ChartSeriesPoint,
  type QuoteData,
} from "./yahoo";
import "./App.css";

function quoteForSymbol(quotes: Map<string, QuoteData>, symbol: string): QuoteData | undefined {
  const u = symbol.toUpperCase();
  return quotes.get(u) ?? quotes.get(normalizeYahooChartSymbol(u));
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function pctChange(price: number, prev: number) {
  if (prev === 0) return 0;
  return ((price - prev) / prev) * 100;
}

function sparkPositive(points: number[]) {
  if (points.length < 2) return true;
  return points[points.length - 1] >= points[0];
}

const PORTFOLIO_HISTORY_KEY = "stonks-portfolio-history-v2";
const LEGACY_PORTFOLIO_HISTORY_KEY = "stonks-portfolio-history-v1";
const MAX_PORTFOLIO_HISTORY = 144;

function isChartPoint(x: unknown): x is ChartSeriesPoint {
  return (
    typeof x === "object" &&
    x !== null &&
    "time" in x &&
    "close" in x &&
    typeof (x as ChartSeriesPoint).time === "number" &&
    typeof (x as ChartSeriesPoint).close === "number"
  );
}

function migrateV1NumbersToSeries(numbers: number[]): ChartSeriesPoint[] {
  const filtered = numbers
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
    .slice(-MAX_PORTFOLIO_HISTORY);
  if (filtered.length === 0) return [];
  const now = Math.floor(Date.now() / 1000);
  if (filtered.length === 1) {
    const c = filtered[0];
    return [
      { time: now - 60, close: c },
      { time: now, close: c },
    ];
  }
  const span = Math.max(3600, (filtered.length - 1) * 3600);
  const t0 = now - span;
  return filtered.map((close, i) => ({
    time: Math.floor(t0 + (i / (filtered.length - 1)) * span),
    close,
  }));
}

function loadPortfolioSeries(): ChartSeriesPoint[] {
  try {
    const v2 = localStorage.getItem(PORTFOLIO_HISTORY_KEY);
    if (v2) {
      const arr = JSON.parse(v2) as unknown;
      if (Array.isArray(arr)) {
        const pts = arr.filter(isChartPoint).slice(-MAX_PORTFOLIO_HISTORY);
        if (pts.length > 0) return pts;
      }
    }
    const v1 = localStorage.getItem(LEGACY_PORTFOLIO_HISTORY_KEY);
    if (v1) {
      const arr = JSON.parse(v1) as unknown;
      if (Array.isArray(arr)) {
        const nums = arr.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
        const migrated = migrateV1NumbersToSeries(nums);
        if (migrated.length >= 2) {
          try {
            localStorage.setItem(PORTFOLIO_HISTORY_KEY, JSON.stringify(migrated));
          } catch {
            /* ignore */
          }
        }
        try {
          localStorage.removeItem(LEGACY_PORTFOLIO_HISTORY_KEY);
        } catch {
          /* ignore */
        }
        return migrated;
      }
    }
  } catch {
    /* ignore */
  }
  return [];
}

function savePortfolioSeries(values: ChartSeriesPoint[]) {
  try {
    localStorage.setItem(PORTFOLIO_HISTORY_KEY, JSON.stringify(values));
  } catch {
    /* ignore quota */
  }
}

function portfolioPositive(series: ChartSeriesPoint[]) {
  if (series.length < 2) return true;
  return series[series.length - 1].close >= series[0].close;
}

const PORTFOLIO_RANGE_LABELS: Record<ChartRange, string> = {
  "1D": "1D",
  "1W": "1W",
  "1M": "1M",
  "3M": "3M",
  "1Y": "1Y",
  "5Y": "5Y",
  ALL: "All",
};

const PORTFOLIO_RANGE_SECONDS: Record<Exclude<ChartRange, "ALL">, number> = {
  "1D": 86400,
  "1W": 7 * 86400,
  "1M": 30 * 86400,
  "3M": 90 * 86400,
  "1Y": 365 * 86400,
  "5Y": 5 * 365 * 86400,
};

/** Slice client-side portfolio history to the selected window (unlike Yahoo charts, data is local). */
function filterPortfolioSeriesByRange(series: ChartSeriesPoint[], range: ChartRange): ChartSeriesPoint[] {
  if (series.length < 2) return series;
  if (range === "ALL") return series;

  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - PORTFOLIO_RANGE_SECONDS[range];

  const sorted = [...series].sort((a, b) => a.time - b.time);
  const inWindow = sorted.filter((p) => p.time >= cutoff);

  if (inWindow.length >= 2) return inWindow;

  const beforeCutoff = sorted.filter((p) => p.time < cutoff);
  const lastBefore = beforeCutoff.length ? beforeCutoff[beforeCutoff.length - 1] : null;

  if (inWindow.length === 1 && lastBefore) {
    return [lastBefore, ...inWindow];
  }

  return sorted.slice(-Math.min(Math.max(2, sorted.length), 40));
}

function FeatherIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.5 3.5c-.8 1.6-2.8 4.8-6.2 8.2-2.1 2.1-4.2 3.6-5.8 4.5L4 20l3.8-2.5c.9-1.6 2.4-3.7 4.5-5.8 3.4-3.4 6.6-5.4 8.2-6.2l1-1.5-1-1.5z" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 12a8 8 0 0 1 8-8 8 8 0 0 1 8 8" strokeLinecap="round" />
      <path d="M20 4v4h-4M20 12a8 8 0 0 1-8 8 8 8 0 0 1-8-8" strokeLinecap="round" />
      <path d="M4 20v-4h4" strokeLinecap="round" />
    </svg>
  );
}

function IconHome({ active }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      {active ? (
        <path
          fill="currentColor"
          d="M12 3.5L4 9.2V21h6v-6h4v6h6V9.2L12 3.5z"
        />
      ) : (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.65"
          strokeLinejoin="round"
          d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-7H10v7H5a1 1 0 0 1-1-1V10.5z"
        />
      )}
    </svg>
  );
}

function IconSearchNav({ active }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle
        cx="11"
        cy="11"
        r="6.5"
        stroke="currentColor"
        strokeWidth="1.75"
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.22 : 0}
      />
      <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

type Tab = "home" | "browse";

/** Background quote poll — not a WebSocket; Yahoo is polled on this interval while the tab is visible. */
const TICK_INTERVAL_MS = 5_000;

function SetupScreen({ onStart }: { onStart: (amount: number) => void }) {
  const [raw, setRaw] = useState(String(STARTING_CASH));

  const submit = () => {
    const n = Number(String(raw).replace(/,/g, ""));
    if (Number.isFinite(n)) onStart(n);
  };

  return (
    <div className="rh-setup">
      <div className="rh-setup-card">
        <div className="rh-setup-brand">
          <span className="rh-feather" aria-hidden>
            <FeatherIcon />
          </span>
          <span className="rh-setup-brand-name">Stocks Sim</span>
        </div>
        <p className="rh-setup-lead">
          Paper trading — pick your starting cash, then trade for real tickers.
        </p>
        <label className="rh-setup-label" htmlFor="starting-cash">
          Starting cash
        </label>
        <input
          id="starting-cash"
          type="number"
          min={MIN_STARTING_CASH}
          step={100}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          className="rh-setup-input"
          autoComplete="off"
        />
        <p className="rh-setup-hint">Minimum {formatMoney(MIN_STARTING_CASH)}</p>
        <button type="button" className="rh-setup-btn" onClick={submit}>
          Start trading
        </button>
      </div>
    </div>
  );
}

export function App() {
  const portfolio = usePortfolio();
  const [tab, setTab] = useState<Tab>("home");
  const [quotes, setQuotes] = useState<Map<string, QuoteData>>(() => new Map());
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [analysisSymbol, setAnalysisSymbol] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [search, setSearch] = useState("");
  const [qtyBySymbol, setQtyBySymbol] = useState<Record<string, number>>({});
  const [portfolioHistory, setPortfolioHistory] = useState<ChartSeriesPoint[]>(loadPortfolioSeries);
  const [portfolioChartRange, setPortfolioChartRange] = useState<ChartRange>("1M");
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [tradeError, setTradeError] = useState<{ symbol: string; message: string } | null>(null);
  /** Stocks tab: hide search while scrolling down; show (fixed under header) when scrolling up. */
  const [browseToolbarVisible, setBrowseToolbarVisible] = useState(true);
  const [browseScrollY, setBrowseScrollY] = useState(0);
  const browseScrollLastY = useRef(0);
  /** Avoid re-running non-silent refresh when `refresh` identity changes after a trade (holdings update). */
  const initialQuotesRefreshDone = useRef(false);

  const symbols = useMemo(() => COMPANIES.map((c) => c.symbol), []);
  const holdingSymbols = useMemo(
    () => [...new Set(portfolio.holdings.map((h) => h.symbol))],
    [portfolio.holdings]
  );

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const need = [...new Set([...symbols, ...holdingSymbols])];
      const map = await fetchQuotes(need);
      if (map.size === 0) {
        if (!silent) {
          setError(
            import.meta.env.DEV
              ? "No prices loaded. Run npm run dev, open http://127.0.0.1:5173, then refresh."
              : "No prices loaded. Check your connection and tap Refresh."
          );
          // Keep prior quotes so total portfolio value doesn’t drop to cash-only on a failed refresh.
          setLastFetch(new Date());
        }
      } else {
        // Merge so a partial fetch (or one failed ticker) does not wipe prior prices — keeps portfolio total accurate.
        setQuotes((prev) => {
          const next = new Map(prev);
          for (const [k, v] of map) {
            next.set(k, v);
          }
          return next;
        });
        setLastFetch(new Date());
        if (silent) setError(null);
      }
    } catch (e) {
      if (!silent) {
        setError(e instanceof Error ? e.message : "Failed to load quotes");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [symbols, holdingSymbols]);

  useEffect(() => {
    if (initialQuotesRefreshDone.current) return;
    initialQuotesRefreshDone.current = true;
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh({ silent: true });
      }
    }, TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    setExpandedSymbol(null);
  }, [tab]);

  /** Leaving Stocks: clear search so next visit shows full A–Z list from the top. */
  useEffect(() => {
    if (tab !== "home") return;
    setSearch("");
  }, [tab]);

  useEffect(() => {
    if (tab !== "browse") return;
    window.scrollTo(0, 0);
    browseScrollLastY.current = 0;
    setBrowseScrollY(0);
    setBrowseToolbarVisible(true);
  }, [tab]);

  useEffect(() => {
    if (tab !== "browse") return;
    const onScroll = () => {
      const y = window.scrollY;
      setBrowseScrollY(y);
      const last = browseScrollLastY.current;
      const delta = y - last;
      if (y < 12) {
        setBrowseToolbarVisible(true);
      } else if (delta > 6) {
        setBrowseToolbarVisible(false);
      } else if (delta < -4) {
        setBrowseToolbarVisible(true);
      }
      browseScrollLastY.current = y;
    };
    const y0 = window.scrollY;
    browseScrollLastY.current = y0;
    setBrowseScrollY(y0);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [tab]);

  useEffect(() => {
    savePortfolioSeries(portfolioHistory);
  }, [portfolioHistory]);

  const allQtySymbols = useMemo(
    () => [...new Set([...symbols, ...holdingSymbols])],
    [symbols, holdingSymbols]
  );

  useEffect(() => {
    setQtyBySymbol((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const sym of allQtySymbols) {
        const q = quoteForSymbol(quotes, sym);
        const own = portfolio.holdingFor(sym);
        const mb = q ? maxBuyShares(portfolio.cash, q.price) : 0;
        const mo = maxOrderShares(mb, own);
        const cur = next[sym] ?? 0;
        if (cur > mo + 1e-8) {
          next[sym] = mo;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [allQtySymbols, portfolio.cash, portfolio.holdings, quotes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = !q
      ? COMPANIES
      : COMPANIES.filter(
          (c) =>
            c.symbol.toLowerCase().includes(q) ||
            c.name.toLowerCase().includes(q) ||
            c.sector.toLowerCase().includes(q)
        );
    return [...list].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [search]);

  const portfolioValue = useMemo(() => {
    let v = portfolio.cash;
    for (const h of portfolio.holdings) {
      const q = quoteForSymbol(quotes, h.symbol);
      if (q) v += h.shares * q.price;
    }
    return v;
  }, [portfolio.cash, portfolio.holdings, quotes]);

  /** Track total portfolio value over time (time + close for PriceChart hover). */
  useEffect(() => {
    if (!portfolio.started) return;
    if (loading && quotes.size === 0) return;
    const rounded = Math.round(portfolioValue * 100) / 100;
    const t = Math.floor(Date.now() / 1000);
    const baseline = portfolio.startingCash;
    setPortfolioHistory((prev) => {
      if (prev.length === 0) {
        return [
          { time: t - 60, close: baseline },
          { time: t, close: rounded },
        ];
      }
      const last = prev[prev.length - 1];
      if (last.close === rounded) return prev;
      return [...prev, { time: t, close: rounded }].slice(-MAX_PORTFOLIO_HISTORY);
    });
  }, [portfolio.started, portfolio.startingCash, portfolioValue, loading, quotes.size]);

  const portfolioSeriesForChart = useMemo(
    () => filterPortfolioSeriesByRange(portfolioHistory, portfolioChartRange),
    [portfolioHistory, portfolioChartRange]
  );

  const analysisQuote = useMemo(
    () => (analysisSymbol ? quoteForSymbol(quotes, analysisSymbol) : undefined),
    [analysisSymbol, quotes]
  );

  const base = portfolio.startingCash > 0 ? portfolio.startingCash : 1;
  const pnl = portfolioValue - portfolio.startingCash;
  const pnlPct = (pnl / base) * 100;

  /** Order size for next trade (+/− only), not your position. */
  const getQty = (sym: string) => qtyBySymbol[sym] ?? 0;

  const setQty = (sym: string, n: number) => {
    setTradeError((e) => (e?.symbol === sym ? null : e));
    setQtyBySymbol((prev) => ({ ...prev, [sym]: round4(n) }));
  };

  const buy = (symbol: string) => {
    const q = quoteForSymbol(quotes, symbol);
    if (!q) {
      setTradeError({ symbol, message: "Price isn’t loaded yet. Try again in a moment." });
      return;
    }
    const maxBuy = maxBuyShares(portfolio.cash, q.price);
    let shares = round4(getQty(symbol));
    if (shares <= 0) {
      setTradeError({ symbol, message: "Enter a quantity greater than 0." });
      return;
    }
    if (maxBuy <= 0) {
      setTradeError({ symbol, message: "Not enough cash to buy at this price." });
      return;
    }
    shares = Math.min(shares, maxBuy);
    if (shares <= 0) {
      setTradeError({ symbol, message: "That quantity is more than you can afford." });
      return;
    }
    const cost = Math.round(shares * q.price * 100) / 100;
    if (portfolio.cash + 1e-6 < cost) {
      setTradeError({ symbol, message: "Insufficient buying power for this order." });
      return;
    }
    if (portfolio.buy(symbol, shares, cost)) {
      setTradeError(null);
      setQty(symbol, 0);
      void refresh({ silent: true });
    } else {
      setTradeError({ symbol, message: "Couldn’t complete purchase. Try fewer shares." });
    }
  };

  const sell = (symbol: string) => {
    const q = quoteForSymbol(quotes, symbol);
    if (!q) {
      setTradeError({ symbol, message: "Price isn’t loaded yet. Try again in a moment." });
      return;
    }
    const have = portfolio.holdingFor(symbol);
    let shares = round4(getQty(symbol));
    if (shares <= 0) {
      setTradeError({ symbol, message: "Enter a quantity greater than 0." });
      return;
    }
    if (have <= 0) {
      setTradeError({ symbol, message: "You don’t own any shares to sell." });
      return;
    }
    shares = Math.min(shares, have);
    if (shares <= 0) {
      setTradeError({ symbol, message: "Nothing to sell for that quantity." });
      return;
    }
    if (portfolio.sell(symbol, shares, q.price)) {
      setTradeError(null);
      setQty(symbol, 0);
      void refresh({ silent: true });
    } else {
      setTradeError({ symbol, message: "Couldn’t complete sale. Try again." });
    }
  };

  const positions = useMemo(() => {
    return portfolio.holdings
      .map((h) => {
        const q = quoteForSymbol(quotes, h.symbol);
        const value = q ? h.shares * q.price : 0;
        const dayPct = q ? pctChange(q.price, q.previousClose) : null;
        return { ...h, value, dayPct, price: q?.price, sparkline: q?.sparkline };
      })
      .sort((a, b) => b.value - a.value);
  }, [portfolio.holdings, quotes]);

  const toggleExpand = (symbol: string) => {
    setExpandedSymbol((prev) => (prev === symbol ? null : symbol));
  };

  const performResetToSetup = useCallback(() => {
    portfolio.backToSetup();
    setTab("home");
    setPortfolioHistory([]);
    try {
      localStorage.removeItem(PORTFOLIO_HISTORY_KEY);
      localStorage.removeItem(LEGACY_PORTFOLIO_HISTORY_KEY);
    } catch {
      /* ignore */
    }
    setResetConfirmOpen(false);
  }, [portfolio]);

  useEffect(() => {
    if (!resetConfirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setResetConfirmOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resetConfirmOpen]);

  useEffect(() => {
    if (!analysisSymbol) return;
    setTradeError((e) => (e && e.symbol !== analysisSymbol ? null : e));
  }, [analysisSymbol]);

  if (!portfolio.started) {
    return (
      <div className="rh-app rh-app--setup">
        <SetupScreen onStart={portfolio.startGame} />
      </div>
    );
  }

  return (
    <div className="rh-app">
      <header className="rh-topbar">
        <div className="rh-brand">
          <span className="rh-feather" aria-hidden>
            <FeatherIcon />
          </span>
          <div className="rh-brand-text">
            <span className="rh-brand-name">Stocks Sim</span>
            <span className="rh-brand-tag">Paper trading</span>
          </div>
        </div>
        <div className="rh-top-actions">
          <button
            type="button"
            className="rh-top-reset"
            onClick={() => setResetConfirmOpen(true)}
          >
            Reset
          </button>
          <button
            type="button"
            className="rh-icon-btn"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Refresh prices"
          >
            <IconRefresh />
          </button>
        </div>
      </header>

      {error && <div className="rh-error">{error}</div>}

      {tab === "home" && (
        <>
          <section className="rh-hero" aria-label="Portfolio">
            <div className="rh-hero-label">Total portfolio value</div>
            <div className="rh-hero-value tabular">{formatMoney(portfolioValue)}</div>
            <div
              className={`rh-hero-change ${pnl >= 0 ? "rh-up" : "rh-down"}`}
            >
              {pnl >= 0 ? "+" : ""}
              {formatMoney(pnl)} ({pnlPct >= 0 ? "+" : ""}
              {pnlPct.toFixed(2)}%)
            </div>
            <div className="rh-hero-sub">All time · started with {formatMoney(portfolio.startingCash)}</div>
          </section>

          <div className="rh-section-title">Your positions</div>
          {positions.length === 0 ? (
            <div className="rh-empty-pos">
              No positions yet. Open <strong>Stocks</strong> below to buy.
            </div>
          ) : (
            <div className="rh-list" role="list">
              {positions.map((p) => {
                const ch = p.dayPct;
                const pts = p.sparkline ?? [];
                const open = expandedSymbol === `pos-${p.symbol}`;
                return (
                  <div key={p.symbol} className="rh-stock-block">
                    <button
                      type="button"
                      className="rh-row rh-row-tap"
                      onClick={() => toggleExpand(`pos-${p.symbol}`)}
                      aria-expanded={open}
                    >
                      <button
                        type="button"
                        className="rh-avatar rh-avatar-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAnalysisSymbol(p.symbol);
                        }}
                        aria-label={`${p.symbol} — open analysis`}
                      >
                        <CompanyAvatar symbol={p.symbol} />
                      </button>
                      <div className="rh-row-mid">
                        <div className="rh-row-symbol">{p.symbol}</div>
                        <div className="rh-row-name tabular">
                          {p.shares} shares · {formatMoney(p.value)}
                        </div>
                      </div>
                      {pts.length >= 2 && (
                        <div className="rh-spark-cell">
                          <Sparkline points={pts} positive={sparkPositive(pts)} size="sm" />
                        </div>
                      )}
                      <div className="rh-row-right">
                        <div className="rh-row-price tabular">
                          {p.price != null ? formatMoney(p.price) : "—"}
                        </div>
                        <div
                          className={`rh-row-pct ${
                            ch == null ? "rh-muted" : ch >= 0 ? "rh-up" : "rh-down"
                          }`}
                        >
                          {ch != null ? (
                            <>
                              {ch >= 0 ? "+" : ""}
                              {ch.toFixed(2)}% today
                            </>
                          ) : (
                            "—"
                          )}
                        </div>
                      </div>
                      <span className={`rh-chevron ${open ? "rh-chevron-up" : ""}`} aria-hidden />
                    </button>
                    {open && pts.length >= 2 && (
                      <div className="rh-expanded">
                        <div className="rh-expanded-label">Price (chart range)</div>
                        <div className="rh-expanded-chart">
                          <Sparkline points={pts} positive={sparkPositive(pts)} size="lg" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div
            className={`rh-chart-strip ${pnl < 0 ? "rh-strip-down" : ""}`}
            aria-label="Portfolio value history"
          >
            {portfolioHistory.length >= 2 ? (
              <>
                <div
                  className="cd-range-tabs rh-portfolio-range-tabs"
                  role="tablist"
                  aria-label="Portfolio chart range"
                >
                  {CHART_RANGES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="tab"
                      aria-selected={portfolioChartRange === r}
                      className={`cd-range-tab ${portfolioChartRange === r ? "cd-range-tab--active" : ""}`}
                      onClick={() => setPortfolioChartRange(r)}
                    >
                      {PORTFOLIO_RANGE_LABELS[r]}
                    </button>
                  ))}
                </div>
                {portfolioSeriesForChart.length >= 2 ? (
                  <PriceChart
                    series={portfolioSeriesForChart}
                    range={portfolioChartRange}
                    positive={portfolioPositive(portfolioSeriesForChart)}
                    variant="portfolio"
                  />
                ) : (
                  <div className="rh-chart-strip-placeholder">
                    Not enough points in this range yet.
                  </div>
                )}
              </>
            ) : (
              <div className="rh-chart-strip-placeholder">
                Chart appears after prices load and your total changes.
              </div>
            )}
          </div>

          <div className="rh-bp">
            <div style={{ flex: 1 }}>
              <div className="rh-bp-label">Buying power</div>
              <div className="rh-bp-value tabular">{formatMoney(portfolio.cash)}</div>
            </div>
          </div>
        </>
      )}

      {tab === "browse" && (
        <>
          <div
            className={`rh-browse-toolbar-fixed ${browseToolbarVisible ? "" : "rh-browse-toolbar-fixed--hidden"}`}
            aria-hidden={!browseToolbarVisible}
          >
            <div className="rh-search-wrap">
              <div className="rh-search-inner">
                <svg className="rh-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.75" />
                  <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
                <input
                  className="rh-search"
                  type="text"
                  inputMode="search"
                  enterKeyHint="search"
                  placeholder="Search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search stocks"
                  autoComplete="off"
                  tabIndex={browseToolbarVisible ? 0 : -1}
                />
              </div>
            </div>
          </div>
          <div
            className={`rh-browse-toolbar-spacer ${
              browseToolbarVisible && browseScrollY < 72 ? "" : "rh-browse-toolbar-spacer--collapsed"
            }`}
            aria-hidden
          />
          {lastFetch && !browseToolbarVisible && (
            <div className="rh-last-updated">
              Market data · {lastFetch.toLocaleTimeString()}
            </div>
          )}
          <div className="rh-section-title">Browse stocks</div>
          <div className="rh-list">
            {filtered.map((c) => {
              const q = quoteForSymbol(quotes, c.symbol);
              const own = portfolio.holdingFor(c.symbol);
              const change = q ? pctChange(q.price, q.previousClose) : null;
              const pts = q?.sparkline ?? [];
              const open = expandedSymbol === c.symbol;
              return (
                <div key={c.symbol} className="rh-stock-block">
                  <button
                    type="button"
                    className="rh-row rh-row-tap"
                    onClick={() => toggleExpand(c.symbol)}
                    aria-expanded={open}
                  >
                    <button
                      type="button"
                      className="rh-avatar rh-avatar-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAnalysisSymbol(c.symbol);
                      }}
                      aria-label={`${c.symbol} — open analysis`}
                    >
                      <CompanyAvatar symbol={c.symbol} />
                    </button>
                    <div className="rh-row-mid">
                      <div className="rh-row-symbol">{c.symbol}</div>
                      <div className="rh-row-name">{c.name}</div>
                    </div>
                    {pts.length >= 2 && (
                      <div className="rh-spark-cell">
                        <Sparkline points={pts} positive={sparkPositive(pts)} size="sm" />
                      </div>
                    )}
                    <div className="rh-row-right">
                      <div className="rh-row-price tabular">
                        {q ? formatMoney(q.price) : "—"}
                      </div>
                      <div
                        className={`rh-row-pct ${
                          change == null ? "rh-muted" : change >= 0 ? "rh-up" : "rh-down"
                        }`}
                      >
                        {change != null ? (
                          <>
                            {change >= 0 ? "+" : ""}
                            {change.toFixed(2)}%
                          </>
                        ) : (
                          "—"
                        )}
                      </div>
                    </div>
                    <span className={`rh-chevron ${open ? "rh-chevron-up" : ""}`} aria-hidden />
                  </button>
                  {open && (
                    <div className="rh-expanded">
                      {pts.length >= 2 ? (
                        <>
                          <div className="rh-expanded-label">Past ~5 sessions (15m bars) or daily</div>
                          <div className="rh-expanded-chart">
                            <Sparkline points={pts} positive={sparkPositive(pts)} size="lg" />
                          </div>
                        </>
                      ) : (
                        <div className="rh-expanded-empty">Chart loads when price data is available.</div>
                      )}
                    </div>
                  )}
                  <div
                    className="rh-trade"
                    role="group"
                    aria-label={`Trade ${c.symbol}`}
                  >
                    <div className={`rh-own-badge ${own <= 0 ? "rh-own-zero" : ""}`}>
                      You own {own} shares
                    </div>
                    <div className="rh-trade-actions">
                      <div className="rh-trade-qty-field">
                        <span className="rh-trade-label" id={`trade-qty-label-${c.symbol}`}>
                          Trade qty
                        </span>
                        <TradeQtyStepper
                          id={`trade-qty-${c.symbol}`}
                          labelledBy={`trade-qty-label-${c.symbol}`}
                          value={getQty(c.symbol)}
                          onChange={(n) => setQty(c.symbol, n)}
                          maxBuy={q ? maxBuyShares(portfolio.cash, q.price) : 0}
                          own={own}
                        />
                      </div>
                      <button
                        type="button"
                        className="rh-btn-buy"
                        disabled={!q || loading}
                        onClick={() => buy(c.symbol)}
                      >
                        Buy
                      </button>
                      <button
                        type="button"
                        className="rh-btn-sell"
                        disabled={!q || own <= 0 || loading}
                        onClick={() => sell(c.symbol)}
                      >
                        Sell
                      </button>
                    </div>
                    {tradeError?.symbol === c.symbol && (
                      <p className="rh-trade-err" role="alert">
                        {tradeError.message}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <p className="rh-foot">Quotes may be delayed.</p>

      {resetConfirmOpen && (
        <div
          className="rh-modal-overlay"
          role="presentation"
          onClick={() => setResetConfirmOpen(false)}
        >
          <div
            className="rh-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rh-reset-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="rh-reset-title" className="rh-modal-title">
              Reset game?
            </h2>
            <p className="rh-modal-warning">
              This will permanently clear your cash, all stock positions, and your portfolio chart history. You will
              start over and choose a new starting amount.
            </p>
            <p className="rh-modal-question">Are you sure you want to reset?</p>
            <div className="rh-modal-actions">
              <button type="button" className="rh-modal-btn rh-modal-btn--no" onClick={() => setResetConfirmOpen(false)}>
                No
              </button>
              <button type="button" className="rh-modal-btn rh-modal-btn--yes" onClick={performResetToSetup}>
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {analysisSymbol && (
        <CompanyDetail
          symbol={analysisSymbol}
          onClose={() => {
            setAnalysisSymbol(null);
            setTradeError(null);
          }}
          quote={analysisQuote}
          displayName={companyBySymbol(analysisSymbol)?.name ?? analysisSymbol}
          sectorLabel={companyBySymbol(analysisSymbol)?.sector}
          own={portfolio.holdingFor(analysisSymbol)}
          maxBuy={analysisQuote ? maxBuyShares(portfolio.cash, analysisQuote.price) : 0}
          tradeLoading={loading}
          getQty={() => getQty(analysisSymbol)}
          setQty={(n) => setQty(analysisSymbol, n)}
          onBuy={() => buy(analysisSymbol)}
          onSell={() => sell(analysisSymbol)}
          tradeError={tradeError?.symbol === analysisSymbol ? tradeError.message : null}
        />
      )}

      <nav className="rh-nav" aria-label="Main">
        <div className="rh-nav-inner">
          <button
            type="button"
            className={`rh-nav-item ${tab === "home" ? "rh-active" : ""}`}
            onClick={() => setTab("home")}
          >
            <IconHome active={tab === "home"} />
            Home
          </button>
          <button
            type="button"
            className={`rh-nav-item ${tab === "browse" ? "rh-active" : ""}`}
            onClick={() => setTab("browse")}
          >
            <IconSearchNav active={tab === "browse"} />
            Stocks
          </button>
        </div>
      </nav>
    </div>
  );
}
