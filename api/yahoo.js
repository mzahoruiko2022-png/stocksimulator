/**
 * Single Vercel function (no [...path] folder) — Yahoo requires browser-like headers.
 * Client calls: /api/yahoo?p=<encodeURIComponent("v8/finance/chart/...")> or v7/finance/quote?...
 */
export const config = { runtime: "edge" };

export default async function handler(request) {
  const url = new URL(request.url);
  const p = url.searchParams.get("p");
  if (!p || !p.trim()) {
    return new Response(
      JSON.stringify({
        chart: { error: { description: "Missing ?p= Yahoo path" } },
      }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(p).replace(/^\/+/, "");
  } catch {
    return new Response(
      JSON.stringify({
        chart: { error: { description: "Bad ?p= path" } },
      }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }
  const allowed =
    decodedPath.startsWith("v8/finance/chart/") || decodedPath.startsWith("v7/finance/quote");
  if (!allowed) {
    return new Response(
      JSON.stringify({
        chart: { error: { description: "Path not allowed" } },
      }),
      { status: 403, headers: { "content-type": "application/json" } }
    );
  }

  let upstream;
  try {
    upstream = new URL(decodedPath, "https://query1.finance.yahoo.com/").href;
  } catch {
    return new Response(
      JSON.stringify({
        chart: { error: { description: "Bad ?p= path" } },
      }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const r = await fetch(upstream, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://finance.yahoo.com/quote/",
        Origin: "https://finance.yahoo.com",
      },
    });
    const body = await r.arrayBuffer();
    const ct = r.headers.get("content-type") ?? "application/json";
    return new Response(body, {
      status: r.status,
      headers: { "content-type": ct },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        chart: {
          error: { description: e instanceof Error ? e.message : "Proxy failed" },
        },
      }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
}
