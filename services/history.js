/* =====================================================================
   NEXUS AI — Historial de señales y rendimiento del motor
   Registro persistente (localStorage, clave dedicada y versionada) de cada
   "episodio" de señal, y evaluación objetiva a 1/7/30 días con cierres reales.
   No modifica el motor ni los pesos: solo mide.

   Se registra un episodio cuando, respecto al último registro de ese activo:
     - es la primera vez que se ve el activo            (trigger: "inicial")
     - cambia la señal (Compra/Neutral/Venta)           (trigger: "señal")
     - el score salta ≥ SCORE_DELTA aunque la señal      (trigger: "convicción")
       no cambie (p. ej. Neutral 35 → Neutral 75)
   ===================================================================== */
window.NexusHistory = (function () {
  "use strict";
  const KEY = "history.v1";        // → localStorage "nexus.history.v1"
  const DAY = 86400000;
  const SCORE_DELTA = 20;          // salto de convicción que amerita un registro
  const C = window.NexusCache;

  function getAll() { return C.get(KEY, Infinity) || []; }
  function saveAll(arr) { C.set(KEY, arr); }

  // Registrar episodios nuevos a partir de los activos actuales.
  function record(coins) {
    if (!coins || !coins.length) return false;
    const arr = getAll();
    const lastBySym = {};
    arr.forEach((r) => { lastBySym[r.symbol] = r; }); // arr cronológico → el último gana
    let changed = false;

    coins.forEach((c) => {
      if (c.signal == null || c.score == null) return; // sin info suficiente
      const last = lastBySym[c.symbol];
      let trigger = null;
      if (!last) trigger = "inicial";
      else if (last.signal !== c.signal) trigger = "señal";
      else if (Math.abs(c.score - last.score) >= SCORE_DELTA) trigger = "convicción";
      if (!trigger) return; // mismo episodio, sin cambio relevante

      arr.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        ts: Date.now(),
        symbol: c.symbol, name: c.name,
        price: c.price, score: c.score, signal: c.signal, risk: c.risk, confidence: c.confidence,
        trigger,
        // --- snapshot técnico para trazabilidad (igual que el análisis actual) ---
        rsi: c.rsi, macd: c.macd, ema20: c.ema20, ema50: c.ema50, ema200: c.ema200,
        trend: c.trend, volRatio: c._volRatio,
        reasons: c.reasons || [],
        factors: c.factors || null,
        evals: { d1: null, d7: null, d30: null },
      });
      changed = true;
    });

    if (changed) saveAll(arr);
    return changed;
  }

  // Evaluar pendientes a 1/7/30 días usando cierres diarios reales.
  // seriesBySym: { SYM: [[ts, close], ...] } ordenado ascendente por ts.
  function evaluate(seriesBySym) {
    const arr = getAll();
    if (!arr.length) return false;
    const horizons = { d1: 1, d7: 7, d30: 30 };
    let changed = false;

    arr.forEach((r) => {
      const series = seriesBySym && seriesBySym[r.symbol];
      if (!series || !series.length) return;
      Object.keys(horizons).forEach((k) => {
        if (r.evals[k]) return;                       // ya evaluado
        const target = r.ts + horizons[k] * DAY;
        if (Date.now() < target) return;              // horizonte aún no cumplido
        const px = closeAtOrAfter(series, target);
        if (px == null) return;                       // todavía sin cierre en esa fecha
        const ret = (px - r.price) / r.price * 100;
        const ok = r.signal === "compra" ? ret > 0 : r.signal === "venta" ? ret < 0 : null;
        r.evals[k] = { price: px, ret: Math.round(ret * 100) / 100, ok };
        changed = true;
      });
    });

    if (changed) saveAll(arr);
    return changed;
  }
  function closeAtOrAfter(series, ts) {
    for (let i = 0; i < series.length; i++) if (series[i][0] >= ts) return series[i][1];
    return null; // objetivo posterior al último cierre disponible
  }

  // Métricas para un horizonte ("d1" | "d7" | "d30").
  function stats(h) {
    const arr = getAll();
    const evald = arr.filter((r) => r.evals[h]);
    const directional = evald.filter((r) => r.evals[h].ok != null);
    const hits = directional.filter((r) => r.evals[h].ok).length;
    const avgRet = evald.length ? evald.reduce((s, r) => s + r.evals[h].ret, 0) / evald.length : 0;

    const group = (keyFn) => {
      const g = {};
      evald.forEach((r) => {
        const key = keyFn(r);
        const o = g[key] || (g[key] = { n: 0, hit: 0, dir: 0, ret: 0 });
        o.n++; o.ret += r.evals[h].ret;
        if (r.evals[h].ok != null) { o.dir++; if (r.evals[h].ok) o.hit++; }
      });
      return g;
    };

    return {
      total: arr.length,
      evaluated: evald.length,
      directional: directional.length,
      hitRate: directional.length ? (hits / directional.length) * 100 : null,
      avgRet,
      byAsset: group((r) => r.symbol),
      bySignal: group((r) => r.signal),
    };
  }

  // Resumen general para el Centro de Estadísticas.
  function summary() {
    const arr = getAll();
    const counts = { compra: 0, neutral: 0, venta: 0 };
    arr.forEach((r) => { if (counts[r.signal] != null) counts[r.signal]++; });
    const hr = (h) => stats(h).hitRate;
    const ev7 = arr.filter((r) => r.evals.d7);
    const avgRet = ev7.length ? ev7.reduce((s, r) => s + r.evals.d7.ret, 0) / ev7.length : null;
    const ba = stats("d7").byAsset;
    const assets = Object.keys(ba).map((k) => ({ symbol: k, ret: ba[k].ret / ba[k].n, n: ba[k].n }));
    assets.sort((a, b) => b.ret - a.ret);
    return {
      total: arr.length,
      compras: counts.compra, ventas: counts.venta, neutrales: counts.neutral,
      hit1: hr("d1"), hit7: hr("d7"), hit30: hr("d30"),
      avgRet,
      bestAsset: assets.length ? assets[0] : null,
      worstAsset: assets.length ? assets[assets.length - 1] : null,
    };
  }

  // Series para los gráficos de evolución.
  function evolution() {
    const arr = [...getAll()].sort((a, b) => a.ts - b.ts);
    const cum = []; let hit = 0, n = 0;
    arr.forEach((r) => {
      const e = r.evals.d7;
      if (e && e.ok != null) { n++; if (e.ok) hit++; cum.push({ ts: r.ts, acc: (hit / n) * 100 }); }
    });
    const weeks = {};
    arr.forEach((r) => { const wk = Math.floor(r.ts / (7 * 86400000)); weeks[wk] = (weeks[wk] || 0) + 1; });
    const perWeek = Object.keys(weeks).sort().map((k) => weeks[k]);
    const dist = { compra: 0, neutral: 0, venta: 0 };
    arr.forEach((r) => { if (dist[r.signal] != null) dist[r.signal]++; });
    return { cumAccuracy: cum, perWeek, distribution: dist };
  }

  // Observaciones automáticas (estadística descriptiva sobre el historial; sin ML).
  function insights() {
    const arr = getAll().filter((r) => r.evals.d7 && r.evals.d7.ok != null);
    const MIN = 3;
    const rate = (recs) => (recs.length ? Math.round((recs.filter((r) => r.evals.d7.ok).length / recs.length) * 100) : null);
    if (arr.length < MIN) {
      return { ready: false, lines: ["Aún hay pocas señales evaluadas a 7 días. Las observaciones aparecerán a medida que se acumule historial real."] };
    }
    const overall = rate(arr);
    const out = [];
    const rsiBand = arr.filter((r) => r.signal === "compra" && r.rsi != null && r.rsi >= 40 && r.rsi <= 55);
    if (rsiBand.length >= MIN) out.push(`Las señales Compra con RSI 40–55 tuvieron ${rate(rsiBand)}% de acierto (n=${rsiBand.length}).`);
    const emaUp = arr.filter((r) => r.factors && r.factors.some((f) => f.key === "ema" && f.sub > 0));
    if (emaUp.length >= MIN) out.push(`Con EMA alineadas al alza, el acierto fue ${rate(emaUp)}% vs ${overall}% general (n=${emaUp.length}).`);
    const buys = arr.filter((r) => r.signal === "compra"), sells = arr.filter((r) => r.signal === "venta");
    if (buys.length >= MIN && sells.length >= MIN) out.push(`Acierto de Compra ${rate(buys)}% (n=${buys.length}) vs Venta ${rate(sells)}% (n=${sells.length}).`);
    const sellBtc = sells.filter((r) => r.symbol === "BTC"), sellAlt = sells.filter((r) => r.symbol !== "BTC");
    if (sellBtc.length >= MIN && sellAlt.length >= MIN) out.push(`Señales Venta: BTC ${rate(sellBtc)}% vs altcoins ${rate(sellAlt)}% (n=${sellBtc.length}/${sellAlt.length}).`);
    const macdUp = arr.filter((r) => r.signal === "compra" && r.macd && r.macd.hist > 0);
    if (macdUp.length >= MIN) out.push(`Compras con MACD al alza: ${rate(macdUp)}% de acierto (n=${macdUp.length}).`);
    if (!out.length) out.push(`Acierto general a 7 días: ${overall}% (n=${arr.length}). Falta más historial para desglosar por factor.`);
    return { ready: true, lines: out };
  }

  // Respaldo manual (red de seguridad ante borrado de datos / cambio de equipo).
  function exportJSON() {
    return JSON.stringify({ v: 1, exportedAt: Date.now(), records: getAll() }, null, 2);
  }
  function importJSON(text) {
    try {
      const obj = JSON.parse(text);
      const recs = Array.isArray(obj) ? obj : (obj && obj.records) || [];
      if (!Array.isArray(recs)) return false;
      const byId = {};
      getAll().forEach((r) => { byId[r.id] = r; });
      recs.forEach((r) => { if (r && r.id) byId[r.id] = r; }); // merge sin duplicar
      saveAll(Object.keys(byId).map((k) => byId[k]).sort((a, b) => a.ts - b.ts));
      return true;
    } catch (e) { return false; }
  }
  function clear() { C.remove(KEY); }

  function getById(id) { return getAll().filter((r) => r.id === id)[0] || null; }

  return { record, evaluate, stats, summary, evolution, insights, getAll, getById, exportJSON, importJSON, clear, available: C.available };
})();
