import react from "@vitejs/plugin-react";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vite";

/** Fetch-based proxy — runs early so /yahoo always hits Yahoo (fixes preview + stubborn dev setups). */
function yahooProxyPlugin(): Plugin {
  const attach = (middlewares: Connect.Server) => {
    middlewares.use(async (req, res, next) => {
      const raw = req.url ?? "";
      if (!raw.startsWith("/yahoo")) {
        next();
        return;
      }
      const path = raw.slice("/yahoo".length) || "/";
      const upstream = `https://query1.finance.yahoo.com${path}`;
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

const yahooProxy = {
  "/yahoo": {
    target: "https://query1.finance.yahoo.com",
    changeOrigin: true,
    secure: true,
    rewrite: (path: string) => path.replace(/^\/yahoo/, ""),
    configure: (proxy: import("http-proxy").Server) => {
      proxy.on("proxyReq", (proxyReq) => {
        proxyReq.setHeader("Referer", "https://finance.yahoo.com/quote/");
        proxyReq.setHeader("Origin", "https://finance.yahoo.com");
      });
    },
  },
} as const;

export default defineConfig({
  plugins: [yahooProxyPlugin(), react()],
  server: {
    port: 5173,
    strictPort: false,
    /** Listen on all interfaces so localhost / 127.0.0.1 / LAN IP work reliably. */
    host: true,
    /** Opens your default browser when `npm run dev` starts (use the URL it prints if this fails). */
    open: true,
    proxy: yahooProxy,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: false,
    open: true,
    proxy: yahooProxy,
  },
});
