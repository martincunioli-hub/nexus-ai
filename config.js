/* =====================================================================
   NEXUS AI — Configuración global
   Fuentes, monedas seguidas, caché y (opcional) clave Demo de CoinGecko.
   ===================================================================== */
window.NEXUS_CONFIG = {
  // --- APIs ---
  api: "https://api.coingecko.com/api/v3",
  fngUrl: "https://api.alternative.me/fng/?limit=1",

  // Clave Demo gratuita de CoinGecko (opcional, sube el límite a ~30 req/min).
  // Crear en https://www.coingecko.com/en/developers/dashboard y pegar aquí.
  // Si queda vacía, se usa el endpoint público sin clave (límite más estricto).
  demoKey: "",

  // --- Caché (ms) ---
  cache: {
    snapshot: 120000,     // datos de mercado: 2 min
    history: 21600000,    // históricos para el Paso 2: 6 h
  },

  // --- Parámetros para el Paso 2 (motor de análisis) ---
  historyDays: 365,
  thresholds: { rsiLow: 30, rsiHigh: 70, volMult: 1.8 },

  // --- Monedas seguidas: ticker → id de CoinGecko (+ color del logo) ---
  // Los ids NO son el ticker (p. ej. AVAX = avalanche-2, TON = the-open-network).
  coins: [
    { id: "bitcoin",          symbol: "BTC",  name: "Bitcoin",   color: "#f7931a" },
    { id: "ethereum",         symbol: "ETH",  name: "Ethereum",  color: "#627eea" },
    { id: "solana",           symbol: "SOL",  name: "Solana",    color: "#9945ff" },
    { id: "binancecoin",      symbol: "BNB",  name: "BNB",       color: "#f0b90b", fg: "#1a1a1a" },
    { id: "ripple",           symbol: "XRP",  name: "XRP",       color: "#23292f" },
    { id: "cardano",          symbol: "ADA",  name: "Cardano",   color: "#0033ad" },
    { id: "avalanche-2",      symbol: "AVAX", name: "Avalanche", color: "#e84142" },
    { id: "dogecoin",         symbol: "DOGE", name: "Dogecoin",  color: "#c2a633", fg: "#1a1a1a" },
    { id: "chainlink",        symbol: "LINK", name: "Chainlink", color: "#2a5ada" },
    { id: "polkadot",         symbol: "DOT",  name: "Polkadot",  color: "#e6007a" },
    { id: "the-open-network", symbol: "TON",  name: "Toncoin",   color: "#0098ea" },
    { id: "cosmos",           symbol: "ATOM", name: "Cosmos",    color: "#2e3148" },
  ],
};
