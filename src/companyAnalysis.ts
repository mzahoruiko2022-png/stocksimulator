import { fetchChartInstrumentMeta } from "./yahoo";

export type CompanyAnalysis = {
  symbol: string;
  shortName?: string;
  longName?: string;
  sector?: string;
  industry?: string;
  summary?: string;
  website?: string;
  employees?: number;
  city?: string;
  state?: string;
  country?: string;
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  epsTrailing?: number;
  dividendYield?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  beta?: number;
  profitMargin?: number;
  operatingMargin?: number;
  revenue?: number;
  revenuePerShare?: number;
  enterpriseValue?: number;
};

/** Strip parentheticals (e.g. class of stock) for Wikipedia matching. */
function cleanNameForWiki(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWikipediaSummaryByTitle(titleUnderscored: string): Promise<string | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titleUnderscored)}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { type?: string; extract?: string };
  if (data.type === "disambiguation" || typeof data.extract !== "string" || !data.extract.trim()) {
    return null;
  }
  return data.extract.trim();
}

async function searchWikipediaExtract(query: string): Promise<string | null> {
  if (query.length < 2) return null;
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srsearch=${encodeURIComponent(query)}&srlimit=1`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { query?: { search?: Array<{ title: string }> } };
  const title = data.query?.search?.[0]?.title;
  if (!title) return null;
  return fetchWikipediaSummaryByTitle(title.replace(/\s+/g, "_"));
}

/**
 * Company profile for the detail sheet.
 * Yahoo `quoteSummary` requires a crumb cookie and fails from the browser; we use chart meta (same as prices)
 * plus a short Wikipedia extract for the overview.
 */
export async function fetchCompanyAnalysis(symbol: string): Promise<CompanyAnalysis> {
  const meta = await fetchChartInstrumentMeta(symbol);
  if (!meta) {
    throw new Error("No instrument data");
  }

  const baseName = cleanNameForWiki(meta.longName ?? meta.shortName ?? symbol);
  let summary: string | null = null;

  if (baseName.length >= 2) {
    summary = await fetchWikipediaSummaryByTitle(baseName.replace(/\s+/g, "_"));
  }
  if (!summary && baseName.length >= 2) {
    summary = await searchWikipediaExtract(baseName);
  }
  if (!summary && meta.shortName) {
    const shortClean = cleanNameForWiki(meta.shortName);
    if (shortClean !== baseName) {
      summary = await searchWikipediaExtract(shortClean);
    }
  }

  return {
    symbol,
    shortName: meta.shortName,
    longName: meta.longName,
    summary: summary ?? undefined,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
  };
}
