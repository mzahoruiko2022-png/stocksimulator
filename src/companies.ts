/** Curated real tickers — names for display; prices come from Yahoo Finance in dev. */
export type Company = { symbol: string; name: string; sector: string };

export const COMPANIES: Company[] = [
  { symbol: "AAPL", name: "Apple", sector: "Technology" },
  { symbol: "MSFT", name: "Microsoft", sector: "Technology" },
  { symbol: "GOOGL", name: "Alphabet (Class A)", sector: "Technology" },
  { symbol: "AMZN", name: "Amazon", sector: "Consumer" },
  { symbol: "META", name: "Meta Platforms", sector: "Technology" },
  { symbol: "NVDA", name: "NVIDIA", sector: "Technology" },
  { symbol: "TSLA", name: "Tesla", sector: "Automotive" },
  { symbol: "BRK-B", name: "Berkshire Hathaway", sector: "Financials" },
  { symbol: "JPM", name: "JPMorgan Chase", sector: "Financials" },
  { symbol: "V", name: "Visa", sector: "Financials" },
  { symbol: "UNH", name: "UnitedHealth", sector: "Healthcare" },
  { symbol: "JNJ", name: "Johnson & Johnson", sector: "Healthcare" },
  { symbol: "WMT", name: "Walmart", sector: "Consumer" },
  { symbol: "PG", name: "Procter & Gamble", sector: "Consumer" },
  { symbol: "MA", name: "Mastercard", sector: "Financials" },
  { symbol: "HD", name: "Home Depot", sector: "Consumer" },
  { symbol: "DIS", name: "Walt Disney", sector: "Communication" },
  { symbol: "NFLX", name: "Netflix", sector: "Communication" },
  { symbol: "AMD", name: "AMD", sector: "Technology" },
  { symbol: "INTC", name: "Intel", sector: "Technology" },
  { symbol: "COST", name: "Costco", sector: "Consumer" },
  { symbol: "PEP", name: "PepsiCo", sector: "Consumer" },
  { symbol: "KO", name: "Coca-Cola", sector: "Consumer" },
  { symbol: "XOM", name: "Exxon Mobil", sector: "Energy" },
  { symbol: "CVX", name: "Chevron", sector: "Energy" },
  { symbol: "BAC", name: "Bank of America", sector: "Financials" },
  { symbol: "PFE", name: "Pfizer", sector: "Healthcare" },
  { symbol: "MCD", name: "McDonald's", sector: "Consumer" },
  { symbol: "NKE", name: "Nike", sector: "Consumer" },
  { symbol: "CRM", name: "Salesforce", sector: "Technology" },
];

export function companyBySymbol(symbol: string): Company | undefined {
  return COMPANIES.find((c) => c.symbol === symbol);
}
