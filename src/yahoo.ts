/**
 * Yahoo chart API — always uses same-origin `/api/yahoo/...`:
 * - Dev: Vite proxies `/api/yahoo` → Yahoo (see vite.config.ts).
 * - Vercel: `api/yahoo/[...path].js` serverless proxies to Yahoo.
 * - Optional: `VITE_YAHOO_API_BASE` for a custom backend (see server/yahoo-proxy.mjs).
 */

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

/** Yahoo v8/chart returns 404 for some legacy tickers; map to the symbol Yahoo actually serves. */
const YAHOO_CHART_SYMBOL_ALIASES: Record<string, string> = {
  MMC: "MRSH",
};

/** Use when looking up `quotes` by holding symbol — Yahoo may key data under the chart symbol. */
export function normalizeYahooChartSymbol(symbol: string): string {
  const u = symbol.toUpperCase();
  return YAHOO_CHART_SYMBOL_ALIASES[u] ?? u;
}

/**
 * Yahoo path suffix after the domain, e.g. `v8/finance/chart/AAPL?interval=15m&range=5d`.
 * Uses `/api/yahoo?p=...` so Vercel runs a single Edge function (reliable vs catch-all / SPA).
 */
export function yahooProxyUrl(yahooPathSuffix: string): string {
  const suffix = yahooPathSuffix.replace(/^\/+/, "");
  const qs = new URLSearchParams();
  qs.set("p", suffix);

  const apiBase = import.meta.env.VITE_YAHOO_API_BASE;
  if (typeof apiBase === "string" && apiBase.trim().length > 0) {
    const base = apiBase.replace(/\/$/, "");
    return `${base}/api/yahoo?${qs.toString()}`;
  }

  const rel = `/api/yahoo?${qs.toString()}`;
  const relBase = import.meta.env.BASE_URL;
  const root = relBase.endsWith("/") ? relBase.slice(0, -1) : relBase;
  const path = root ? `${root}${rel}` : rel;
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(path, window.location.origin).href;
  }
  return path;
}

function absoluteChartUrl(query: string): string {
  return yahooProxyUrl(`v8/finance/chart/${query}`);
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
  const sym = normalizeYahooChartSymbol(symbol);
  const url = absoluteChartUrl(`${encodeURIComponent(sym)}?${query}`);
  const res = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

type V7QuoteResult = {
  symbol?: string;
  regularMarketPrice?: number | null;
  regularMarketPreviousClose?: number | null;
  postMarketPrice?: number | null;
  preMarketPrice?: number | null;
  bid?: number | null;
  ask?: number | null;
  regularMarketOpen?: number | null;
};

type V7QuoteResponse = {
  quoteResponse?: {
    result?: V7QuoteResult[];
    error?: { description?: string };
  };
};

function numOk(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** Yahoo often omits regularMarketPrice when market is closed; use post/pre/bid or previous close. */
function pickPriceV7(q: V7QuoteResult): number | undefined {
  const candidates = [
    q.regularMarketPrice,
    q.postMarketPrice,
    q.preMarketPrice,
    q.regularMarketOpen,
    q.bid,
    q.ask,
  ];
  for (const n of candidates) {
    if (numOk(n) && n > 0) return n;
  }
  if (numOk(q.regularMarketPreviousClose) && q.regularMarketPreviousClose > 0) {
    return q.regularMarketPreviousClose;
  }
  return undefined;
}

function pickPrevV7(q: V7QuoteResult, price: number): number {
  if (numOk(q.regularMarketPreviousClose) && q.regularMarketPreviousClose > 0) {
    return q.regularMarketPreviousClose;
  }
  return price;
}

function v7ResultToQuoteData(r: V7QuoteResult, fallbackSymbol: string): QuoteData | null {
  const price = pickPriceV7(r);
  if (price === undefined) return null;
  const previousClose = pickPrevV7(r, price);
  const outSym = ((r.symbol ?? "").trim() || fallbackSymbol).trim();
  if (!outSym) return null;
  return {
    price,
    previousClose,
    symbol: outSym,
    sparkline: [previousClose, price],
  };
}

/**
 * Batch v7/quote — one round-trip for many symbols (more reliable than N parallel chart fallbacks on Vercel).
 */
async function fetchV7QuotesBatch(symbols: string[]): Promise<Map<string, QuoteData>> {
  const out = new Map<string, QuoteData>();
  if (symbols.length === 0) return out;
  const joined = symbols.map((s) => normalizeYahooChartSymbol(s)).join(",");
  const url = yahooProxyUrl(`v7/finance/quote?symbols=${joined}`);
  const res = await fetch(url, {
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });
  if (!res.ok) return out;
  const data = (await res.json()) as V7QuoteResponse;
  const results = data.quoteResponse?.result ?? [];
  const byUpper = new Map<string, V7QuoteResult>();
  for (const r of results) {
    const su = (r.symbol ?? "").toUpperCase();
    if (su) byUpper.set(su, r);
  }
  for (const sym of symbols) {
    const u = sym.toUpperCase();
    const n = normalizeYahooChartSymbol(u);
    const r = byUpper.get(u) ?? byUpper.get(n);
    if (!r) continue;
    const qd = v7ResultToQuoteData(r, sym);
    if (qd) out.set(sym, qd);
  }
  return out;
}

/**
 * Yahoo v8/chart sometimes returns "symbol may be delisted" for valid tickers (e.g. ANSS, IPG, K)
 * while v7/quote still returns prices — use as fallback for mini quote + sparkline.
 */
async function fetchV7Quote(symbol: string): Promise<QuoteData | null> {
  const m = await fetchV7QuotesBatch([symbol]);
  return m.get(symbol) ?? null;
}

function hasQuoteInMap(map: Map<string, QuoteData>, sym: string): boolean {
  const u = sym.toUpperCase();
  if (map.has(u)) return true;
  const n = normalizeYahooChartSymbol(u);
  return n !== u && map.has(n);
}

/** Instrument metadata from chart API (works without Yahoo quoteSummary / crumb). */
export type ChartInstrumentMeta = {
  symbol: string;
  shortName?: string;
  longName?: string;
  currency?: string;
  exchangeName?: string;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
};

export async function fetchChartInstrumentMeta(symbol: string): Promise<ChartInstrumentMeta | null> {
  try {
    const data = await fetchChartJson(symbol, "interval=1d&range=5d");
    const err = data.chart?.error;
    if (err) return null;
    const result = data.chart?.result?.[0];
    const m = result?.meta as Record<string, unknown> | undefined;
    if (!m) return null;
    return {
      symbol: String(m.symbol ?? symbol),
      shortName: typeof m.shortName === "string" ? m.shortName : undefined,
      longName: typeof m.longName === "string" ? m.longName : undefined,
      currency: typeof m.currency === "string" ? m.currency : undefined,
      exchangeName: typeof m.exchangeName === "string" ? m.exchangeName : undefined,
      fiftyTwoWeekHigh: typeof m.fiftyTwoWeekHigh === "number" ? m.fiftyTwoWeekHigh : undefined,
      fiftyTwoWeekLow: typeof m.fiftyTwoWeekLow === "number" ? m.fiftyTwoWeekLow : undefined,
    };
  } catch {
    return null;
  }
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

/** Daily bars first (smaller/faster response); fallback intraday for edge cases. */
async function fetchQuoteOnce(symbol: string): Promise<QuoteData> {
  const tryQueries = [
    "interval=1d&range=1mo",
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
  const v7 = await fetchV7Quote(symbol);
  if (v7) return v7;
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

export type FetchQuotesResult = {
  quotes: Map<string, QuoteData>;
  requested: number;
  succeeded: number;
};

export async function fetchQuotes(symbols: string[]): Promise<FetchQuotesResult> {
  const map = new Map<string, QuoteData>();
  const unique = [...new Set(symbols)];
  /** Parallel chunk size — ~5 rounds for 250 tickers (was 24 → ~11 rounds). */
  const batchSize = 50;

  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (sym) => {
        try {
          const q = await fetchQuoteWithRetry(sym);
          map.set(sym, q);
          const alt = q.symbol?.trim().toUpperCase();
          if (alt && alt !== sym.toUpperCase()) {
            map.set(alt, q);
          }
        } catch {
          // skip failed tickers
        }
      })
    );
  }

  /** Second pass: batched v7 for anything still missing (chart+v7 single-symbol can miss on Yahoo edge cases). */
  const missing = unique.filter((sym) => !hasQuoteInMap(map, sym));
  if (missing.length > 0) {
    const v7Chunk = 45;
    for (let j = 0; j < missing.length; j += v7Chunk) {
      const chunk = missing.slice(j, j + v7Chunk);
      try {
        const batchMap = await fetchV7QuotesBatch(chunk);
        for (const sym of chunk) {
          const q = batchMap.get(sym);
          if (!q) continue;
          map.set(sym, q);
          const alt = q.symbol?.trim().toUpperCase();
          if (alt && alt !== sym.toUpperCase()) {
            map.set(alt, q);
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  const succeeded = unique.filter((sym) => hasQuoteInMap(map, sym)).length;
  return { quotes: map, requested: unique.length, succeeded };
}
