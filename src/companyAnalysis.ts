import { yahooProxyUrl } from "./yahoo";

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

function rawNum(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "object" && v !== null && "raw" in v) {
    const r = (v as { raw?: unknown }).raw;
    if (typeof r === "number" && Number.isFinite(r)) return r;
  }
  return undefined;
}

function rawStr(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null && "fmt" in v) {
    const f = (v as { fmt?: unknown }).fmt;
    if (typeof f === "string") return f;
  }
  return undefined;
}

export async function fetchCompanyAnalysis(symbol: string): Promise<CompanyAnalysis> {
  const enc = encodeURIComponent(symbol);
  const modules = encodeURIComponent(
    "assetProfile,summaryDetail,summaryProfile,financialData,defaultKeyStatistics,price"
  );
  const url = yahooProxyUrl(`/yahoo/v10/finance/quoteSummary/${enc}?modules=${modules}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as {
    quoteSummary?: { result?: unknown[]; error?: { description?: string } };
  };
  const err = data.quoteSummary?.error;
  if (err) throw new Error(err.description ?? "Yahoo error");
  const r = data.quoteSummary?.result?.[0] as Record<string, Record<string, unknown>> | undefined;
  if (!r) throw new Error("No company data");

  const asset = r.assetProfile ?? {};
  const summary = r.summaryProfile ?? {};
  const detail = r.summaryDetail ?? {};
  const fin = r.financialData ?? {};
  const stats = r.defaultKeyStatistics ?? {};

  return {
    symbol,
    shortName: rawStr(summary.shortName) ?? rawStr(summary.symbol) ?? symbol,
    longName: rawStr(summary.longName) ?? rawStr(summary.name) ?? rawStr(summary.title),
    sector: rawStr(asset.sector) ?? rawStr(summary.sector),
    industry: rawStr(asset.industry) ?? rawStr(summary.industry),
    summary: typeof asset.longBusinessSummary === "string" ? asset.longBusinessSummary : undefined,
    website: typeof asset.website === "string" ? asset.website : undefined,
    employees: rawNum(asset.fullTimeEmployees),
    city: typeof asset.city === "string" ? asset.city : undefined,
    state: typeof asset.state === "string" ? asset.state : undefined,
    country: typeof asset.country === "string" ? asset.country : undefined,
    marketCap: rawNum(detail.marketCap),
    trailingPE: rawNum(detail.trailingPE),
    forwardPE: rawNum(detail.forwardPE),
    epsTrailing: rawNum(stats.trailingEps),
    dividendYield: rawNum(detail.dividendYield),
    fiftyTwoWeekHigh: rawNum(detail.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: rawNum(detail.fiftyTwoWeekLow),
    beta: rawNum(stats.beta),
    profitMargin: rawNum(fin.profitMargins),
    operatingMargin: rawNum(fin.operatingMargins),
    revenue: rawNum(fin.totalRevenue),
    revenuePerShare: rawNum(stats.revenuePerShare),
    enterpriseValue: rawNum(stats.enterpriseValue),
  };
}
