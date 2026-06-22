// Cloudflare Worker — The Odds API proxy
//
// Deploy:
//   1. wrangler deploy scripts/odds-proxy-worker.js --name odds-proxy
//   2. wrangler secret put API_KEY   # your The Odds API key
//
// Frontend uses VITE_ODDS_PROXY_URL=https://odds-proxy.<your-sub>.workers.dev
// The API key never leaves Cloudflare's environment.

const API_BASE = "https://api.the-odds-api.com/v4";

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-max-age": "86400",
        },
      });
    }

    const url = new URL(request.url);

    // Build target URL: strip any apiKey the client may send, then add ours
    const params = new URLSearchParams(url.search);
    params.delete("apiKey");
    params.append("apiKey", env.API_KEY);

    const target = `${API_BASE}${url.pathname}?${params.toString()}`;

    try {
      const res = await fetch(target);

      // Return 500 on upstream error so frontend can distinguish
      if (!res.ok) {
        const body = await res.text();
        console.error(`[odds-proxy] Upstream ${res.status}:`, body);
        return new Response(body, {
          status: res.status,
          headers: { "access-control-allow-origin": "*" },
        });
      }

      const body = await res.json();
      return new Response(JSON.stringify(body), {
        headers: {
          "access-control-allow-origin": "*",
          "content-type": "application/json",
        },
      });
    } catch (e) {
      console.error("[odds-proxy] Network error:", e);
      return new Response(JSON.stringify({ error: e.message }), {
        status: 502,
        headers: { "access-control-allow-origin": "*", "content-type": "application/json" },
      });
    }
  },
};
