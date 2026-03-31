import { useCallback, useEffect, useMemo, useState } from "react";
import { companyBySymbol, COMPANIES } from "./companies";
import { CompanyDetail } from "./CompanyDetail";
import { TradeQtyStepper } from "./TradeQtyStepper";
import { maxBuyShares, maxOrderShares, round4 } from "./tradeQty";
import { PriceChart } from "./PriceChart";
import { Sparkline } from "./Sparkline";
import { STARTING_CASH, usePortfolio } from "./usePortfolio";
import { fetchQuotes, type ChartRange, type ChartSeriesPoint, type QuoteData } from "./yahoo";
import "./App.css";

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

function portfolioChartRange(series: ChartSeriesPoint[]): ChartRange {
  if (series.length < 2) return "1M";
  const dt = series[series.length - 1].time - series[0].time;
  if (dt <= 86400 * 2) return "1D";
  if (dt <= 86400 * 14) return "1W";
  if (dt <= 86400 * 120) return "1M";
  return "ALL";
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
const TICK_INTERVAL_MS = 10_000;

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
            "No prices loaded. Run npm run dev, open http://127.0.0.1:5173, then refresh."
          );
          setQuotes(map);
          setLastFetch(new Date());
        }
      } else {
        setQuotes(map);
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
        const q = quotes.get(sym);
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
    if (!q) return COMPANIES;
    return COMPANIES.filter(
      (c) =>
        c.symbol.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.sector.toLowerCase().includes(q)
    );
  }, [search]);

  const portfolioValue = useMemo(() => {
    let v = portfolio.cash;
    for (const h of portfolio.holdings) {
      const q = quotes.get(h.symbol);
      if (q) v += h.shares * q.price;
    }
    return v;
  }, [portfolio.cash, portfolio.holdings, quotes]);

  /** Track total portfolio value over time (time + close for PriceChart hover). */
  useEffect(() => {
    if (loading && quotes.size === 0) return;
    const rounded = Math.round(portfolioValue * 100) / 100;
    const t = Math.floor(Date.now() / 1000);
    setPortfolioHistory((prev) => {
      if (prev.length === 0) {
        return [
          { time: t - 60, close: STARTING_CASH },
          { time: t, close: rounded },
        ];
      }
      const last = prev[prev.length - 1];
      if (last.close === rounded) return prev;
      return [...prev, { time: t, close: rounded }].slice(-MAX_PORTFOLIO_HISTORY);
    });
  }, [portfolioValue, loading, quotes.size]);

  const portfolioRange = useMemo(
    () => portfolioChartRange(portfolioHistory),
    [portfolioHistory]
  );

  const pnl = portfolioValue - STARTING_CASH;
  const pnlPct = (pnl / STARTING_CASH) * 100;

  /** Order size for next trade (+/− only), not your position. */
  const getQty = (sym: string) => qtyBySymbol[sym] ?? 0;

  const setQty = (sym: string, n: number) => {
    setQtyBySymbol((prev) => ({ ...prev, [sym]: round4(n) }));
  };

  const buy = (symbol: string) => {
    const q = quotes.get(symbol);
    if (!q) return;
    const maxBuy = maxBuyShares(portfolio.cash, q.price);
    let shares = round4(getQty(symbol));
    if (shares <= 0) return;
    shares = Math.min(shares, maxBuy);
    if (shares <= 0) return;
    const cost = Math.round(shares * q.price * 100) / 100;
    if (portfolio.buy(symbol, shares, cost)) {
      setQty(symbol, 0);
    }
  };

  const sell = (symbol: string) => {
    const q = quotes.get(symbol);
    if (!q) return;
    const have = portfolio.holdingFor(symbol);
    let shares = round4(getQty(symbol));
    if (shares <= 0) return;
    shares = Math.min(shares, have);
    if (shares <= 0) return;
    if (portfolio.sell(symbol, shares, q.price)) {
      setQty(symbol, 0);
    }
  };

  const positions = useMemo(() => {
    return portfolio.holdings
      .map((h) => {
        const q = quotes.get(h.symbol);
        const value = q ? h.shares * q.price : 0;
        const dayPct = q ? pctChange(q.price, q.previousClose) : null;
        return { ...h, value, dayPct, price: q?.price, sparkline: q?.sparkline };
      })
      .sort((a, b) => b.value - a.value);
  }, [portfolio.holdings, quotes]);

  const toggleExpand = (symbol: string) => {
    setExpandedSymbol((prev) => (prev === symbol ? null : symbol));
  };

  return (
    <div className="rh-app">
      <header className="rh-topbar">
        <div className="rh-brand">
          <span className="rh-feather" aria-hidden>
            <FeatherIcon />
          </span>
          <div className="rh-brand-text">
            <span className="rh-brand-name">Stonks</span>
            <span className="rh-brand-tag">Paper trading</span>
          </div>
        </div>
        <div className="rh-top-actions">
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
            <div className="rh-hero-sub">All time · started with {formatMoney(STARTING_CASH)}</div>
          </section>

          <div
            className={`rh-chart-strip ${pnl < 0 ? "rh-strip-down" : ""}`}
            aria-label="Portfolio value history"
          >
            {portfolioHistory.length >= 2 ? (
              <PriceChart
                series={portfolioHistory}
                range={portfolioRange}
                positive={portfolioPositive(portfolioHistory)}
              />
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
              <div className="rh-bp-row2">
                <span className="rh-bp-label">Reset portfolio</span>
                <button
                  type="button"
                  className="rh-link-reset"
                  onClick={() => {
                    portfolio.reset();
                    setPortfolioHistory([]);
                    try {
                      localStorage.removeItem(PORTFOLIO_HISTORY_KEY);
                      localStorage.removeItem(LEGACY_PORTFOLIO_HISTORY_KEY);
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

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
                        {p.symbol.slice(0, 2)}
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
        </>
      )}

      {tab === "browse" && (
        <>
          <div className="rh-search-wrap">
            <div className="rh-search-inner">
              <svg className="rh-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.75" />
                <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
              <input
                className="rh-search"
                type="search"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search stocks"
                autoComplete="off"
              />
            </div>
          </div>
          {lastFetch && (
            <div className="rh-last-updated">
              Market data · {lastFetch.toLocaleTimeString()}
            </div>
          )}
          <div className="rh-section-title">Browse stocks</div>
          <div className="rh-list">
            {filtered.map((c) => {
              const q = quotes.get(c.symbol);
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
                      {c.symbol.slice(0, 2)}
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
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <p className="rh-foot">
        Quotes delayed. Run <code>npm run dev</code> · not affiliated with Robinhood Markets.
      </p>

      {analysisSymbol && (
        <CompanyDetail
          symbol={analysisSymbol}
          onClose={() => setAnalysisSymbol(null)}
          quote={quotes.get(analysisSymbol)}
          displayName={companyBySymbol(analysisSymbol)?.name ?? analysisSymbol}
          sectorLabel={companyBySymbol(analysisSymbol)?.sector}
          own={portfolio.holdingFor(analysisSymbol)}
          maxBuy={
            quotes.get(analysisSymbol)
              ? maxBuyShares(portfolio.cash, quotes.get(analysisSymbol)!.price)
              : 0
          }
          tradeLoading={loading}
          getQty={() => getQty(analysisSymbol)}
          setQty={(n) => setQty(analysisSymbol, n)}
          onBuy={() => buy(analysisSymbol)}
          onSell={() => sell(analysisSymbol)}
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
