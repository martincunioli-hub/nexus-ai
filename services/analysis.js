/* =====================================================================
   NEXUS AI — Motor de análisis (scoring ponderado, determinista)
   Combina indicadores reales en un score [-100,100] → señal/confianza/riesgo.
   100% trazable: cada factor aporta un sub-score con peso explícito y su
   propia razón en lenguaje natural. Sin ML, sin predicción.

   Pesos (suman 1.0):
     EMA alineación 0.26 · RSI 0.20 · Momentum 7d 0.16 · MACD 0.16
     Cruce EMA50/200 0.12 · Volumen 0.10
   ===================================================================== */
window.Analysis = (function () {
  "use strict";
  const I = window.Indicators;
  const W = { rsi: 0.20, ema: 0.26, cross: 0.12, macd: 0.16, vol: 0.10, mom: 0.16 };
  const SIG = { compra: "Compra", neutral: "Neutral", venta: "Venta" };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const r0 = (n) => Math.round(n);

  function analyze(facts, closes, volumes) {
    closes = closes || []; volumes = volumes || [];
    const price = facts.price;
    const change24h = facts.change24h || 0, change7d = facts.change7d || 0;
    const enough = closes.length >= 35;

    // --- indicadores ---
    const e20 = I.ema(closes, 20), e50 = I.ema(closes, 50), e200 = I.ema(closes, 200);
    const ema20 = I.lastNum(e20), ema50 = I.lastNum(e50), ema200 = I.lastNum(e200);
    const rsi = enough ? I.rsi(closes, 14) : null;
    const macd = enough ? I.macd(closes) : null;
    const volAvg = volumes.length ? I.sma(volumes, 20) : null;
    const lv = enough ? I.levels(closes, price) : { support: null, resistance: null };
    const emaCross = (e50.length && e200.length) ? I.crossState(e50, e200) : null;
    const volRatio = (volAvg && volAvg > 0) ? facts.volume / volAvg : null;

    // --- factores: [clave, subScore(-100..100), razón {t,p}] ---
    const F = [];
    let sRsi = 0, sEma = 0, sCross = 0, sMacd = 0, sVol = 0, sMom = 0;

    // RSI
    if (rsi != null) {
      if (rsi < 30) { sRsi = 45; F.push(["rsi", sRsi, { t: `RSI en sobreventa (${r0(rsi)}): posible rebote.`, p: "pos" }]); }
      else if (rsi < 45) { sRsi = 12; F.push(["rsi", sRsi, { t: `RSI bajo (${r0(rsi)}), sin sobreventa clara.`, p: "neu" }]); }
      else if (rsi <= 55) { sRsi = 0; F.push(["rsi", sRsi, { t: `RSI neutro (${r0(rsi)}).`, p: "neu" }]); }
      else if (rsi <= 70) { sRsi = 25; F.push(["rsi", sRsi, { t: `RSI saludable (${r0(rsi)}), impulso sin sobrecompra.`, p: "pos" }]); }
      else { sRsi = -45; F.push(["rsi", sRsi, { t: `RSI en sobrecompra (${r0(rsi)}): riesgo de corrección.`, p: "neg" }]); }
    }

    // EMA: alineación precio / EMA20 / EMA50 / EMA200
    if (ema50 != null && ema200 != null) {
      if (ema20 != null && price > ema20 && ema20 > ema50 && ema50 > ema200) { sEma = 50; F.push(["ema", sEma, { t: "Precio sobre EMA20 > EMA50 > EMA200: alineación alcista plena.", p: "pos" }]); }
      else if (price > ema50 && price > ema200) { sEma = 30; F.push(["ema", sEma, { t: "Precio por encima de EMA50 y EMA200.", p: "pos" }]); }
      else if (ema20 != null && price < ema20 && ema20 < ema50 && ema50 < ema200) { sEma = -50; F.push(["ema", sEma, { t: "Precio bajo EMA20 < EMA50 < EMA200: estructura bajista.", p: "neg" }]); }
      else if (price < ema50 && price < ema200) { sEma = -30; F.push(["ema", sEma, { t: "Precio por debajo de EMA50 y EMA200.", p: "neg" }]); }
      else { sEma = 0; F.push(["ema", sEma, { t: "Medias móviles entrelazadas, sin tendencia clara.", p: "neu" }]); }
    } else if (ema50 != null) {
      if (price > ema50) { sEma = 20; F.push(["ema", sEma, { t: "Precio por encima de la EMA50.", p: "pos" }]); }
      else { sEma = -20; F.push(["ema", sEma, { t: "Precio por debajo de la EMA50.", p: "neg" }]); }
    }

    // Cruce EMA50/200
    if (emaCross === "golden") { sCross = 100; F.push(["cross", sCross, { t: "Cruce alcista EMA50/200 (golden cross) reciente.", p: "pos" }]); }
    else if (emaCross === "death") { sCross = -100; F.push(["cross", sCross, { t: "Cruce bajista EMA50/200 (death cross) reciente.", p: "neg" }]); }

    // MACD
    if (macd && macd.signal != null) {
      if (macd.value > 0 && macd.hist > 0) { sMacd = 35; F.push(["macd", sMacd, { t: "MACD positivo y sobre su señal (impulso alcista).", p: "pos" }]); }
      else if (macd.value > 0) { sMacd = 10; F.push(["macd", sMacd, { t: "MACD positivo pero perdiendo fuerza.", p: "neu" }]); }
      else if (macd.value < 0 && macd.hist < 0) { sMacd = -35; F.push(["macd", sMacd, { t: "MACD negativo y bajo su señal (impulso bajista).", p: "neg" }]); }
      else { sMacd = -10; F.push(["macd", sMacd, { t: "MACD negativo pero recuperando.", p: "neu" }]); }
    }

    // Volumen vs media de 20
    if (volRatio != null) {
      if (volRatio >= 1.5 && change24h > 0) { sVol = 25; F.push(["vol", sVol, { t: `Volumen ${volRatio.toFixed(1)}× la media: confirma la subida.`, p: "pos" }]); }
      else if (volRatio >= 1.5 && change24h < 0) { sVol = -25; F.push(["vol", sVol, { t: `Volumen ${volRatio.toFixed(1)}× la media: presión vendedora.`, p: "neg" }]); }
      else if (volRatio >= 1.5) { sVol = 0; F.push(["vol", sVol, { t: `Volumen elevado (${volRatio.toFixed(1)}× la media).`, p: "neu" }]); }
    }

    // Momentum 7 días (cambio real de CoinGecko)
    if (change7d >= 8) { sMom = 30; F.push(["mom", sMom, { t: `Momentum fuerte: +${change7d.toFixed(1)}% en 7 días.`, p: "pos" }]); }
    else if (change7d >= 3) { sMom = 15; F.push(["mom", sMom, { t: `Momentum positivo: +${change7d.toFixed(1)}% en 7 días.`, p: "pos" }]); }
    else if (change7d <= -8) { sMom = -30; F.push(["mom", sMom, { t: `Caída pronunciada: ${change7d.toFixed(1)}% en 7 días.`, p: "neg" }]); }
    else if (change7d <= -3) { sMom = -15; F.push(["mom", sMom, { t: `Momentum negativo: ${change7d.toFixed(1)}% en 7 días.`, p: "neg" }]); }

    // --- score compuesto, señal ---
    const score = clamp(r0(sRsi * W.rsi + sEma * W.ema + sCross * W.cross + sMacd * W.macd + sVol * W.vol + sMom * W.mom), -100, 100);
    const signal = score > 30 ? "compra" : score < -30 ? "venta" : "neutral";

    // --- confianza: acuerdo direccional entre factores + magnitud del score ---
    const subs = [sRsi, sEma, sCross, sMacd, sVol, sMom].filter((s) => s !== 0);
    const sgn = Math.sign(score) || 1;
    const agree = subs.length ? subs.filter((s) => Math.sign(s) === sgn).length / subs.length : 0;
    const confidence = subs.length
      ? clamp(r0(100 * (0.6 * agree + 0.4 * Math.min(1, Math.abs(score) / 100))), 25, 95)
      : 30;

    // --- riesgo: volatilidad (desv. retornos) + capitalización ---
    const vol = enough ? I.volatility(closes) : Math.abs(change24h) / 100;
    let risk = vol > 0.05 ? "alto" : vol > 0.025 ? "medio" : "bajo";
    if (facts.marketCap > 2e11 && risk === "alto") risk = "medio";
    if (facts.marketCap < 5e9) risk = risk === "bajo" ? "medio" : "alto";

    // --- tendencia ---
    let trend = "lateral";
    if (ema50 != null && ema200 != null) {
      if (price > ema50 && ema50 > ema200) trend = "alcista";
      else if (price < ema50 && ema50 < ema200) trend = "bajista";
    } else if (change7d > 3) trend = "alcista";
    else if (change7d < -3) trend = "bajista";

    // --- motivos ordenados por contribución REAL al score (trazabilidad) ---
    const reasons = F
      .map(([k, s, reason]) => ({ reason, contrib: Math.abs(s * W[k]) }))
      .sort((a, b) => b.contrib - a.contrib)
      .slice(0, 4)
      .map((x) => x.reason);
    if (!reasons.length) reasons.push({ t: "Histórico insuficiente para un análisis técnico completo.", p: "neu" });

    // --- desglose estructurado: cada factor con valor, sub-score, peso y contribución ---
    const emaVal = (ema50 != null && ema200 != null)
      ? (sEma > 0 ? "alcista" : sEma < 0 ? "bajista" : "mixto")
      : (ema50 != null ? (price > ema50 ? "sobre EMA50" : "bajo EMA50") : "—");
    const macdVal = (macd && macd.signal != null) ? (macd.value >= 0 ? "positivo" : "negativo") : "—";
    const factors = [
      { key: "ema",   label: "Alineación EMA",  value: emaVal, sub: sEma, weight: W.ema },
      { key: "rsi",   label: "RSI (14)",        value: rsi != null ? String(r0(rsi)) : "—", sub: sRsi, weight: W.rsi },
      { key: "macd",  label: "MACD",            value: macdVal, sub: sMacd, weight: W.macd },
      { key: "mom",   label: "Momentum 7d",     value: (change7d >= 0 ? "+" : "") + change7d.toFixed(1) + "%", sub: sMom, weight: W.mom },
      { key: "cross", label: "Cruce EMA50/200", value: emaCross || "—", sub: sCross, weight: W.cross },
      { key: "vol",   label: "Volumen/media",   value: volRatio != null ? volRatio.toFixed(2) + "×" : "—", sub: sVol, weight: W.vol },
    ].map((f) => ({ key: f.key, label: f.label, value: f.value, sub: f.sub, weight: f.weight, contrib: Math.round(f.sub * f.weight * 10) / 10 }));

    return {
      rsi, macd: macd || null, ema20, ema50, ema200, volAvg,
      trend, support: lv.support, resistance: lv.resistance,
      signal, score, confidence, risk, reasons, factors, weights: W,
      emaCross, volRatio,
    };
  }

  // Alertas derivadas de los indicadores ya calculados (reales, no simuladas).
  function deriveAlerts(coins, th) {
    th = th || { rsiLow: 30, rsiHigh: 70, volMult: 1.8 };
    const out = [];
    let id = 1;
    coins.forEach((c) => {
      if (c.rsi != null) {
        if (c.rsi < th.rsiLow) out.push({ id: id++, type: "rsi_low", severity: c.rsi < 25 ? "critical" : "warning", sym: c.symbol, message: `RSI en sobreventa (${Math.round(c.rsi)}).`, time: "ahora" });
        else if (c.rsi > th.rsiHigh) out.push({ id: id++, type: "rsi_high", severity: c.rsi > 78 ? "critical" : "warning", sym: c.symbol, message: `RSI en sobrecompra (${Math.round(c.rsi)}).`, time: "ahora" });
      }
      if (c._emaCross === "golden") out.push({ id: id++, type: "ema_cross", severity: "info", sym: c.symbol, message: "Cruce alcista EMA50/200 (golden cross) reciente.", time: "hoy" });
      if (c._emaCross === "death") out.push({ id: id++, type: "ema_cross", severity: "critical", sym: c.symbol, message: "Cruce bajista EMA50/200 (death cross) reciente.", time: "hoy" });
      if (c._volRatio && c._volRatio >= th.volMult) out.push({ id: id++, type: "vol_spike", severity: c._volRatio >= 2.5 ? "warning" : "info", sym: c.symbol, message: `Volumen ${c._volRatio.toFixed(1)}× la media de 20 períodos.`, time: "ahora" });
      if (c._signalChange) out.push({ id: id++, type: "signal_change", severity: "info", sym: c.symbol, message: `Cambio de señal: ${SIG[c._signalChange.from]} → ${SIG[c._signalChange.to]}`, time: "ahora" });
    });
    const rank = { critical: 0, warning: 1, info: 2 };
    out.sort((a, b) => rank[a.severity] - rank[b.severity]);
    return out.slice(0, 20);
  }

  return { analyze, deriveAlerts };
})();
