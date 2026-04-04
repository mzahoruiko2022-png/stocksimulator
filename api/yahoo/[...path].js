/**
 * Vercel serverless: proxies /api/yahoo/* → Yahoo Finance chart API.
 * vercel.json rewrites /yahoo/* → /api/yahoo/* so the browser keeps same-origin /yahoo/... URLs.
 */
export default async function handler(req, res) {
  const u = new URL(req.url, "http://localhost");
  const rest = u.pathname.replace(/^\/api\/yahoo\/?/, "") || "";
  const upstreamUrl = `https://query1.finance.yahoo.com/${rest}${u.search}`;

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
