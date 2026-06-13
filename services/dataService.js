/* =====================================================================
   NEXUS AI — Orquestador de datos (mercado real + análisis técnico)
   - Mercado: CoinGecko /coins/markets + /global, Fear&Greed (Alternative.me).
   - Análisis (Paso 2): históricos diarios reales (/coins/{id}/market_chart)
     → Indicators + Analysis → score, señal, confianza, riesgo, motivos, alertas.
   Arma window.NEXUS_DATA con el MISMO shape del prototipo (la interfaz no cambia)
   y cachea vía NexusCache. Si algo falla, cae al fallback de data.js.
   ===================================================================== */
window.DataService = (function () {
  "use strict";
  const CONF = window.NEXUS_CONFIG;
  const ids = CONF.coins.map((c) => c.id);
  const SNAP = "snapshot.v3"; // v3: el shape incluye análisis técnico + desglose de factores

  // Estado del sistema (observabilidad, lo lee la vista "Sistema"). Sin lógica de negocio.
  let _status = { source: null, coingecko: null, global: null, fng: null, engineSignals: null, error: null };
  function status() {
    const age = window.NexusCache.age(SNAP);
    return Object.assign({}, _status, { lastUpdate: isFinite(age) ? Date.now() - age : null });
  }

  /* --- utilidades --- */
  const r1 = (n) => Math.round(n * 10) / 10;
  const r2 = (n) => Math.round(n * 100) / 100;
  const num = (...xs) => { for (const x of xs) { if (typeof x === "number" && isFinite(x)) return x; } return 0; };
  const ensure2 = (a) => (a && a.length >= 2 ? a : [1, 1]);
  function downsample(arr, n) {
    if (!arr || arr.length <= n) return (arr || []).slice();
    const out = [], step = (arr.length - 1) / (n - 1);
    for (let i = 0; i < n; i++) out.push(arr[Math.round(i * step)]);
    return out;
  }

  // Series para gráficos: 1D/1S desde el sparkline de 7 d; 1M/1A desde el histórico diario real.
  function buildSeries(spark, closes) {
    const s = Array.isArray(spark) ? spark : [];
    const c = Array.isArray(closes) ? closes : [];
    return {
      "1D": ensure2(s.slice(-24)),
      "1S": ensure2(s.length ? downsample(s, 60) : c.slice(-7)),
      "1M": ensure2(c.length ? c.slice(-30) : s),
      "1A": ensure2(c.length ? downsample(c, 60) : (s.length ? downsample(s, 52) : [])),
    };
  }

  // Concurrencia limitada para no saturar el límite de CoinGecko.
  function pool(items, size, fn) {
    const q = items.slice(), workers = [];
    for (let i = 0; i < size; i++) workers.push((async () => { while (q.length) await fn(q.shift()); })());
    return Promise.all(workers);
  }

  // Históricos diarios (~365 d) por moneda, cacheados 6 h. Una moneda que falle
  // queda en null y no rompe el resto (su análisis será limitado).
  async function loadHistories() {
    const C = window.NexusCache, out = {};
    await pool(ids, 2, async (id) => {
      const cached = C.get("hist." + id, CONF.cache.history);
      if (cached) { out[id] = cached; return; }
      try {
        const j = await window.CoinGecko.getMarketChart(id, CONF.historyDays);
        const val = {
          ts: (j.prices || []).map((p) => p[0]),            // timestamps para evaluar el historial por fecha
          closes: (j.prices || []).map((p) => p[1]),
          volumes: (j.total_volumes || []).map((v) => v[1]),
        };
        C.set("hist." + id, val);
        out[id] = val;
      } catch (e) { out[id] = null; }
    });
    return out;
  }

  function assemble(markets, global, fng, histories, prev) {
    const byId = {};
    (markets || []).forEach((m) => { byId[m.id] = m; });
    const prevSig = {}; // señal del snapshot anterior, para detectar cambios reales
    if (prev && prev.coins) prev.coins.forEach((pc) => { prevSig[pc.symbol] = pc.signal; });

    const coins = CONF.coins.map((cc) => {
      const m = byId[cc.id];
      if (!m) return null;
      const spark = (m.sparkline_in_7d && m.sparkline_in_7d.price) || [];
      const h = (histories && histories[cc.id]) || null;
      const closes = h ? h.closes : [];
      const volumes = h ? h.volumes : [];
      const change24h = num(m.price_change_percentage_24h_in_currency, m.price_change_percentage_24h);
      const change7d = num(m.price_change_percentage_7d_in_currency);

      const a = window.Analysis.analyze(
        { price: m.current_price, marketCap: m.market_cap, volume: m.total_volume, change24h, change7d },
        closes, volumes
      );

      return {
        id: cc.id, symbol: cc.symbol, name: m.name || cc.name, color: cc.color, fg: cc.fg,
        rank: m.market_cap_rank,
        // ---- mercado real (CoinGecko /coins/markets) ----
        price: m.current_price, change24h, change7d,
        volume: m.total_volume, marketCap: m.market_cap,
        series: buildSeries(spark, closes),
        // ---- análisis técnico real (Paso 2) ----
        rsi: a.rsi, macd: a.macd, ema20: a.ema20, ema50: a.ema50, ema200: a.ema200,
        trend: a.trend, support: a.support, resistance: a.resistance,
        signal: a.signal, score: a.score, confidence: a.confidence, risk: a.risk, reasons: a.reasons,
        factors: a.factors,
        _emaCross: a.emaCross, _volRatio: a.volRatio,
        _signalChange: (prevSig[cc.symbol] && a.signal && prevSig[cc.symbol] !== a.signal) ? { from: prevSig[cc.symbol], to: a.signal } : null,
      };
    }).filter(Boolean);

    const alerts = window.Analysis.deriveAlerts(coins, CONF.thresholds);
    return { coins, market: buildOverview(coins, global, fng), news: fallbackNews(), alerts };
  }

  function buildOverview(coins, g, fng) {
    const gd = g && g.data ? g.data : null; // /global viene envuelto en { data: {...} }
    const sumMcap = coins.reduce((s, c) => s + (c.marketCap || 0), 0);
    const sumVol = coins.reduce((s, c) => s + (c.volume || 0), 0);
    const btc = coins.find((c) => c.symbol === "BTC");
    const f = fng || { value: 50, label: "Neutral" };
    const dom = gd ? r1(gd.market_cap_percentage.btc)
      : (btc && sumMcap ? r1((btc.marketCap / sumMcap) * 100) : 0);
    const ups = coins.filter((c) => c.change24h > 0).length;
    const buys = coins.filter((c) => c.signal === "compra").length;
    const sells = coins.filter((c) => c.signal === "venta").length;

    return {
      fearGreed: f,
      totalMcap: gd ? gd.total_market_cap.usd : sumMcap,
      vol24h: gd ? gd.total_volume.usd : sumVol,
      btcDominance: dom,
      mcapChange: gd ? r2(gd.market_cap_change_percentage_24h_usd) : weightedChange(coins),
      activeCoins: coins.length,
      summary:
        `Seguimos ${coins.length} activos: ${ups} suben y ${coins.length - ups} bajan en las últimas 24 h. ` +
        `El índice de miedo y codicia marca ${f.value} (${f.label.toLowerCase()}) y la dominancia de Bitcoin es del ${dom}%. ` +
        `El motor detecta ${buys} señal(es) de compra y ${sells} de venta entre los activos analizados.`,
    };
  }

  function weightedChange(coins) {
    let w = 0, s = 0;
    coins.forEach((c) => { const m = c.marketCap || 0; w += m; s += (c.change24h || 0) * m; });
    return w ? r2(s / w) : 0;
  }

  function fallbackNews() {
    return (window.NEXUS_FALLBACK && window.NEXUS_FALLBACK.news) || [];
  }

  /* --- carga principal --- */
  async function load(force) {
    const C = window.NexusCache;
    if (!force) {
      const snap = C.get(SNAP, CONF.cache.snapshot);
      if (snap) {
        if (window.NexusHistory) { try { window.NexusHistory.record(snap.coins); } catch (e) {} }
        _status.source = "cache";
        _status.engineSignals = (snap.coins || []).filter((c) => c.signal != null).length;
        return { data: snap, source: "cache" };
      }
    }
    try {
      const markets = await window.CoinGecko.getMarkets(ids); // crítico
      const [global, fng, histories] = await Promise.all([
        window.CoinGecko.getGlobal().catch(() => null),
        window.FearGreed.get().catch(() => null),
        loadHistories(),
      ]);
      const prev = C.get(SNAP, Infinity); // snapshot anterior (para cambios de señal)
      const data = assemble(markets, global, fng, histories, prev);
      if (window.NexusHistory) {
        try {
          window.NexusHistory.record(data.coins);
          const seriesBySym = {};
          data.coins.forEach((c) => {
            const h = histories[c.id];
            if (h && h.ts && h.closes) seriesBySym[c.symbol] = h.ts.map((t, i) => [t, h.closes[i]]);
          });
          window.NexusHistory.evaluate(seriesBySym);
        } catch (e) { console.warn("[NEXUS] historial:", e.message); }
      }
      _status = { source: "live", coingecko: true, global: !!global, fng: !!fng, engineSignals: data.coins.filter((c) => c.signal != null).length, error: null };
      C.set(SNAP, data);
      return { data, source: "live" };
    } catch (e) {
      console.warn("[NEXUS] Falló la carga en vivo:", e.message);
      const stale = C.get(SNAP, Infinity); // último snapshot, aunque haya expirado
      if (stale) {
        _status = { source: "cache", coingecko: false, global: false, fng: false, engineSignals: (stale.coins || []).filter((c) => c.signal != null).length, error: e.message };
        return { data: stale, source: "cache" };
      }
      _status = { source: "fallback", coingecko: false, global: false, fng: false, engineSignals: 0, error: e.message };
      return { data: window.NEXUS_FALLBACK, source: "fallback" };
    }
  }

  return { load, status };
})();
