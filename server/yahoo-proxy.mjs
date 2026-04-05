/**
 * Yahoo Finance proxy — use in production so the browser never calls Yahoo directly.
 *
 *   PORT=8787 node server/yahoo-proxy.mjs
 *
 * CORS_ORIGIN: comma-separated list of allowed web app origins (e.g. https://app.example.com).
 */
import express from "express";
import cors from "cors";

const PORT = Number(process.env.PORT || 8787);
const UPSTREAM = "https://query1.finance.yahoo.com";

const defaultOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean)
  : defaultOrigins;

const app = express();

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
  })
);

app.get("/api/yahoo", async (req, res) => {
  const p = req.query.p;
  if (!p || typeof p !== "string") {
    res.status(400).json({ chart: { error: { description: "Missing p query param" } } });
    return;
  }
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(p).replace(/^\/+/, "");
  } catch {
    res.status(400).json({ chart: { error: { description: "Bad p" } } });
    return;
  }
  if (!decodedPath.startsWith("v8/finance/chart/")) {
    res.status(403).json({ chart: { error: { description: "Path not allowed" } } });
    return;
  }

  let upstreamUrl;
  try {
    upstreamUrl = new URL(decodedPath, `${UPSTREAM}/`).href;
  } catch {
    res.status(400).json({ chart: { error: { description: "Bad p" } } });
    return;
  }

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
    res.status(r.status).set("Content-Type", ct).send(buf);
  } catch (e) {
    res.status(502).json({
      chart: { error: { description: e instanceof Error ? e.message : "Proxy failed" } },
    });
  }
});

app.listen(PORT, () => {
  console.log(`[yahoo-proxy] listening on http://127.0.0.1:${PORT}`);
  console.log(`[yahoo-proxy] CORS allowed origins: ${allowedOrigins.join(", ")}`);
});
