/* =====================================================================
   NEXUS AI — Contexto del mercado (capa de interpretacion, no toca el motor)
   Lee SOLO lo que ya existe (DATA.market: Fear&Greed, dominancia, cambio de
   cap.; DATA.coins: score/tendencia/senales) y deriva una lectura ejecutiva:
   tendencia general, sentimiento y un resumen para interpretar si el mercado
   acompana o contradice las oportunidades. Tambien relaciona noticias con
   activos (impacto estimado). Sin ML, sin APIs nuevas, sin modificar scoring.
   ===================================================================== */
window.NexusContext = (function () {
  "use strict";

  // Tendencia general derivada del estado agregado del motor (no lo modifica).
  function trend(coins) {
    const cs = (coins || []).filter((c) => c && c.score != null);
    if (!cs.length) return { dir: "lateral", label: "Lateral", avgScore: 0, alcistas: 0, bajistas: 0 };
    const avg = cs.reduce((s, c) => s + (c.score || 0), 0) / cs.length;
    const alcistas = cs.filter((c) => c.trend === "alcista" || c.score > 15).length;
    const bajistas = cs.filter((c) => c.trend === "bajista" || c.score < -15).length;
    let dir = "lateral", label = "Lateral";
    if (avg > 12 && alcistas >= bajistas) { dir = "alcista"; label = "Alcista"; }
    else if (avg < -12 && bajistas >= alcistas) { dir = "bajista"; label = "Bajista"; }
    return { dir, label, avgScore: Math.round(avg), alcistas, bajistas };
  }

  // Sentimiento combinando Fear&Greed con la tendencia tecnica agregada.
  function sentiment(market, tr) {
    const fg = (market && market.fearGreed && market.fearGreed.value) || 50;
    let mood;
    if (fg <= 25) mood = "miedo extremo";
    else if (fg <= 45) mood = "miedo";
    else if (fg <= 55) mood = "neutral";
    else if (fg <= 75) mood = "codicia";
    else mood = "codicia extrema";
    // alineacion entre el animo del mercado y la tecnica
    const aligned =
      (tr.dir === "alcista" && fg >= 55) || (tr.dir === "bajista" && fg <= 45) || tr.dir === "lateral";
    return { mood, fg, aligned };
  }

  function build(market, coins) {
    const tr = trend(coins);
    const se = sentiment(market, tr);
    const dom = market ? market.btcDominance : null;
    const mcapChg = market ? market.mcapChange : null;

    // Resumen ejecutivo: relaciona animo del mercado con las oportunidades.
    const parts = [];
    parts.push("Mercado en " + se.mood + " (indice " + se.fg + ").");
    parts.push("Tendencia tecnica general " + tr.label.toLowerCase() + " (score medio " + (tr.avgScore >= 0 ? "+" : "") + tr.avgScore + ").");
    if (se.fg <= 30 && tr.avgScore > -10) {
      parts.push("Con el mercado en miedo, las oportunidades detectadas suelen ofrecer mejor relacion riesgo-beneficio que el promedio.");
    } else if (se.fg >= 70 && tr.avgScore > 0) {
      parts.push("Con el mercado en codicia, conviene ser selectivo: parte del potencial alcista ya esta descontado.");
    } else if (!se.aligned) {
      parts.push("El animo del mercado y la lectura tecnica no estan alineados; conviene exigir mayor confirmacion.");
    } else {
      parts.push("El animo del mercado acompana la lectura tecnica de las oportunidades actuales.");
    }

    return {
      fearGreed: market ? market.fearGreed : { value: 50, label: "Neutral" },
      dominance: dom, mcapChange: mcapChg,
      trend: tr, sentiment: se,
      summary: parts.join(" "),
    };
  }

  // Relaciona una moneda con las noticias y resume su impacto (estimado).
  function opportunityImpact(coin, news) {
    const sym = coin && coin.symbol;
    const related = (news || []).filter((n) => n.sym === sym).slice(0, 4);
    if (!related.length) return { label: "Sin noticias", dir: "neutral", related: [] };
    let s = 0;
    related.forEach((n) => { s += n.sentiment === "positivo" ? 1 : n.sentiment === "negativo" ? -1 : 0; });
    const label = s > 0 ? "Positivo" : s < 0 ? "Negativo" : "Neutral";
    const dir = s > 0 ? "positivo" : s < 0 ? "negativo" : "neutral";
    return { label, dir, related };
  }

  return { build, trend, sentiment, opportunityImpact };
})();
