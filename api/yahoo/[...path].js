/**
 * Vercel serverless: proxies /api/yahoo/* → Yahoo Finance chart API.
 * vercel.json rewrites /yahoo/* → /api/yahoo/*
 *
 * Catch-all routes: Vercel puts path segments in req.query.path; req.url may be incomplete.
 */
export default async function handler(req, res) {
  const segments = req.query?.path;
  let rest = "";
  if (segments != null && segments !== "") {
    rest = Array.isArray(segments) ? segments.join("/") : String(segments);
  }

  if (!rest) {
    const host = req.headers?.host || "localhost";
    const raw = req.url || "";
    const full = raw.startsWith("http") ? raw : `https://${host}${raw}`;
    let pathname = "";
    try {
      pathname = new URL(full).pathname;
    } catch {
      pathname = raw.split("?")[0] || "";
    }
    for (const prefix of ["/api/yahoo/", "/api/yahoo"]) {
      if (pathname.startsWith(prefix)) {
        rest = pathname.slice(prefix.length).replace(/^\/+/, "");
        break;
      }
    }
  }

  if (!rest) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        chart: {
          error: {
            description: "Yahoo proxy: empty path (check Vercel routing)",
          },
        },
      })
    );
    return;
  }

  const host = req.headers?.host || "localhost";
  const raw = req.url || "";
  const full = raw.startsWith("http") ? raw : `https://${host}${raw}`;
  let uSearch = "";
  try {
    uSearch = new URL(full).search;
  } catch {
    if (raw.includes("?")) uSearch = "?" + raw.split("?").slice(1).join("?");
  }

  const upstreamUrl = `https://query1.finance.yahoo.com/${rest}${uSearch}`;

  try {
    const r = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://finance.yahoo.com/quote/",
        Origin: "https://finance.yahoo.com",
      },
    });
    const buf = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get("content-type") ?? "application/json";
    res.statusCode = r.status;
    res.setHeader("Content-Type", ct);
    res.end(buf);
  } catch (e) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        chart: {
          error: { description: e instanceof Error ? e.message : "Proxy failed" },
        },
      })
    );
  }
}
