/* =====================================================================
   NEXUS AI — Datos de ejemplo (demo)
   Hechos cualitativos escritos a mano (precio, señal, RSI, motivos…) y
   series de precio generadas con un PRNG sembrado → estables y creíbles.
   Reemplazables por la API real sin tocar el frontend (ver ARQUITECTURA.md).
   ===================================================================== */
(function () {
  "use strict";

  // --- PRNG determinista (mulberry32) sembrado por símbolo ---
  function hash(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619);} return h>>>0; }
  function rng(seed){ return function(){ seed|=0; seed=(seed+0x6D2B79F5)|0; let t=Math.imul(seed^seed>>>15,1|seed); t=(t+Math.imul(t^t>>>7,61|t))^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  function prec(p){ return p>=1000?1:p>=1?2:p>=0.01?4:6; }

  // Camino aleatorio con deriva, reescalado para terminar exactamente en `end`.
  function series(seed, len, end, driftTotal, vol){
    const r = rng(seed); const out=[1]; let p=1;
    for(let i=1;i<len;i++){ const shock=(r()-0.5)*2*vol; p=p*(1+driftTotal/len+shock); out.push(p); }
    const k = end / out[out.length-1];
    return out.map(x => +(x*k).toFixed(prec(end)));
  }

  const VOL = { bajo:0.010, medio:0.020, alto:0.034 };

  // --- Hechos base por activo (coherentes entre sí) ---
  const base = [
    { id:"bitcoin", symbol:"BTC", name:"Bitcoin", color:"#f7931a", rank:1,
      price:71240, change24h:2.4, change7d:6.1, volume:38.6e9, marketCap:1.41e12,
      rsi:58, macd:{value:420,signal:360,hist:60}, ema20:69800, ema50:66200, ema200:61200,
      trend:"alcista", support:68400, resistance:73600,
      signal:"compra", score:64, confidence:78, risk:"medio",
      reasons:[
        {t:"RSI saludable en 58, con recorrido al alza antes de sobrecompra.",p:"pos"},
        {t:"Precio sobre EMA20 > EMA50 > EMA200: alineación alcista confirmada.",p:"pos"},
        {t:"Volumen creciente acompaña el movimiento (confirmación).",p:"pos"},
        {t:"Cerca de resistencia en 73.6k; vigilar reacción.",p:"neu"} ] },

    { id:"ethereum", symbol:"ETH", name:"Ethereum", color:"#627eea", rank:2,
      price:3820, change24h:1.8, change7d:4.2, volume:17.2e9, marketCap:459e9,
      rsi:61, macd:{value:24,signal:19,hist:5}, ema20:3710, ema50:3540, ema200:3280,
      trend:"alcista", support:3640, resistance:4020,
      signal:"compra", score:52, confidence:71, risk:"medio",
      reasons:[
        {t:"Tendencia alcista en diario con mínimos crecientes.",p:"pos"},
        {t:"MACD positivo y por encima de su señal.",p:"pos"},
        {t:"RSI en 61, aún sin sobrecompra.",p:"pos"},
        {t:"Volumen estable, sin gran impulso adicional.",p:"neu"} ] },

    { id:"solana", symbol:"SOL", name:"Solana", color:"#9945ff", rank:5,
      price:172.4, change24h:5.6, change7d:13.8, volume:6.1e9, marketCap:79e9,
      rsi:64, macd:{value:3.1,signal:2.1,hist:1.0}, ema20:158, ema50:142, ema200:121,
      trend:"alcista", support:160, resistance:188,
      signal:"compra", score:71, confidence:82, risk:"alto",
      reasons:[
        {t:"Momentum fuerte: +13.8% en 7 días con volumen creciente.",p:"pos"},
        {t:"Cruce alcista EMA50/200 (golden cross) reciente.",p:"pos"},
        {t:"RSI 64: impulso sano, todavía sin agotamiento.",p:"pos"},
        {t:"Alta volatilidad: gestionar tamaño de posición.",p:"neg"} ] },

    { id:"binancecoin", symbol:"BNB", name:"BNB", color:"#f0b90b", fg:"#1a1a1a", rank:4,
      price:642, change24h:0.4, change7d:-0.8, volume:1.9e9, marketCap:94e9,
      rsi:52, macd:{value:1.2,signal:1.4,hist:-0.2}, ema20:640, ema50:636, ema200:602,
      trend:"lateral", support:618, resistance:668,
      signal:"neutral", score:8, confidence:55, risk:"bajo",
      reasons:[
        {t:"Rango lateral entre 618 y 668 sin dirección clara.",p:"neu"},
        {t:"RSI neutro en 52.",p:"neu"},
        {t:"MACD plano, sin convicción.",p:"neu"},
        {t:"Baja volatilidad relativa: riesgo contenido.",p:"pos"} ] },

    { id:"ripple", symbol:"XRP", name:"XRP", color:"#23292f", rank:6,
      price:0.582, change24h:-2.9, change7d:-7.4, volume:2.3e9, marketCap:32e9,
      rsi:41, macd:{value:-0.004,signal:-0.001,hist:-0.003}, ema20:0.605, ema50:0.631, ema200:0.612,
      trend:"bajista", support:0.55, resistance:0.63,
      signal:"venta", score:-46, confidence:64, risk:"alto",
      reasons:[
        {t:"Rechazo en resistencia 0.63 y giro a la baja.",p:"neg"},
        {t:"Precio bajo EMA20 y EMA50: estructura bajista.",p:"neg"},
        {t:"Cruce bajista EMA50/200 (death cross) en formación.",p:"neg"},
        {t:"RSI 41 acercándose a sobreventa: posible rebote técnico.",p:"neu"} ] },

    { id:"cardano", symbol:"ADA", name:"Cardano", color:"#0033ad", rank:9,
      price:0.462, change24h:-1.6, change7d:-5.1, volume:0.6e9, marketCap:16e9,
      rsi:38, macd:{value:-0.003,signal:-0.001,hist:-0.002}, ema20:0.481, ema50:0.498, ema200:0.51,
      trend:"bajista", support:0.44, resistance:0.50,
      signal:"venta", score:-38, confidence:58, risk:"alto",
      reasons:[
        {t:"Tendencia bajista con máximos decrecientes.",p:"neg"},
        {t:"Precio por debajo de todas las EMAs.",p:"neg"},
        {t:"Volumen débil, sin interés comprador.",p:"neg"},
        {t:"RSI 38: cerca de sobreventa, vigilar soporte 0.44.",p:"neu"} ] },

    { id:"avalanche", symbol:"AVAX", name:"Avalanche", color:"#e84142", rank:12,
      price:38.4, change24h:0.9, change7d:2.1, volume:0.5e9, marketCap:15e9,
      rsi:48, macd:{value:0.12,signal:0.10,hist:0.02}, ema20:38.0, ema50:37.4, ema200:36.1,
      trend:"lateral", support:36.5, resistance:41.2,
      signal:"neutral", score:12, confidence:49, risk:"alto",
      reasons:[
        {t:"Consolidación sobre soporte 36.5.",p:"neu"},
        {t:"MACD ligeramente positivo, señal débil.",p:"neu"},
        {t:"RSI 48 sin sesgo claro.",p:"neu"},
        {t:"Volatilidad elevada típica del activo.",p:"neg"} ] },

    { id:"dogecoin", symbol:"DOGE", name:"Dogecoin", color:"#c2a633", fg:"#1a1a1a", rank:8,
      price:0.1432, change24h:7.8, change7d:21.3, volume:3.4e9, marketCap:21e9,
      rsi:73, macd:{value:0.004,signal:0.003,hist:0.001}, ema20:0.131, ema50:0.118, ema200:0.108,
      trend:"alcista", support:0.128, resistance:0.152,
      signal:"venta", score:-28, confidence:57, risk:"alto",
      reasons:[
        {t:"RSI 73 en zona de sobrecompra: riesgo de corrección.",p:"neg"},
        {t:"Subida parabólica (+21% en 7 días) difícil de sostener.",p:"neg"},
        {t:"Volumen 2.4× la media: posible clímax especulativo.",p:"neg"},
        {t:"Tendencia aún alcista, pero recomendable tomar ganancias.",p:"neu"} ] },

    { id:"chainlink", symbol:"LINK", name:"Chainlink", color:"#2a5ada", rank:14,
      price:17.82, change24h:3.1, change7d:8.4, volume:0.7e9, marketCap:11e9,
      rsi:56, macd:{value:0.21,signal:0.15,hist:0.06}, ema20:17.0, ema50:16.1, ema200:14.8,
      trend:"alcista", support:16.4, resistance:19.0,
      signal:"compra", score:48, confidence:68, risk:"medio",
      reasons:[
        {t:"Ruptura de consolidación con volumen.",p:"pos"},
        {t:"EMAs alineadas al alza.",p:"pos"},
        {t:"Catalizador fundamental (integración bancaria).",p:"pos"},
        {t:"RSI 56: margen antes de sobrecompra.",p:"pos"} ] },

    { id:"polkadot", symbol:"DOT", name:"Polkadot", color:"#e6007a", rank:16,
      price:7.24, change24h:-0.3, change7d:1.2, volume:0.3e9, marketCap:10e9,
      rsi:47, macd:{value:0.02,signal:0.02,hist:0.0}, ema20:7.2, ema50:7.1, ema200:7.0,
      trend:"lateral", support:6.9, resistance:7.7,
      signal:"neutral", score:4, confidence:51, risk:"medio",
      reasons:[
        {t:"Movimiento lateral estrecho.",p:"neu"},
        {t:"Indicadores sin convicción direccional.",p:"neu"},
        {t:"RSI neutro en 47.",p:"neu"},
        {t:"A la espera de catalizador.",p:"neu"} ] },

    { id:"toncoin", symbol:"TON", name:"Toncoin", color:"#0098ea", rank:11,
      price:7.08, change24h:4.2, change7d:9.7, volume:0.4e9, marketCap:18e9,
      rsi:60, macd:{value:0.09,signal:0.06,hist:0.03}, ema20:6.7, ema50:6.3, ema200:5.8,
      trend:"alcista", support:6.5, resistance:7.6,
      signal:"compra", score:55, confidence:65, risk:"alto",
      reasons:[
        {t:"Tendencia alcista sostenida con adopción creciente.",p:"pos"},
        {t:"MACD positivo y ascendente.",p:"pos"},
        {t:"RSI 60 con impulso saludable.",p:"pos"},
        {t:"Liquidez menor: mayor riesgo de slippage.",p:"neg"} ] },

    { id:"cosmos", symbol:"ATOM", name:"Cosmos", color:"#2e3148", rank:24,
      price:6.18, change24h:-3.4, change7d:-9.8, volume:0.2e9, marketCap:2.4e9,
      rsi:28, macd:{value:-0.05,signal:-0.02,hist:-0.03}, ema20:6.6, ema50:7.0, ema200:7.6,
      trend:"bajista", support:5.9, resistance:6.8,
      signal:"venta", score:-52, confidence:60, risk:"alto",
      reasons:[
        {t:"RSI 28 en sobreventa extrema: tendencia muy débil.",p:"neg"},
        {t:"Precio muy por debajo de EMA200.",p:"neg"},
        {t:"Volumen de venta dominante.",p:"neg"},
        {t:"Posible rebote técnico, pero estructura sigue bajista.",p:"neu"} ] },
  ];

  // --- Augmentar con series de precio y sparkline ---
  base.forEach(c => {
    const s = hash(c.symbol);
    const v = VOL[c.risk];
    c.spark = series(s ^ 0x9e37, 24, c.price, c.change24h/100, v*0.6);
    c.series = {
      "1D": series(s ^ 0x1111, 24,  c.price, c.change24h/100,      v*0.7),
      "1S": series(s ^ 0x2222, 40,  c.price, c.change7d/100,       v),
      "1M": series(s ^ 0x3333, 30,  c.price, (c.change7d/100)*3.2, v*1.15),
      "1A": series(s ^ 0x4444, 52,  c.price, (c.change7d/100)*11,  v*1.4),
    };
  });

  const news = [
    { id:1, source:"CoinDesk",    time:"hace 35 min", title:"La SEC aprueba nuevas reglas de custodia para ETF de Ethereum", sentiment:"positivo", impact:"alto",  sym:"ETH" },
    { id:2, source:"The Block",   time:"hace 1 h",    title:"Bitcoin supera resistencia clave; analistas ven continuación alcista", sentiment:"positivo", impact:"alto",  sym:"BTC" },
    { id:3, source:"Decrypt",     time:"hace 2 h",    title:"Solana registra un récord de transacciones diarias", sentiment:"positivo", impact:"medio", sym:"SOL" },
    { id:4, source:"Reuters",     time:"hace 3 h",    title:"Regulador europeo advierte sobre la volatilidad en memecoins", sentiment:"negativo", impact:"medio", sym:"DOGE" },
    { id:5, source:"CoinTelegraph",time:"hace 4 h",   title:"XRP cae tras ser rechazado en una zona de resistencia clave", sentiment:"negativo", impact:"medio", sym:"XRP" },
    { id:6, source:"Bloomberg",   time:"hace 5 h",    title:"El mercado cripto se mantiene lateral a la espera de datos de inflación", sentiment:"neutral", impact:"bajo", sym:null },
    { id:7, source:"CoinDesk",    time:"hace 7 h",    title:"Chainlink anuncia una integración con la banca tradicional", sentiment:"positivo", impact:"alto",  sym:"LINK" },
    { id:8, source:"The Block",   time:"hace 9 h",    title:"Grandes carteras acumulan BTC, según datos on-chain", sentiment:"positivo", impact:"medio", sym:"BTC" },
  ];

  const alerts = [
    { id:1, type:"signal_change", severity:"info",     sym:"BTC",  message:"Cambio de señal: Neutral → Compra", time:"hace 12 min" },
    { id:2, type:"rsi_high",      severity:"warning",  sym:"DOGE", message:"RSI en sobrecompra (73). Riesgo de corrección.", time:"hace 28 min" },
    { id:3, type:"vol_spike",     severity:"warning",  sym:"DOGE", message:"Volumen anormal: 2.4× la media de 20 períodos.", time:"hace 31 min" },
    { id:4, type:"ema_cross",     severity:"info",     sym:"SOL",  message:"Cruce alcista EMA50/200 (golden cross).", time:"hace 1 h" },
    { id:5, type:"rsi_low",       severity:"critical", sym:"ATOM", message:"RSI en sobreventa extrema (28).", time:"hace 2 h" },
    { id:6, type:"ema_cross",     severity:"critical", sym:"XRP",  message:"Cruce bajista EMA50/200 (death cross) en formación.", time:"hace 3 h" },
    { id:7, type:"signal_change", severity:"warning",  sym:"XRP",  message:"Cambio de señal: Neutral → Venta", time:"hace 3 h" },
    { id:8, type:"vol_spike",     severity:"info",     sym:"SOL",  message:"Volumen 1.8× sobre la media: interés creciente.", time:"hace 4 h" },
  ];

  const market = {
    fearGreed: { value:64, label:"Codicia" },
    totalMcap: 2.58e12,
    mcapChange: 1.8,
    vol24h: 98.4e9,
    btcDominance: 53.2,
    activeCoins: 12,
    summary: "El mercado opera con sesgo alcista moderado. Bitcoin lidera con una dominancia estable y el apetito de riesgo se mantiene en zona de codicia. Las altcoins de gran capitalización muestran fortaleza selectiva; conviene precaución en activos de baja capitalización por su volatilidad elevada.",
  };

  // Datos de RESPALDO (offline / si falla CoinGecko o se agota el límite).
  // En producción el live lo arma services/dataService.js → window.NEXUS_DATA.
  window.NEXUS_FALLBACK = { coins: base, news, alerts, market };
})();
