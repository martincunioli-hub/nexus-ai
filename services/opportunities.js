/* =====================================================================
   NEXUS AI — Asistente de Oportunidades (capa de derivación, sin motor nuevo)
   Reutiliza EXCLUSIVAMENTE lo que el motor ya calculó por activo
   (score, confianza, riesgo, RSI, MACD, EMA20/50/200, momentum 7d, factores)
   más la volatilidad histórica de la serie diaria real.
   NO modifica scoring, pesos ni señales. Reglas explícitas y documentadas.

   CLASIFICACIÓN (transparente, derivada de campos existentes):
     confirmaciones = nº de {RSI 45–70, momentum 7d>0, tendencia alcista, MACD hist>0}
     🟢 Segura   : score>30 (Compra) Y confianza≥60 Y riesgo≠alto Y confirmaciones≥3
     🟡 Moderada : score≥0 Y confianza≥45 Y confirmaciones≥2 (y no Segura)
     🔴 Riesgosa : el resto (score<0, riesgo alto, baja confianza o poca confirmación)

   PROBABILIDAD ALCISTA (estimación, NO probabilidad real / sin ML):
     prob = clamp(50 + 0.30·score + 0.15·(confianza−50), 5, 95)

   OBJETIVOS DE PRECIO (no inventados): a partir de la volatilidad histórica
     σ_h = σ_diario · √(días);  deriva = clamp(score/100, ±0.6)·σ_h
     conservador = precio·(1+deriva−σ_h) · base = precio·(1+deriva) · optimista = precio·(1+deriva+σ_h)
   ===================================================================== */
window.NexusOpportunities = (function () {
  "use strict";
  const RISK_RANK = { bajo: 0, medio: 1, alto: 2 };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const full = (c) => c && c.signal != null && c.score != null && c.rsi != null;

  function confirmations(c) {
    let n = 0;
    if (c.rsi != null && c.rsi >= 45 && c.rsi <= 70) n++;
    if ((c.change7d || 0) > 0) n++;
    if (c.trend === "alcista") n++;
    if (c.macd && c.macd.hist > 0) n++;
    return n;
  }
  function level(c) {
    const conf = c.confidence || 0, cf = confirmations(c);
    if (c.score > 30 && conf >= 60 && c.risk !== "alto" && cf >= 3) return "segura";
    if (c.score >= 0 && conf >= 45 && cf >= 2) return "moderada";
    return "riesgosa";
  }
  function probability(c) {
    return Math.round(clamp(50 + 0.30 * (c.score || 0) + 0.15 * ((c.confidence || 50) - 50), 5, 95));
  }
  function volatility(c) {
    const s = (c.series && c.series["1M"]) || [];
    return (window.Indicators && window.Indicators.volatility(s)) || 0;
  }
  function targets(c) {
    const sigma = volatility(c), p = c.price;
    const horizon = (days) => {
      const sH = sigma * Math.sqrt(days);
      const drift = clamp((c.score || 0) / 100, -0.6, 0.6) * sH;
      return {
        conservador: p * (1 + drift - sH),
        base: p * (1 + drift),
        optimista: p * (1 + drift + sH),
        sH,
      };
    };
    return { sigma, d7: horizon(7), d30: horizon(30) };
  }
  function recommendation(c) {
    const lv = level(c), name = c.name || c.symbol, parts = [];
    parts.push(c.trend === "alcista" ? "estructura técnica alcista" : c.trend === "bajista" ? "estructura técnica bajista" : "estructura técnica neutral");
    if ((c.change7d || 0) > 3) parts.push("momentum positivo"); else if ((c.change7d || 0) < -3) parts.push("momentum negativo");
    if (c.rsi != null) { if (c.rsi > 70) parts.push("RSI en sobrecompra"); else if (c.rsi < 30) parts.push("RSI en sobreventa"); else if (c.rsi >= 45 && c.rsi <= 70) parts.push("RSI saludable"); }
    if (c.macd && c.macd.hist > 0) parts.push("MACD al alza");
    const lvTxt = lv === "segura" ? "una oportunidad relativamente segura" : lv === "moderada" ? "una oportunidad moderada" : "una oportunidad de riesgo elevado";
    const tail = lv === "segura" ? "con buena confirmación técnica." : lv === "moderada" ? "que requiere confirmación adicional." : "y conviene cautela.";
    return `${name} muestra ${parts.join(", ")}. El riesgo es ${c.risk || "medio"} y la confianza del motor es ${c.confidence}%. Actualmente es ${lvTxt} ${tail}`;
  }

  // Ranking: por score, luego confianza, luego menor riesgo (como pidió el usuario).
  function rank(coins) {
    return (coins || []).filter(full).sort((a, b) =>
      (b.score - a.score) || (b.confidence - a.confidence) || (RISK_RANK[a.risk] - RISK_RANK[b.risk]));
  }

  return { level, probability, targets, recommendation, confirmations, rank, isFull: full };
})();
