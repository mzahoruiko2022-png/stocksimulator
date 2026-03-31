/** Yahoo chart API — `/yahoo` proxied by Vite. Returns price + sparkline from the same response. */

export type QuoteData = {
  price: number;
  previousClose: number;
  symbol: string;
  /** Normalized closes for mini chart (oldest → newest). */
  sparkline: number[];
};

type YahooResult = {
  meta?: {
    regularMarketPrice?: number;
    previousClose?: number;
    chartPreviousClose?: number;
    symbol?: string;
  };
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      close?: (number | null)[];
    }>;
  };
};

type YahooChartResponse = {
  chart?: {
    result?: YahooResult[];
    error?: { description?: string };
  };
};

/** Build absolute URL for any `/yahoo/...` proxied path (chart, quoteSummary, etc.). */
export function yahooProxyUrl(pathAfterYahoo: string): string {
  const path = pathAfterYahoo.startsWith("/yahoo/")
    ? pathAfterYahoo
    : `/yahoo/${pathAfterYahoo.replace(/^\//, "")}`;
  const base = import.meta.env.BASE_URL;
  const root = base.endsWith("/") ? base.slice(0, -1) : base;
  const rel = root ? `${root}${path}` : path;
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(rel, window.location.origin).href;
  }
  return rel;
}

function absoluteChartUrl(query: string): string {
  return yahooProxyUrl(`/yahoo/v8/finance/chart/${query}`);
}

function extractCloses(result: YahooResult): number[] {
  const raw = result.indicators?.quote?.[0]?.close ?? [];
  const out: number[] = [];
  for (const c of raw) {
    if (typeof c === "number" && !Number.isNaN(c)) out.push(c);
  }
  return out;
}

function parseChart(data: YahooChartResponse, requestedSymbol: string): QuoteData {
  const err = data.chart?.error;
  if (err) throw new Error(err.description ?? "Yahoo error");
  const result = data.chart?.result?.[0];
  if (!result) throw new Error("No chart data");

  const meta = result.meta;
  const closes = extractCloses(result);
  const lastClose = closes.length ? closes[closes.length - 1] : undefined;
  const prevClose =
    closes.length >= 2 ? closes[closes.length - 2] : undefined;

  let price = meta?.regularMarketPrice;
  if (typeof price !== "number" && lastClose !== undefined) price = lastClose;

  let previousClose = meta?.previousClose ?? meta?.chartPreviousClose;
  if (typeof previousClose !== "number" && prevClose !== undefined) {
    previousClose = prevClose;
  }
  if (typeof previousClose !== "number" && typeof price === "number") {
    previousClose = price;
  }

  if (typeof price !== "number") throw new Error("No price data");
  if (typeof previousClose !== "number") previousClose = price;

  const spark =
    closes.length >= 2
      ? closes.slice(-Math.min(64, closes.length))
      : [previousClose, price].filter((x) => typeof x === "number");

  return {
    price,
    previousClose,
    symbol: meta?.symbol ?? requestedSymbol,
    sparkline: spark.length >= 2 ? spark : [price, price],
  };
}

async function fetchChartJson(symbol: string, query: string): Promise<YahooChartResponse> {
  const url = absoluteChartUrl(`${encodeURIComponent(symbol)}?${query}`);
  const res = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Periods for the company detail chart (Robinhood-style). */
export type ChartRange = "1D" | "1W" | "1M" | "3M" | "1Y" | "5Y" | "ALL";

const RANGE_QUERY: Record<ChartRange, string> = {
  "1D": "interval=5m&range=1d",
  "1W": "interval=15m&range=5d",
  "1M": "interval=1d&range=1mo",
  "3M": "interval=1d&range=3mo",
  "1Y": "interval=1d&range=1y",
  "5Y": "interval=1wk&range=5y",
  ALL: "interval=1mo&range=max",
};

export type ChartSeriesPoint = { time: number; close: number };

/** Historical points with Unix times (seconds) for chart + date axis. */
export async function fetchChartSeries(
  symbol: string,
  range: ChartRange
): Promise<ChartSeriesPoint[]> {
  const primary = RANGE_QUERY[range];
  const fallbacks =
    range === "1D"
      ? (["interval=15m&range=5d", "interval=1d&range=5d"] as const)
      : range === "ALL"
        ? (["interval=3mo&range=max"] as const)
        : [];

  const tryQueries = [primary, ...fallbacks];
  let lastErr: Error = new Error("No chart");
  for (const q of tryQueries) {
    try {
      const data = await fetchChartJson(symbol, q);
      const err = data.chart?.error;
      if (err) throw new Error(err.description ?? "Chart error");
      const result = data.chart?.result?.[0];
      if (!result) throw new Error("No chart data");
      const ts = result.timestamp ?? [];
      const closes = result.indicators?.quote?.[0]?.close ?? [];
      const points: ChartSeriesPoint[] = [];
      const n = Math.min(ts.length, closes.length);
      for (let i = 0; i < n; i++) {
        const c = closes[i];
        const t = ts[i];
        if (typeof c === "number" && !Number.isNaN(c) && typeof t === "number") {
          points.push({ time: t, close: c });
        }
      }
      if (points.length >= 2) return points;
      throw new Error("Not enough points");
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr;
}

/** Primary: intraday-ish line (jagged). Fallback: daily bars. */
async function fetchQuoteOnce(symbol: string): Promise<QuoteData> {
  const tryQueries = [
    "interval=15m&range=5d",
    "interval=1d&range=3mo",
  ] as const;

  let lastErr: Error = new Error("No data");
  for (const q of tryQueries) {
    try {
      const data = await fetchChartJson(symbol, q);
      return parseChart(data, symbol);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr;
}

async function fetchQuoteWithRetry(symbol: string): Promise<QuoteData> {
  let last: Error = new Error("Failed");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetchQuoteOnce(symbol);
    } catch (e) {
      last = e instanceof Error ? e : new Error(String(e));
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  throw last;
}

export async function fetchQuotes(symbols: string[]): Promise<Map<string, QuoteData>> {
  const map = new Map<string, QuoteData>();
  const unique = [...new Set(symbols)];
  const batchSize = 4;

  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (sym) => {
        try {
          const q = await fetchQuoteWithRetry(sym);
          map.set(sym, q);
        } catch {
          // skip failed tickers
        }
      })
    );
    if (i + batchSize < unique.length) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  return map;
}
