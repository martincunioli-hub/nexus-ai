/* =====================================================================
   NEXUS AI — Indicadores técnicos (funciones puras, sin estado)
   Cálculo determinista a partir de cierres diarios reales (CoinGecko).
   Nada de ML ni predicción: matemática estándar y reproducible.
   ===================================================================== */
window.Indicators = (function () {
  "use strict";

  // Media móvil exponencial. Devuelve un array (null hasta tener `period` datos).
  // Se siembra con la SMA de los primeros `period` valores (convención estándar).
  function ema(values, period) {
    if (!values || values.length < period) return [];
    const k = 2 / (period + 1);
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += values[i];
    out[period - 1] = sum / period;
    for (let i = period; i < values.length; i++) out[i] = values[i] * k + out[i - 1] * (1 - k);
    return out;
  }

  // RSI con suavizado de Wilder. Devuelve el último valor (0-100) o null.
  function rsi(values, period) {
    period = period || 14;
    if (!values || values.length < period + 1) return null;
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) {
      const ch = values[i] - values[i - 1];
      if (ch >= 0) gain += ch; else loss -= ch;
    }
    let avgG = gain / period, avgL = loss / period;
    for (let i = period + 1; i < values.length; i++) {
      const ch = values[i] - values[i - 1];
      avgG = (avgG * (period - 1) + (ch > 0 ? ch : 0)) / period;
      avgL = (avgL * (period - 1) + (ch < 0 ? -ch : 0)) / period;
    }
    if (avgL === 0) return 100;
    return 100 - 100 / (1 + avgG / avgL);
  }

  // MACD (12,26,9). Devuelve { value, signal, hist } o null.
  function macd(values, fast, slow, signalP) {
    fast = fast || 12; slow = slow || 26; signalP = signalP || 9;
    const ef = ema(values, fast), es = ema(values, slow);
    if (!ef.length || !es.length) return null;
    const line = values.map((_, i) => (ef[i] != null && es[i] != null) ? ef[i] - es[i] : null);
    const valid = line.filter((v) => v != null);
    if (valid.length < signalP) return null;
    const sig = ema(valid, signalP);
    const mv = valid[valid.length - 1], sv = sig[sig.length - 1];
    return { value: mv, signal: sv, hist: mv - sv };
  }

  // SMA de los últimos `period` valores.
  function sma(values, period) {
    if (!values || !values.length) return null;
    const n = Math.min(period, values.length);
    let s = 0;
    for (let i = values.length - n; i < values.length; i++) s += values[i];
    return s / n;
  }

  // Soporte/resistencia: mínimo/máximo de los últimos `n` cierres, con margen
  // si el precio ya está en el extremo del rango.
  function levels(closes, price, n) {
    n = n || 30;
    const w = closes.slice(-n);
    if (!w.length) return { support: null, resistance: null };
    let support = Math.min.apply(null, w), resistance = Math.max.apply(null, w);
    if (price <= support) support = price * 0.98;
    if (price >= resistance) resistance = price * 1.02;
    return { support, resistance };
  }

  // Volatilidad = desviación estándar de los retornos diarios (últimos n).
  function volatility(closes, n) {
    n = n || 30;
    const w = closes.slice(-(n + 1)), r = [];
    for (let i = 1; i < w.length; i++) if (w[i - 1]) r.push((w[i] - w[i - 1]) / w[i - 1]);
    if (!r.length) return 0;
    const mean = r.reduce((a, b) => a + b, 0) / r.length;
    const v = r.reduce((a, b) => a + (b - mean) * (b - mean), 0) / r.length;
    return Math.sqrt(v);
  }

  // Detecta un cruce EMA50/200 reciente (golden/death) en los últimos ~días.
  function crossState(e50, e200) {
    const n = Math.min(e50.length, e200.length);
    if (!n) return null;
    const cur = (e50[n - 1] != null && e200[n - 1] != null) ? e50[n - 1] - e200[n - 1] : null;
    let prev = null;
    for (let k = 3; k <= 8; k++) {
      const i = n - k;
      if (i >= 0 && e50[i] != null && e200[i] != null) { prev = e50[i] - e200[i]; break; }
    }
    if (cur == null || prev == null) return null;
    if (prev <= 0 && cur > 0) return "golden";
    if (prev >= 0 && cur < 0) return "death";
    return null;
  }

  // Último valor no nulo de un array.
  function lastNum(arr) {
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i];
    return null;
  }

  return { ema, rsi, macd, sma, levels, volatility, crossState, lastNum };
})();
