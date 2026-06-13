/* =====================================================================
   NEXUS AI — Cliente de CoinGecko (bajo nivel)
   Solo construye URLs, hace fetch y devuelve JSON. Sin lógica de negocio.
   ===================================================================== */
window.CoinGecko = (function () {
  "use strict";
  const CONF = window.NEXUS_CONFIG;

  async function _get(path, params) {
    const url = new URL(CONF.api + path);
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });
    const headers = { accept: "application/json" };
    if (CONF.demoKey) headers["x-cg-demo-api-key"] = CONF.demoKey;

    const res = await fetch(url.toString(), { headers });
    if (!res.ok) {
      const msg = res.status === 429
        ? "Límite de CoinGecko alcanzado (429). Esperá un momento o agregá una clave Demo."
        : "CoinGecko " + res.status + " en " + path;
      throw new Error(msg);
    }
    return res.json();
  }

  return {
    // Precio, 24h, 7d, volumen, market cap, rank, logo y sparkline de 7d — todo de una.
    getMarkets(ids) {
      return _get("/coins/markets", {
        vs_currency: "usd",
        ids: ids.join(","),
        order: "market_cap_desc",
        per_page: ids.length,
        page: 1,
        sparkline: true,
        price_change_percentage: "24h,7d",
      });
    },

    // Market cap total, volumen global, dominancia BTC y cambio % 24h.
    getGlobal() {
      return _get("/global");
    },

    // Top N por market cap (Radar Global). Misma API, sin ids fijos.
    getMarketsTop(perPage, page) {
      return _get("/coins/markets", {
        vs_currency: "usd",
        order: "market_cap_desc",
        per_page: perPage || 100,
        page: page || 1,
        sparkline: true,
        price_change_percentage: "24h,7d",
      });
    },

    // Histórico de precios (para el Paso 2 / gráficos de perfil). Granularidad
    // automática: días > 90 → diaria (suficiente para EMA200).
    getMarketChart(id, days) {
      return _get("/coins/" + id + "/market_chart", { vs_currency: "usd", days: days });
    },
  };
})();
