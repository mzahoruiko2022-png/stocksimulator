import react from "@vitejs/plugin-react";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vite";

/** Dev/preview: proxy `/api/yahoo?p=...` → Yahoo (same as Vercel Edge handler). */
function yahooProxyPlugin(): Plugin {
  const attach = (middlewares: Connect.Server) => {
    middlewares.use(async (req, res, next) => {
      const raw = req.url ?? "";
      if (!raw.startsWith("/api/yahoo")) {
        next();
        return;
      }
      const u = new URL(raw, "http://localhost");
      const p = u.searchParams.get("p");
      if (!p) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ chart: { error: { description: "Missing p" } } }));
        return;
      }
      let upstream;
      let decodedPath: string;
      try {
        decodedPath = decodeURIComponent(p).replace(/^\/+/, "");
      } catch {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ chart: { error: { description: "Bad p" } } }));
        return;
      }
      if (!decodedPath.startsWith("v8/finance/chart/")) {
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ chart: { error: { description: "Path not allowed" } } }));
        return;
      }
      try {
        upstream = new URL(decodedPath, "https://query1.finance.yahoo.com/").href;
      } catch {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ chart: { error: { description: "Bad p" } } }));
        return;
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
        const buf = Buffer.from(await r.arrayBuffer());
        res.setHeader("Content-Type", r.headers.get("content-type") ?? "application/json");
        res.statusCode = r.status;
        res.end(buf);
      } catch {
        res.statusCode = 502;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ chart: { error: { description: "Proxy failed" } } }));
      }
    });
  };

  return {
    name: "yahoo-proxy",
    enforce: "pre",
    configureServer(server) {
      attach(server.middlewares);
    },
    configurePreviewServer(server) {
      attach(server.middlewares);
    },
  };
}

export default defineConfig({
  plugins: [yahooProxyPlugin(), react()],
  server: {
    port: 5173,
    strictPort: false,
    /** Listen on all interfaces so localhost / 127.0.0.1 / LAN IP work reliably. */
    host: true,
    /** Opens your default browser when `npm run dev` starts (use the URL it prints if this fails). */
    open: true,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: false,
    open: true,
  },
});
