import { useEffect, useRef, useState } from "react";
import { fetchCompanyAnalysis, type CompanyAnalysis } from "./companyAnalysis";
import { CHART_RANGES, PriceChart } from "./PriceChart";
import { TradeQtyStepper } from "./TradeQtyStepper";
import { CompanyAvatar } from "./CompanyAvatar";
import { formatMoney, pctChange } from "./format";
import { useFocusTrap } from "./useFocusTrap";
import { fetchChartSeries, type ChartRange, type ChartSeriesPoint } from "./yahoo";
import "./CompanyDetail.css";

function formatBig(n: number) {
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

const RANGE_LABELS: Record<ChartRange, string> = {
  "1D": "1D",
  "1W": "1W",
  "1M": "1M",
  "3M": "3M",
  "1Y": "1Y",
  "5Y": "5Y",
  ALL: "All",
};

type Props = {
  symbol: string;
  onClose: () => void;
  quote?: { price: number; previousClose: number; sparkline: number[] };
  displayName: string;
  sectorLabel?: string;
  own: number;
  maxBuy: number;
  tradeLoading: boolean;
  getQty: () => number;
  setQty: (n: number) => void;
  onBuy: () => void;
  onSell: () => void;
  tradeError?: string | null;
};

export function CompanyDetail({
  symbol,
  onClose,
  quote,
  displayName,
  sectorLabel,
  own,
  maxBuy,
  tradeLoading,
  getQty,
  setQty,
  onBuy,
  onSell,
  tradeError,
}: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, sheetRef);

  const [data, setData] = useState<CompanyAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [chartRange, setChartRange] = useState<ChartRange>("1M");
  const [chartSeries, setChartSeries] = useState<ChartSeriesPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartErr, setChartErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setData(null);
    void fetchCompanyAnalysis(symbol)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Could not load analysis");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  useEffect(() => {
    let cancelled = false;
    setChartLoading(true);
    setChartErr(null);
    setChartSeries([]);
    void fetchChartSeries(symbol, chartRange)
      .then((pts) => {
        if (!cancelled) setChartSeries(pts);
      })
      .catch((e: unknown) => {
        if (!cancelled) setChartErr(e instanceof Error ? e.message : "Chart failed");
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, chartRange]);

  const dayCh = quote ? pctChange(quote.price, quote.previousClose) : null;
  const chartPositive =
    chartSeries.length >= 2
      ? chartSeries[chartSeries.length - 1].close >= chartSeries[0].close
      : true;

  return (
    <div ref={sheetRef} className="cd-overlay" role="dialog" aria-modal="true" aria-labelledby="cd-title">
      <header className="cd-header">
        <button type="button" className="cd-back" onClick={onClose} aria-label="Back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 6l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <h1 id="cd-title" className="cd-title">
          {data?.longName ?? data?.shortName ?? displayName}
        </h1>
        <div className="cd-header-spacer" />
      </header>

      <div className="cd-body">
        <div className="cd-hero">
          <div className="cd-avatar" aria-hidden>
            <CompanyAvatar symbol={symbol} />
          </div>
          <div className="cd-ticker">{symbol}</div>
          {(sectorLabel || data?.sector) && (
            <div className="cd-sector">{data?.sector ?? sectorLabel}</div>
          )}
        </div>

        {quote && (
          <section className="cd-price-block" aria-label="Price">
            <div className="cd-price tabular">{formatMoney(quote.price)}</div>
            <div className={`cd-day ${dayCh != null && dayCh >= 0 ? "cd-up" : "cd-down"}`}>
              {dayCh != null ? (
                <>
                  {dayCh >= 0 ? "+" : ""}
                  {dayCh.toFixed(2)}% today
                </>
              ) : (
                "—"
              )}
            </div>
          </section>
        )}

        <section className="cd-chart-section" aria-label="Price chart">
          <div className="cd-chart-label">Price history</div>
          <div className="cd-range-tabs" role="tablist" aria-label="Chart range">
            {CHART_RANGES.map((r) => (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={chartRange === r}
                className={`cd-range-tab ${chartRange === r ? "cd-range-tab--active" : ""}`}
                onClick={() => setChartRange(r)}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
          {chartLoading && <p className="cd-muted">Loading chart…</p>}
          {chartErr && <p className="cd-err">{chartErr}</p>}
          {!chartLoading && !chartErr && chartSeries.length >= 2 && (
            <div className="cd-chart-box">
              <PriceChart series={chartSeries} range={chartRange} positive={chartPositive} />
            </div>
          )}
          {!chartLoading && !chartErr && chartSeries.length < 2 && (
            <p className="cd-muted">No chart data for this range.</p>
          )}

          <div className="cd-quick-summary-block">
            <div className="cd-chart-label">Overview</div>
            {loading && <p className="cd-muted">Loading summary…</p>}
            {!loading && data?.summary && (
              <p className="cd-quick-summary">{data.summary.replace(/\s+/g, " ").trim()}</p>
            )}
            {!loading && data && !data.summary && (data.industry || data.sector) && (
              <p className="cd-quick-summary">{[data.industry, data.sector].filter(Boolean).join(" · ")}</p>
            )}
            {!loading && data && !data.summary && !data.industry && !data.sector && (
              <p className="cd-quick-summary">{data.longName ?? data.shortName ?? displayName}</p>
            )}
            {!loading && err && !data && <p className="cd-muted">Could not load company summary.</p>}
          </div>
        </section>

        {data && !loading && (
          <>
            <section className="cd-stats" aria-label="Key statistics">
              <h2 className="cd-h2">Key statistics</h2>
              <dl className="cd-dl">
                {data.marketCap != null && (
                  <>
                    <dt>Market cap</dt>
                    <dd>{formatBig(data.marketCap)}</dd>
                  </>
                )}
                {data.enterpriseValue != null && (
                  <>
                    <dt>Enterprise value</dt>
                    <dd>{formatBig(data.enterpriseValue)}</dd>
                  </>
                )}
                {data.trailingPE != null && (
                  <>
                    <dt>Trailing P/E</dt>
                    <dd>{data.trailingPE.toFixed(2)}</dd>
                  </>
                )}
                {data.forwardPE != null && (
                  <>
                    <dt>Forward P/E</dt>
                    <dd>{data.forwardPE.toFixed(2)}</dd>
                  </>
                )}
                {data.epsTrailing != null && (
                  <>
                    <dt>EPS (TTM)</dt>
                    <dd>{formatMoney(data.epsTrailing)}</dd>
                  </>
                )}
                {data.dividendYield != null && data.dividendYield > 0 && (
                  <>
                    <dt>Dividend yield</dt>
                    <dd>{(data.dividendYield * 100).toFixed(2)}%</dd>
                  </>
                )}
                {data.fiftyTwoWeekLow != null && data.fiftyTwoWeekHigh != null && (
                  <>
                    <dt>52-week range</dt>
                    <dd>
                      {formatMoney(data.fiftyTwoWeekLow)} – {formatMoney(data.fiftyTwoWeekHigh)}
                    </dd>
                  </>
                )}
                {data.beta != null && (
                  <>
                    <dt>Beta</dt>
                    <dd>{data.beta.toFixed(2)}</dd>
                  </>
                )}
                {data.profitMargin != null && (
                  <>
                    <dt>Profit margin</dt>
                    <dd>{(data.profitMargin * 100).toFixed(2)}%</dd>
                  </>
                )}
                {data.operatingMargin != null && (
                  <>
                    <dt>Operating margin</dt>
                    <dd>{(data.operatingMargin * 100).toFixed(2)}%</dd>
                  </>
                )}
                {data.revenue != null && (
                  <>
                    <dt>Revenue (ttm)</dt>
                    <dd>{formatBig(data.revenue)}</dd>
                  </>
                )}
                {(data.city || data.country) && (
                  <>
                    <dt>Headquarters</dt>
                    <dd>
                      {[data.city, data.state, data.country].filter(Boolean).join(", ")}
                    </dd>
                  </>
                )}
                {data.employees != null && (
                  <>
                    <dt>Employees</dt>
                    <dd>{data.employees.toLocaleString()}</dd>
                  </>
                )}
                {data.website && (
                  <>
                    <dt>Website</dt>
                    <dd>
                      <a href={data.website} className="cd-link" target="_blank" rel="noreferrer">
                        {data.website.replace(/^https?:\/\//, "")}
                      </a>
                    </dd>
                  </>
                )}
              </dl>
            </section>
          </>
        )}

        <section className="cd-trade" aria-label="Trade">
          <h2 className="cd-h2">Trade</h2>
          <div className={`cd-own ${own <= 0 ? "cd-own-zero" : ""}`}>You own {own} shares</div>
          <div className="cd-trade-qty-field">
            <span className="cd-trade-label" id={`cd-trade-qty-label-${symbol}`}>
              Trade qty
            </span>
            <div className="cd-trade-row">
              <TradeQtyStepper
                id={`cd-trade-qty-${symbol}`}
                labelledBy={`cd-trade-qty-label-${symbol}`}
                value={getQty()}
                onChange={setQty}
                maxBuy={maxBuy}
                own={own}
              />
              <button
                type="button"
                className="cd-btn-buy"
                disabled={!quote || tradeLoading}
                onClick={onBuy}
              >
                Buy
              </button>
              <button
                type="button"
                className="cd-btn-sell"
                disabled={!quote || own <= 0 || tradeLoading}
                onClick={onSell}
              >
                Sell
              </button>
            </div>
            {tradeError ? (
              <p className="cd-trade-err" role="alert">
                {tradeError}
              </p>
            ) : null}
          </div>
        </section>

        <p className="cd-disclaimer">
          Data from Yahoo Finance (delayed). Educational paper trading only.
        </p>
      </div>
    </div>
  );
}
