/* =====================================================================
   NEXUS AI — Historial de Convicciones (capa adicional, base para el futuro)
   Guarda en localStorage el Top 3 diario (fecha, activo, precio, conviccion,
   rating). UNA entrada por dia (se actualiza si ya existe la del dia).
   Es independiente del sistema de Rendimiento (NexusHistory): NO lo modifica
   ni lo lee. Solo prepara datos para comparaciones futuras.
   Clave: nexus.convictions.v1 — incluida en export/import de respaldo.
   ===================================================================== */
window.NexusConvictions = (function () {
  "use strict";
  const KEY = "convictions.v1";
  const MAX = 180; // ~6 meses de snapshots diarios

  function dayId(ts) {
    const d = new Date(ts || Date.now());
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function getAll() {
    const C = window.NexusCache;
    return (C && C.get(KEY, Infinity)) || [];
  }
  function save(list) {
    const C = window.NexusCache;
    if (C) C.set(KEY, list.slice(-MAX));
  }

  // top3: array de monedas (con symbol, name, price) + fn opcionales de conviccion/rating.
  function record(top3, meta) {
    if (!top3 || !top3.length) return;
    const list = getAll();
    const id = dayId();
    const entry = {
      date: id, ts: Date.now(),
      picks: top3.slice(0, 3).map((c, i) => ({
        pos: i + 1, symbol: c.symbol, name: c.name, price: c.price,
        conviction: (meta && meta.conviction && meta.conviction(c)) || null,
        rating: (meta && meta.rating && meta.rating(c)) || null,
        score: c.score != null ? c.score : null,
      })),
    };
    const idx = list.findIndex((e) => e.date === id);
    if (idx > -1) list[idx] = entry; else list.push(entry);
    save(list);
    return entry;
  }
  function last(n) { const a = getAll(); return a.slice(-(n || 7)).reverse(); }
  function clear() { const C = window.NexusCache; if (C) C.remove(KEY); }

  return { record, getAll, last, clear, KEY };
})();
