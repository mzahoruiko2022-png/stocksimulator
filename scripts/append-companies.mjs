/**
 * One-time helper: merged 148 tickers after WDC; PWR + T were added manually so the list is exactly 250.
 * Do not re-run on the current repo — it will no longer match the WDC…]; anchor if `companies.ts` changed.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, "../src/companies.ts");

/** 148 additional US large / mid-cap names (no overlap with existing 102). */
const MORE = [
  ["ADP", "Automatic Data Processing", "Technology"],
  ["AFL", "Aflac", "Financials"],
  ["ALL", "Allstate", "Financials"],
  ["AIG", "American International Group", "Financials"],
  ["ALB", "Albemarle", "Materials"],
  ["ALLE", "Allegion", "Industrial"],
  ["AMCR", "Amcor", "Materials"],
  ["AME", "Ametek", "Industrial"],
  ["AMP", "Ameriprise Financial", "Financials"],
  ["ANSS", "Ansys", "Technology"],
  ["AOS", "A. O. Smith", "Industrial"],
  ["APTV", "Aptiv", "Consumer"],
  ["ARE", "Alexandria Real Estate", "Real Estate"],
  ["ATO", "Atmos Energy", "Utilities"],
  ["AVB", "AvalonBay Communities", "Real Estate"],
  ["AVY", "Avery Dennison", "Materials"],
  ["AXON", "Axon Enterprise", "Industrial"],
  ["BALL", "Ball", "Materials"],
  ["BAX", "Baxter", "Healthcare"],
  ["BXP", "Boston Properties", "Real Estate"],
  ["CAG", "Conagra Brands", "Consumer"],
  ["CBOE", "Cboe Global Markets", "Financials"],
  ["CDNS", "Cadence Design Systems", "Technology"],
  ["CDW", "CDW", "Technology"],
  ["CF", "CF Industries", "Materials"],
  ["CHD", "Church & Dwight", "Consumer"],
  ["CHRW", "C.H. Robinson", "Industrial"],
  ["CL", "Colgate-Palmolive", "Consumer"],
  ["CLX", "Clorox", "Consumer"],
  ["CMCSA", "Comcast", "Communication"],
  ["CNP", "CenterPoint Energy", "Utilities"],
  ["COO", "Cooper Companies", "Healthcare"],
  ["CPB", "Campbell Soup", "Consumer"],
  ["CPT", "Camden Property Trust", "Real Estate"],
  ["CRL", "Charles River Laboratories", "Healthcare"],
  ["CTAS", "Cintas", "Industrial"],
  ["CTSH", "Cognizant", "Technology"],
  ["CTVA", "Corteva", "Materials"],
  ["CZR", "Caesars Entertainment", "Consumer"],
  ["DAL", "Delta Air Lines", "Industrial"],
  ["DHI", "D.R. Horton", "Consumer"],
  ["DLR", "Digital Realty", "Real Estate"],
  ["DOV", "Dover", "Industrial"],
  ["DRI", "Darden Restaurants", "Consumer"],
  ["DTE", "DTE Energy", "Utilities"],
  ["DVN", "Devon Energy", "Energy"],
  ["DXCM", "Dexcom", "Healthcare"],
  ["EIX", "Edison International", "Utilities"],
  ["EL", "Estée Lauder", "Consumer"],
  ["EMN", "Eastman Chemical", "Materials"],
  ["ENPH", "Enphase Energy", "Technology"],
  ["EQT", "EQT", "Energy"],
  ["ESS", "Essex Property Trust", "Real Estate"],
  ["ETN", "Eaton", "Industrial"],
  ["EVRG", "Evergy", "Utilities"],
  ["EXC", "Exelon", "Utilities"],
  ["EXPD", "Expeditors International", "Industrial"],
  ["EXPE", "Expedia Group", "Consumer"],
  ["EXR", "Extra Space Storage", "Real Estate"],
  ["FANG", "Diamondback Energy", "Energy"],
  ["FAST", "Fastenal", "Industrial"],
  ["FDS", "FactSet", "Financials"],
  ["FFIV", "F5", "Technology"],
  ["FICO", "Fair Isaac", "Technology"],
  ["FIS", "Fidelity National Information Services", "Technology"],
  ["FITB", "Fifth Third Bancorp", "Financials"],
  ["FSLR", "First Solar", "Technology"],
  ["FTNT", "Fortinet", "Technology"],
  ["FTV", "Fortive", "Industrial"],
  ["GIS", "General Mills", "Consumer"],
  ["GL", "Globe Life", "Financials"],
  ["GLW", "Corning", "Technology"],
  ["GPC", "Genuine Parts", "Consumer"],
  ["GPN", "Global Payments", "Financials"],
  ["GRMN", "Garmin", "Technology"],
  ["HAS", "Hasbro", "Consumer"],
  ["HIG", "Hartford Financial", "Financials"],
  ["HII", "Huntington Ingalls", "Industrial"],
  ["HLT", "Hilton Worldwide", "Consumer"],
  ["HOLX", "Hologic", "Healthcare"],
  ["HPE", "Hewlett Packard Enterprise", "Technology"],
  ["HPQ", "HP", "Technology"],
  ["HRL", "Hormel Foods", "Consumer"],
  ["HSIC", "Henry Schein", "Healthcare"],
  ["HST", "Host Hotels & Resorts", "Real Estate"],
  ["HWM", "Howmet Aerospace", "Industrial"],
  ["IDXX", "Idexx Laboratories", "Healthcare"],
  ["IP", "International Paper", "Materials"],
  ["IPG", "Interpublic Group", "Communication"],
  ["IQV", "IQVIA", "Healthcare"],
  ["IR", "Ingersoll Rand", "Industrial"],
  ["IRM", "Iron Mountain", "Real Estate"],
  ["IT", "Gartner", "Technology"],
  ["ITW", "Illinois Tool Works", "Industrial"],
  ["IVZ", "Invesco", "Financials"],
  ["JBHT", "J.B. Hunt", "Industrial"],
  ["JCI", "Johnson Controls", "Industrial"],
  ["JKHY", "Jack Henry & Associates", "Technology"],
  ["K", "Kellanova", "Consumer"],
  ["KEY", "KeyCorp", "Financials"],
  ["KHC", "Kraft Heinz", "Consumer"],
  ["KIM", "Kimco Realty", "Real Estate"],
  ["KMB", "Kimberly-Clark", "Consumer"],
  ["KMX", "CarMax", "Consumer"],
  ["KR", "Kroger", "Consumer"],
  ["L", "Loews", "Financials"],
  ["LEN", "Lennar", "Consumer"],
  ["LH", "Labcorp", "Healthcare"],
  ["LHX", "L3Harris Technologies", "Industrial"],
  ["LKQ", "LKQ Corporation", "Consumer"],
  ["LNT", "Alliant Energy", "Utilities"],
  ["LUV", "Southwest Airlines", "Industrial"],
  ["LYB", "LyondellBasell", "Materials"],
  ["MAA", "Mid-America Apartment", "Real Estate"],
  ["MAR", "Marriott International", "Consumer"],
  ["MAS", "Masco", "Industrial"],
  ["MCK", "McKesson", "Healthcare"],
  ["MET", "MetLife", "Financials"],
  ["MGM", "MGM Resorts", "Consumer"],
  ["MKC", "McCormick", "Consumer"],
  ["MLM", "Martin Marietta", "Materials"],
  ["MMM", "3M", "Industrial"],
  ["MOH", "Molina Healthcare", "Healthcare"],
  ["MOS", "Mosaic", "Materials"],
  ["MPWR", "Monolithic Power Systems", "Technology"],
  ["MRNA", "Moderna", "Healthcare"],
  ["MSI", "Motorola Solutions", "Industrial"],
  ["MTB", "M&T Bank", "Financials"],
  ["NCLH", "Norwegian Cruise Line", "Consumer"],
  ["NDSN", "Nordson", "Industrial"],
  ["NI", "NiSource", "Utilities"],
  ["NTRS", "Northern Trust", "Financials"],
  ["NUE", "Nucor", "Materials"],
  ["NVR", "NVR", "Consumer"],
  ["NWSA", "News Corp (Class A)", "Communication"],
  ["O", "Realty Income", "Real Estate"],
  ["ODFL", "Old Dominion Freight", "Industrial"],
  ["ORLY", "O'Reilly Automotive", "Consumer"],
  ["OTIS", "Otis Worldwide", "Industrial"],
  ["OXY", "Occidental Petroleum", "Energy"],
  ["PAYC", "Paycom", "Technology"],
  ["PAYX", "Paychex", "Technology"],
  ["PCAR", "Paccar", "Industrial"],
  ["PEG", "Public Service Enterprise", "Utilities"],
  ["PH", "Parker-Hannifin", "Industrial"],
  ["PKG", "Packaging Corporation", "Materials"],
  ["PNR", "Pentair", "Industrial"],
  ["POOL", "Pool Corporation", "Consumer"],
];

const lines = MORE.map(
  ([symbol, name, sector]) =>
    `  { symbol: "${symbol}", name: "${name.replace(/"/g, '\\"')}", sector: "${sector}" },`
);

let src = fs.readFileSync(target, "utf8");
const existing = [...src.matchAll(/symbol: "([^"]+)"/g)].map((m) => m[1]);
const existingSet = new Set(existing);
for (const [sym] of MORE) {
  if (existingSet.has(sym)) {
    console.error(`Duplicate symbol in base list: ${sym}`);
    process.exit(1);
  }
  existingSet.add(sym);
}

if (MORE.length !== 148) {
  console.error(`Expected 148 additions, got ${MORE.length}`);
  process.exit(1);
}

src = src.replace(
  /^\/\*\* Top ~100 US large-cap tickers.*$/m,
  "/** Top 250 US large / mid-cap tickers — prices via Yahoo proxy. */"
);
src = src.replace(
  /(\{ symbol: "WDC", name: "Western Digital", sector: "Technology" \},\n)(\];)/,
  `$1${lines.join("\n")}\n$2`
);

fs.writeFileSync(target, src);
console.log(`Updated ${target}: ${existing.length} + ${MORE.length} = ${existing.length + MORE.length} companies`);
