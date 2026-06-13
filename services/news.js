/* =====================================================================
   NEXUS AI — Noticias reales (capa adicional, no toca motor/scoring/senales)
   Fuente: feeds RSS publicos de medios cripto, convertidos a JSON por
   api.rss2json.com (keyless, CORS *). Cacheado 30 min via NexusCache.
   Sentimiento e IMPACTO son ESTIMACIONES heuristicas por palabras clave
   (sin ML); se etiquetan como estimados. Si todo falla, cae al respaldo
   de data.js (window.NEXUS_FALLBACK.news) para que la vista nunca quede vacia.
   ===================================================================== */
window.NexusNews = (function () {
  "use strict";
  const CONF = window.NEXUS_CONFIG;
  const KEY = "news.v1";
  const TTL = 30 * 60 * 1000; // 30 min
  const RSS = "https://api.rss2json.com/v1/api.json?rss_url=";
  const FEEDS = [
    { url: "https://cointelegraph.com/rss", source: "Cointelegraph" },
    { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", source: "CoinDesk" },
    { url: "https://decrypt.co/feed", source: "Decrypt" },
  ];

  // Diccionarios de sentimiento/impacto (estimacion, no ML).
  const BULL = ["approval", "approve", "etf", "surge", "surges", "rally", "soar", "gains", "gain", "bullish", "adopt", "adoption", "partnership", "integration", "integrat", "upgrade", "record", "all-time high", "ath", "institutional", "inflow", "inflows", "launch", "breakthrough", "milestone", "buy", "accumulat", "rise", "rises", "jump", "boost", "support", "win", "wins", "green"];
  const BEAR = ["hack", "hacked", "exploit", "lawsuit", "sues", "sue", "ban", "banned", "crash", "plunge", "plummet", "dump", "sell-off", "selloff", "bearish", "outflow", "outflows", "liquidation", "liquidat", "scam", "fraud", "delist", "halt", "warning", "warns", "fine", "fined", "unlock", "down", "drop", "drops", "fall", "falls", "decline", "fear", "risk", "loss", "losses", "red"];
  const HIGH = ["etf", "sec", "lawsuit", "sues", "hack", "ban", "regulation", "regulat", "halving", "approval", "approve", "fed", "court", "billion", "treasury", "blackrock"];
  const MED = ["partnership", "integration", "upgrade", "listing", "unlock", "fund", "million", "launch", "adoption", "institutional"];

  // Alias por moneda monitoreada para asociar noticias a activos.
  const ALIASES = {
    BTC: ["bitcoin", "btc"], ETH: ["ethereum", "ether", "eth"], SOL: ["solana", "sol"],
    BNB: ["binance coin", "bnb", "binance"], XRP: ["xrp", "ripple"], ADA: ["cardano", "ada"],
    AVAX: ["avalanche", "avax"], DOGE: ["dogecoin", "doge"], LINK: ["chainlink", "link"],
    DOT: ["polkadot", "dot"], TON: ["toncoin", "the open network", "ton "], ATOM: ["cosmos", "atom"],
  };
  const monitored = (CONF.coins || []).map((c) => c.symbol);

  const stripHtml = (s) => (s || "").replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
  function count(text, dict) { let n = 0; for (const w of dict) { if (text.indexOf(w) > -1) n++; } return n; }

  function classify(title, body) {
    const t = (title + " " + body).toLowerCase();
    const b = count(t, BULL), s = count(t, BEAR);
    const sentiment = b - s >= 1 ? "positivo" : s - b >= 1 ? "negativo" : "neutral";
    const impact = count(t, HIGH) >= 1 ? "alto" : count(t, MED) >= 1 ? "medio" : "bajo";
    return { sentiment, impact };
  }
  function matchSym(title, body) {
    const t = (" " + title + " " + body + " ").toLowerCase();
    for (const sym of monitored) {
      const al = ALIASES[sym] || [sym.toLowerCase()];
      for (const a of al) { if (t.indexOf(a) > -1) return sym; }
    }
    return null;
  }
  function ago(ts) {
    if (!ts) return "";
    const d = Math.max(0, Date.now() - ts), m = Math.round(d / 60000);
    if (m < 60) return "hace " + m + " min";
    const h = Math.round(m / 60); if (h < 24) return "hace " + h + " h";
    return "hace " + Math.round(h / 24) + " d";
  }

  async function fetchFeed(feed) {
    const res = await fetch(RSS + encodeURIComponent(feed.url), { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(feed.source + " " + res.status);
    const j = await res.json();
    if (j.status !== "ok" || !Array.isArray(j.items)) throw new Error(feed.source + ": feed invalido");
    return j.items.slice(0, 12).map((it) => {
      const title = (it.title || "").trim();
      const body = stripHtml(it.description || it.content || "");
      const ts = it.pubDate ? Date.parse(it.pubDate.replace(" ", "T") + "Z") : 0;
      const cl = classify(title, body);
      return {
        title, source: feed.source, link: it.link || it.guid || "#",
        ts: isFinite(ts) ? ts : 0, time: ago(isFinite(ts) ? ts : 0),
        sentiment: cl.sentiment, impact: cl.impact, sym: matchSym(title, body),
        estimated: true,
      };
    });
  }

  async function fetchAll() {
    const settled = await Promise.allSettled(FEEDS.map(fetchFeed));
    let items = [];
    settled.forEach((r) => { if (r.status === "fulfilled") items = items.concat(r.value); });
    // dedup por titulo, ordenar por fecha desc
    const seen = new Set(), out = [];
    items.sort((a, b) => (b.ts || 0) - (a.ts || 0)).forEach((n) => {
      const k = n.title.toLowerCase().slice(0, 60);
      if (!seen.has(k)) { seen.add(k); out.push(n); }
    });
    return out.slice(0, 21);
  }

  let _loading = false;
  async function load(force) {
    const C = window.NexusCache;
    if (!force) { const c = C.get(KEY, TTL); if (c && c.length) return { news: c, source: "live" }; }
    if (_loading) { const c = C.get(KEY, Infinity); if (c) return { news: c, source: "cache" }; }
    _loading = true;
    try {
      const news = await fetchAll();
      if (news.length) { C.set(KEY, news); return { news, source: "live" }; }
      throw new Error("sin items");
    } catch (e) {
      const stale = C.get(KEY, Infinity);
      if (stale && stale.length) return { news: stale, source: "cache", error: e.message };
      const fb = (window.NEXUS_FALLBACK && window.NEXUS_FALLBACK.news) || [];
      return { news: fb, source: "fallback", error: e.message };
    } finally { _loading = false; }
  }

  return { load, classify, matchSym, monitored };
})();
