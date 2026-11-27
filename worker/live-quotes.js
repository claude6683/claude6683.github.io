// Cloudflare Worker: Live Show 시세 중계 (CORS 허용, 5초 캐시)
//  GET /?q=NVDA,GOOGL,^KS11   -> 야후 시세 묶음 {SYM:{p,pc,t}}  (p=현재가, pc=전일 종가, t=마지막 체결 ms)
//  GET /?s=nvidia             -> 야후 종목 검색 [{symbol,name,type,exch}] (최대 8개)
//  GET /?u=<url>              -> 허용된 거래소/야후 주소를 대신 받아 전달 (브라우저 CORS 우회)
const ALLOW = {
  "query1.finance.yahoo.com": ["/v8/finance/chart/"],
  "query2.finance.yahoo.com": ["/v8/finance/chart/", "/v1/finance/search"],
  "api.upbit.com": ["/v1/candles/"],
  "api.binance.com": ["/api/v3/klines"],
  "api.hyperliquid.xyz": ["/info"],
  "api.backpack.exchange": ["/api/v1/klines", "/api/v1/ticker"],
};
const UA = { "user-agent": "Mozilla/5.0 (compatible; LiveShow/1.0)" };

function parseQuote(j) {
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r) return null;
  const meta = r.meta || {};
  const ts = r.timestamp || [];
  const cl = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [];
  let p = null, t = null;
  for (let i = cl.length - 1; i >= 0; i--) {
    if (cl[i] != null) { p = cl[i]; t = ts[i] * 1000; break; }
  }
  if (p == null) { p = meta.regularMarketPrice; t = (meta.regularMarketTime || 0) * 1000; }
  if (p == null) return null;
  const pc = meta.chartPreviousClose != null ? meta.chartPreviousClose : meta.previousClose;
  return { p, pc: pc == null ? null : pc, t };
}

async function yahooQuote(sym) {
  const u = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(sym) +
    "?range=1d&interval=1m&includePrePost=true";
  const r = await fetch(u, { headers: UA, cf: { cacheTtl: 5, cacheEverything: true } });
  if (!r.ok) return null;
  return parseQuote(await r.json());
}

export default {
  async fetch(req) {
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "*",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(req.url);
    try {
      const sq = (url.searchParams.get("s") || "").trim().slice(0, 40);
      if (sq) {
        const r = await fetch("https://query2.finance.yahoo.com/v1/finance/search?newsCount=0&quotesCount=8&lang=en-US&q=" + encodeURIComponent(sq),
          { headers: UA, cf: { cacheTtl: 60, cacheEverything: true } });
        if (!r.ok) return new Response("[]", { status: 502, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" } });
        const j = await r.json();
        const ok = new Set(["EQUITY", "ETF", "INDEX", "FUTURE", "CURRENCY", "CRYPTOCURRENCY", "MUTUALFUND"]);
        const out = ((j && j.quotes) || []).filter(x => x.symbol && ok.has(x.quoteType))
          .map(x => ({ symbol: x.symbol, name: x.shortname || x.longname || "", type: x.quoteType, exch: x.exchDisp || x.exchange || "" }));
        return new Response(JSON.stringify(out), {
          headers: { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" },
        });
      }
      const q = url.searchParams.get("q");
      if (q) {
        const syms = q.split(",").map(s => s.trim()).filter(Boolean).slice(0, 20);
        const out = {};
        await Promise.all(syms.map(async s => {
          try { const v = await yahooQuote(s); if (v) out[s] = v; } catch (e) { /* 한 종목 실패는 건너뜀 */ }
        }));
        return new Response(JSON.stringify(out), {
          headers: { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=5" },
        });
      }
      const u = url.searchParams.get("u");
      if (u) {
        const t = new URL(u);
        const pre = ALLOW[t.hostname];
        if (t.protocol !== "https:" || !pre || !pre.some(x => t.pathname.startsWith(x))) {
          return new Response("forbidden", { status: 403, headers: cors });
        }
        const r = await fetch(t.toString(), { headers: UA, redirect: "manual", cf: { cacheTtl: 5, cacheEverything: true } });
        if (r.status >= 300 && r.status < 400) return new Response("redirect blocked", { status: 502, headers: cors });
        return new Response(r.body, {
          status: r.status,
          headers: { ...cors, "content-type": r.headers.get("content-type") || "application/json", "x-content-type-options": "nosniff", "cache-control": "public, max-age=5" },
        });
      }
      return new Response("live-quotes ok", { headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: "upstream error" }), { status: 502, headers: { ...cors, "content-type": "application/json" } });
    }
  },
};
