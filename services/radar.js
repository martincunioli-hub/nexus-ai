/* =====================================================================
   NEXUS AI — Radar Global (capa adicional, no toca el sistema actual)
   Escanea el Top 100 por market cap (1 llamada a CoinGecko, cacheada),
   excluye stablecoins / wrapped / baja liquidez, y aplica un ANÁLISIS LIGERO
   reutilizando el MISMO motor (Analysis.analyze) sobre el sparkline de 7 días
   (sin descargar históricos completos). No modifica scoring/pesos/señales.
   ===================================================================== */
window.NexusRadar = (function () {
  "use strict";
  const CONF = window.NEXUS_CONFIG;
  const KEY = "radar.markets";
  const TTL = 10 * 60 * 1000; // 10 min de caché para no abusar de la API
  const monitored = new Set(CONF.coins.map((c) => c.symbol));
  const colorOf = (sym) => { const cc = CONF.coins.find((c) => c.symbol === sym); return cc ? cc.color : "#586072"; };

  const STABLE = ["USDT", "USDC", "DAI", "USDE", "FDUSD", "TUSD", "USDD", "PYUSD", "USDP", "GUSD", "USDS", "BUSD", "FRAX", "LUSD", "USD0", "USDB"];
  const WRAPPED = /^(WBTC|WETH|WBNB|WEETH|WSTETH|WMATIC|WAVAX|WHBAR|CBETH|RETH|STETH|METH|EZETH|RSETH|SOLVBTC|LBTC|CBBTC)$/;
  const num = (...xs) => { for (const x of xs) { if (typeof x === "number" && isFinite(x)) return x; } return 0; };
  function downsample(arr, n) { if (!arr || arr.length <= n) return (arr || []).slice(); const o = [], s = (arr.length - 1) / (n - 1); for (let i = 0; i < n; i++) o.push(arr[Math.round(i * s)]); return o; }

  function excluded(m) {
    const sym = (m.symbol || "").toUpperCase(), name = (m.name || "").toLowerCase();
    if (STABLE.indexOf(sym) > -1) return true;
    if (/stable|usd|dai/.test(name) && Math.abs((m.current_price || 1) - 1) < 0.06) return true; // stable-ish por precio≈1
    if (/wrapped|staked|liquid staked|restak/.test(name)) return true;
    if (WRAPPED.test(sym)) return true;
    if ((m.total_volume || 0) < 5e6) return true;       // liquidez/volumen muy bajos
    if (!(m.sparkline_in_7d && m.sparkline_in_7d.price && m.sparkline_in_7d.price.length > 30)) return true; // sin datos suficientes
    return false;
  }

  function analyzeLight(m) {
    const sym = (m.symbol || "").toUpperCase();
    const spark = (m.sparkline_in_7d && m.sparkline_in_7d.price) || [];
    const change24h = num(m.price_change_percentage_24h_in_currency, m.price_change_percentage_24h);
    const change7d = num(m.price_change_percentage_7d_in_currency);
    const a = window.Analysis.analyze({ price: m.current_price, marketCap: m.market_cap, volume: m.total_volume, change24h, change7d }, spark, []);
    const daily = downsample(spark, 8); // ≈ cierres diarios sobre 7 d → volatilidad de escala diaria
    let dv = (window.Indicators && window.Indicators.volatility(daily)) || 0;
    let risk = dv > 0.05 ? "alto" : dv > 0.025 ? "medio" : "bajo";
    if (m.market_cap > 2e11 && risk === "alto") risk = "medio";
    if (m.market_cap < 5e9) risk = risk === "bajo" ? "medio" : "alto";
    return {
      id: m.id, symbol: sym, name: m.name, color: colorOf(sym), fg: undefined,
      rank: m.market_cap_rank, price: m.current_price, change24h, change7d,
      volume: m.total_volume, marketCap: m.market_cap,
      rsi: a.rsi, macd: a.macd, ema20: a.ema20, ema50: a.ema50, ema200: a.ema200, trend: a.trend,
      signal: a.signal, score: a.score, confidence: a.confidence, risk, reasons: a.reasons, factors: a.factors,
      series: { "1D": spark.slice(-24), "1S": spark, "1M": daily, "1A": daily },
      monitored: monitored.has(sym),
      light: true,
    };
  }

  async function fetchTop() {
    const C = window.NexusCache;
    const cached = C.get(KEY, TTL);
    if (cached) return cached;
    const data = await window.CoinGecko.getMarketsTop(100, 1);
    C.set(KEY, data);
    return data;
  }

  let _stats = { downloaded: 0, excluded: 0, analyzed: 0, ts: 0 };

  async function scan() {
    const top = await fetchTop();
    const list = top || [];
    const kept = list.filter((m) => !excluded(m));
    const coins = kept.map(analyzeLight);
    _stats = { downloaded: list.length, excluded: list.length - kept.length, analyzed: coins.length, ts: Date.now() };
    return coins;
  }

  return { scan, stats: () => _stats, isMonitored: (s) => monitored.has(s) };
})();
