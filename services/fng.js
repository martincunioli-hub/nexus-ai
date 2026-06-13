/* =====================================================================
   NEXUS AI — Fear & Greed Index (Alternative.me)
   CoinGecko no ofrece este índice; se obtiene de Alternative.me (gratis,
   sin clave) y se traduce la clasificación al español.
   ===================================================================== */
window.FearGreed = (function () {
  "use strict";
  const CONF = window.NEXUS_CONFIG;
  const LABELS = {
    "Extreme Fear": "Miedo extremo",
    "Fear": "Miedo",
    "Neutral": "Neutral",
    "Greed": "Codicia",
    "Extreme Greed": "Codicia extrema",
  };

  async function get() {
    const res = await fetch(CONF.fngUrl, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error("Fear & Greed " + res.status);
    const j = await res.json();
    const d = j && j.data && j.data[0];
    if (!d) throw new Error("Fear & Greed: respuesta vacía");
    return { value: parseInt(d.value, 10), label: LABELS[d.value_classification] || d.value_classification };
  }

  return { get };
})();
