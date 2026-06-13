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

  return { record, evaluate, stats, getAll, exportJSON, importJSON, clear, available: C.available };
})();
