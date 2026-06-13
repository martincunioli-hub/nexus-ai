/* =====================================================================
   NEXUS AI — Lógica de la aplicación (prototipo navegable)
   Router por hash + render de 7 pantallas + gráficos SVG + tema.
   Sin dependencias externas. Datos desde data.js (window.NEXUS_DATA).
   ===================================================================== */
(function () {
  "use strict";
  let DATA = null; // lo asigna boot() tras DataService.load() (datos reales o fallback)
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- Estado ---------- */
  const state = {
    view: "dashboard",
    coin: "BTC",
    tf: "1S",
    sort: { key: "marketCap", dir: "desc" },
    alertFilter: "todas",
    perfHorizon: "d7",
    theme: "dark",
    fav: ["BTC", "ETH", "SOL"],
    prefs: { rsi: true, ema: true, vol: true, signal: true },
    thresholds: { rsiLow: 30, rsiHigh: 70, volMult: 2.0 },
  };

  /* ---------- Persistencia ---------- */
  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem("nexus.settings"));
      if (s) Object.assign(state, { theme: s.theme || "dark", fav: s.fav || state.fav,
        prefs: { ...state.prefs, ...s.prefs }, thresholds: { ...state.thresholds, ...s.thresholds } });
    } catch (e) { /* demo: ignorar */ }
  }
  function saveSettings() {
    const { theme, fav, prefs, thresholds } = state;
    try { localStorage.setItem("nexus.settings", JSON.stringify({ theme, fav, prefs, thresholds })); } catch (e) {}
  }

  /* ---------- Utilidades de formato ---------- */
  const SIGNAL_LABEL = { compra: "Compra", neutral: "Neutral", venta: "Venta" };
  const SIGNAL_CLASS = { compra: "buy", neutral: "neutral", venta: "sell" };
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "—");
  const coinBy = (sym) => DATA.coins.find((c) => c.symbol === sym) || DATA.coins[0];

  function money(n) {
    if (n == null) return "—";
    const o = n >= 1000 ? { maximumFractionDigits: 0 }
      : n >= 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : n >= 0.01 ? { minimumFractionDigits: 4, maximumFractionDigits: 4 }
      : { minimumFractionDigits: 6, maximumFractionDigits: 6 };
    return "$" + n.toLocaleString("en-US", o);
  }
  function abbrev(n) {
    const a = Math.abs(n);
    if (a >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
    if (a >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return "$" + (n / 1e3).toFixed(2) + "K";
    return "$" + n.toFixed(0);
  }
  function fmtNum(n) {
    const a = Math.abs(n);
    if (a === 0) return "0";
    if (a < 0.001) return n.toExponential(1);
    if (a < 1) return n.toFixed(a < 0.1 ? 4 : 3);
    if (a < 100) return n.toFixed(2);
    return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
  }
  const chg = (n) => `<span class="${n >= 0 ? "pos" : "neg"}">${n >= 0 ? "▲" : "▼"} ${Math.abs(n).toFixed(2)}%</span>`;

  /* ---------- Componentes reutilizables ---------- */
  const coinLogo = (c, size) => {
    const fs = c.symbol.length > 3 ? 9 : 11;
    const dim = size ? `width:${size}px;height:${size}px;` : "";
    return `<span class="coin-logo" style="background:${c.color};color:${c.fg || "#fff"};${dim}font-size:${fs}px">${c.symbol}</span>`;
  };
  const coinCell = (c) => `<span class="coin">${coinLogo(c)}<span><span class="coin-name">${c.name}</span> <span class="coin-sym">${c.symbol}</span></span></span>`;
  const favStar = (sym) => `<span class="fav-star ${state.fav.includes(sym) ? "on" : ""}" data-action="fav" data-sym="${sym}" title="Watchlist">${state.fav.includes(sym) ? "★" : "☆"}</span>`;
  const signalBadge = (s, sm) => {
    const st = sm ? ' style="font-size:11px;padding:3px 8px"' : "";
    if (!s) return `<span class="badge sent-neutral"${st}>—</span>`; // pendiente Paso 2
    return `<span class="badge signal-${SIGNAL_CLASS[s]}"${st}><span class="pip"></span>${SIGNAL_LABEL[s]}</span>`;
  };
  const riskBadge = (r) => (r ? `<span class="badge risk-${r}">${cap(r)}</span>` : `<span class="badge sent-neutral">—</span>`);
  const sentBadge = (s) => `<span class="badge sent-${s}">${cap(s)}</span>`;
  const confbar = (v) => `<div class="confbar"><span style="width:${v || 0}%"></span></div>`;
  const reasonsList = (rs, max) => {
    rs = rs || [];
    if (!rs.length) return `<p class="faint" style="font-size:12.5px;margin:6px 0 0">Motivos disponibles tras el Paso 2 (análisis técnico).</p>`;
    return `<ul class="reasons">${rs.slice(0, max || 4).map((r) => `<li><span class="r-pip r-${r.p}"></span><span>${r.t}</span></li>`).join("")}</ul>`;
  };

  function sparkSVG(arr, up) {
    const w = 92, h = 30, min = Math.min(...arr), max = Math.max(...arr), rng = (max - min) || 1;
    const pts = arr.map((v, i) => `${(i / (arr.length - 1) * w).toFixed(1)},${(h - 2 - ((v - min) / rng) * (h - 4)).toFixed(1)}`).join(" ");
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${up ? "var(--green)" : "var(--red)"}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
  }

  function areaChart(arr, up, sup, res) {
    const W = 720, H = 260, pT = 14, pB = 16;
    const fin = (v) => typeof v === "number" && isFinite(v);
    const extra = [sup, res].filter(fin); // soporte/resistencia opcionales (Paso 2)
    const lo = Math.min(...arr, ...extra), hi = Math.max(...arr, ...extra), rng = (hi - lo) || 1;
    const X = (i) => (i / (arr.length - 1)) * W;
    const Y = (v) => pT + (1 - (v - lo) / rng) * (H - pT - pB);
    const line = arr.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
    const col = up ? "var(--green)" : "var(--red)";
    const gid = "g" + Math.random().toString(36).slice(2, 7);
    const srLine = (v, c) => `<line x1="0" y1="${Y(v).toFixed(1)}" x2="${W}" y2="${Y(v).toFixed(1)}" stroke="${c}" stroke-width="1" stroke-dasharray="5 5" opacity=".5" vector-effect="non-scaling-stroke"/>`;
    return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${col}" stop-opacity=".26"/><stop offset="1" stop-color="${col}" stop-opacity="0"/>
      </linearGradient></defs>
      <polygon points="0,${H - pB} ${line} ${W},${H - pB}" fill="url(#${gid})"/>
      ${fin(res) ? srLine(res, "var(--red)") : ""}${fin(sup) ? srLine(sup, "var(--green)") : ""}
      <polyline points="${line}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    </svg>`;
  }

  function fngGauge(value) {
    const bands = [[180, 135, "#ea3943"], [135, 99, "#f6851b"], [99, 81, "#f0b90b"], [81, 45, "#93d900"], [45, 0, "#16c784"]];
    const pt = (t, r) => { const a = t * Math.PI / 180; return [(100 + r * Math.cos(a)).toFixed(2), (100 - r * Math.sin(a)).toFixed(2)]; };
    const band = ([t1, t2, c]) => {
      const pts = []; for (let i = 0; i <= 14; i++) { const t = t1 + (t2 - t1) * i / 14; pts.push(pt(t, 82).join(",")); }
      return `<polyline points="${pts.join(" ")}" fill="none" stroke="${c}" stroke-width="13" stroke-linecap="round"/>`;
    };
    const tv = 180 - value * 1.8, [nx, ny] = pt(tv, 66);
    return `<svg viewBox="0 0 200 116" style="width:200px;max-width:100%">
      ${bands.map(band).join("")}
      <line x1="100" y1="100" x2="${nx}" y2="${ny}" stroke="var(--text)" stroke-width="3" stroke-linecap="round"/>
      <circle cx="100" cy="100" r="6" fill="var(--text)"/>
    </svg>`;
  }

  /* ---------- Rankings derivados (por score real del motor) ---------- */
  function rankings() {
    const cs = DATA.coins;
    return {
      oport: [...cs].sort((a, b) => (b.score || 0) - (a.score || 0)),    // mejores setups técnicos
      riesgos: [...cs].sort((a, b) => (a.score || 0) - (b.score || 0)),  // peores setups / mayor cautela
      momentum: [...cs].sort((a, b) => (b.change7d || 0) - (a.change7d || 0)),
    };
  }
  const fmtScore = (s) => (s == null ? "—" : (s >= 0 ? "+" : "") + s);

  // Desglose visual de los factores que componen el score (barras de contribución).
  // full=true añade el peso de cada factor (para el Perfil).
  function factorBreakdown(factors, full) {
    if (!factors || !factors.length) return "";
    const max = Math.max.apply(null, factors.map((f) => Math.abs(f.contrib))) || 1;
    const rows = [...factors].sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib)).map((f) => {
      const w = Math.max(4, Math.round(Math.abs(f.contrib) / max * 100));
      const cls = f.contrib > 0 ? "pos" : f.contrib < 0 ? "neg" : "muted";
      return `<div class="fbar">
        <span class="fbar-name">${f.label} <span class="faint">${f.value}${full ? ` · ${Math.round(f.weight * 100)}%` : ""}</span></span>
        <span class="fbar-track"><span class="fbar-fill ${cls}" style="width:${w}%"></span></span>
        <span class="fbar-contrib mono ${cls}">${f.contrib > 0 ? "+" : ""}${f.contrib}</span>
      </div>`;
    }).join("");
    return `<div class="fbars">${rows}</div>`;
  }

  // ¿Tiene análisis técnico completo? (para no mostrar activos sin info suficiente)
  function hasFullAnalysis(c) {
    return !!(c && c.signal != null && c.rsi != null && c.score != null);
  }

  // Valores crudos de indicadores (RSI, EMA20/50/200, MACD) como chips.
  function indChips(c) {
    const chips = [
      c.rsi != null ? `RSI ${Math.round(c.rsi)}` : null,
      c.ema20 != null ? `EMA20 ${money(c.ema20)}` : null,
      c.ema50 != null ? `EMA50 ${money(c.ema50)}` : null,
      c.ema200 != null ? `EMA200 ${money(c.ema200)}` : null,
      c.macd ? `MACD ${c.macd.hist >= 0 ? "▲" : "▼"} ${fmtNum(c.macd.hist)}` : null,
    ].filter(Boolean);
    return `<div class="ind-chips">${chips.map((t) => `<span class="ind-chip">${t}</span>`).join("")}</div>`;
  }

  // Tabla auditable: cada factor con Valor, Sub-score, Peso y Contribución.
  function factorTable(factors, score) {
    if (!factors || !factors.length) return "";
    const sc = (n) => (n > 0 ? "pos" : n < 0 ? "neg" : "muted");
    const rows = [...factors].sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib)).map((f) => `<tr>
      <td>${f.label}</td>
      <td class="faint">${f.value}</td>
      <td class="mono ${sc(f.sub)}">${f.sub > 0 ? "+" : ""}${f.sub}</td>
      <td class="mono faint">${Math.round(f.weight * 100)}%</td>
      <td class="mono ${sc(f.contrib)}">${f.contrib > 0 ? "+" : ""}${f.contrib}</td>
    </tr>`).join("");
    return `<table class="ftable">
      <thead><tr><th>Factor</th><th>Valor</th><th>Sub</th><th>Peso</th><th>Contrib.</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="4">Score final</td><td class="mono ${sc(score)}">${fmtScore(score)}</td></tr></tfoot>
    </table>`;
  }

  // Fila rica de oportunidad (Dashboard): score, señal, riesgo y motivo principal.
  function oppRow(c, i) {
    const motivo = c.reasons && c.reasons[0] ? c.reasons[0].t : "—";
    return `<div class="opp-item" data-coin="${c.symbol}">
      <span class="rank-n">${i + 1}</span>
      ${coinCell(c)}
      <span class="opp-tags">${signalBadge(c.signal, true)}${riskBadge(c.risk)}<span class="mono opp-score ${c.score >= 0 ? "pos" : "neg"}">score ${fmtScore(c.score)}</span></span>
      <span class="opp-why faint">${motivo}</span>
    </div>`;
  }

  // Alertas configurables: se generan con los umbrales del usuario y se filtran por
  // los tipos que tenga activados en Configuración. (Reusa el motor Analysis.)
  const ALERT_PREF = { rsi_low: "rsi", rsi_high: "rsi", ema_cross: "ema", vol_spike: "vol", signal_change: "signal" };
  function computeAlerts() {
    if (!DATA || !DATA.coins || !window.Analysis) return [];
    return window.Analysis.deriveAlerts(DATA.coins, state.thresholds).filter((a) => state.prefs[ALERT_PREF[a.type]] !== false);
  }
  function updateAlertBadge() {
    const badge = $("#navAlertCount");
    if (!badge) return;
    const n = computeAlerts().length;
    badge.textContent = n;
    badge.dataset.zero = n === 0;
  }

  // Resumen ejecutivo automático ("¿Qué debería mirar hoy?") en lenguaje simple (máx. 5 líneas).
  function dailyBriefing() {
    const all = DATA.coins, m = DATA.market;
    const cs = all.filter(hasFullAnalysis);
    const tickers = (arr) => arr.map((c) => `<span class="bf-coin" data-coin="${c.symbol}">${c.symbol}</span>`).join(", ");
    const byScore = [...cs].sort((a, b) => b.score - a.score);
    const buys = cs.filter((c) => c.signal === "compra");
    const sells = cs.filter((c) => c.signal === "venta");
    const ups = all.filter((c) => c.change24h > 0).length;
    const btc = cs.find((c) => c.symbol === "BTC");
    const lines = [];

    lines.push(`Mercado en <strong>${m.fearGreed.label.toLowerCase()}</strong> (índice ${m.fearGreed.value}); ${ups} de ${all.length} activos suben hoy.`);
    if (btc) {
      const rel = btc.trend === "alcista" ? "mantiene una estructura alcista"
        : btc.score >= 0 ? "mantiene fortaleza relativa"
        : "se mantiene bajo presión";
      lines.push(`<strong>Bitcoin</strong> ${rel} (score ${fmtScore(btc.score)}, ${btc.signal}).`);
    }
    if (byScore.length) lines.push(`Mejores configuraciones técnicas: ${tickers(byScore.slice(0, 3))}.`);
    const worst = [...cs].sort((a, b) => a.score - b.score).slice(0, 2);
    if (worst.length) lines.push(`Mayores riesgos: ${tickers(worst)}.`);
    if (sells.length === 0) lines.push(`No se detectan señales de venta fuertes${buys.length ? `; ${buys.length} de compra` : ""}.`);
    else lines.push(`${buys.length} señal(es) de compra y ${sells.length} de venta entre los activos analizados.`);

    return lines.slice(0, 5);
  }
  function briefingCard() {
    const lines = dailyBriefing();
    return `<div class="card briefing">
      <div class="briefing-head"><span class="briefing-kicker">NEXUS · Hoy</span><h2>¿Qué debería mirar hoy?</h2></div>
      <div class="briefing-lines">${lines.map((l) => `<p class="bf-line">${l}</p>`).join("")}</div>
    </div>`;
  }

  /* =====================================================================
     PANTALLA · DASHBOARD
     ===================================================================== */
  function renderDashboard() {
    const m = DATA.market, r = rankings();
    const hasSignals = DATA.coins.some((c) => c.signal != null); // Paso 2 activo?
    const fecha = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

    const list = (items, right) => items.length
      ? `<div class="rank-list">${items.slice(0, 5).map((c, i) => `<div class="rank-item" data-coin="${c.symbol}"><span class="rank-n">${i + 1}</span>${coinCell(c)}<span class="right">${right(c)}</span></div>`).join("")}</div>`
      : `<p class="muted" style="padding:14px 6px;font-size:12.5px">Se activa con el análisis técnico (Paso 2).</p>`;

    const featured = (() => {
      const valid = DATA.coins.filter(hasFullAnalysis);
      const byScore = [...valid].sort((a, b) => b.score - a.score);
      const picks = [];
      const add = (c) => { if (c && !picks.some((p) => p.symbol === c.symbol)) picks.push(c); };
      add(byScore[0]);                       // mejor setup
      add(byScore[byScore.length - 1]);      // mayor riesgo / más bajista
      add(coinBy("BTC"));                     // referencia del mercado
      return picks.length ? picks.slice(0, 3) : ["SOL", "BTC", "XRP"].map(coinBy);
    })();
    const tile = (c) => `<div class="signal-tile" data-coin="${c.symbol}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">${coinCell(c)}${signalBadge(c.signal, true)}</div>
      <div style="display:flex;justify-content:space-between;font-size:12px" class="muted"><span>Confianza</span><strong style="color:var(--text)">${c.confidence != null ? c.confidence + "%" : "—"}</strong></div>
      <div style="margin:7px 0 9px">${confbar(c.confidence)}</div>
      <div class="faint" style="font-size:12px;line-height:1.4">${c.reasons && c.reasons[0] ? c.reasons[0].t : "Análisis técnico disponible en el Paso 2."}</div>
    </div>`;

    return `
      <div class="page-head"><h1>Dashboard</h1><p>${cap(fecha)} · visión general del mercado y señales del motor NEXUS.</p></div>

      ${hasSignals ? briefingCard() : ""}

      <div class="dash-top">
        <div class="card fng">
          <div class="stat-label" style="margin-bottom:10px">Fear &amp; Greed Index</div>
          ${fngGauge(m.fearGreed.value)}
          <div class="fng-value">${m.fearGreed.value}</div>
          <div class="fng-label" style="color:var(--amber)">${m.fearGreed.label}</div>
          <div class="fng-scale"><span>Miedo extremo</span><span>Codicia extrema</span></div>
        </div>

        <div class="card">
          <div class="section-head"><h2>Resumen del mercado</h2><span class="faint" style="font-size:12px">24 h</span></div>
          <div class="mini-stats">
            <div class="mini"><span>Cap. total</span><strong>${abbrev(m.totalMcap)}</strong><em>${chg(m.mcapChange)}</em></div>
            <div class="mini"><span>Volumen 24 h</span><strong>${abbrev(m.vol24h)}</strong><em class="faint">global</em></div>
            <div class="mini"><span>Dominancia BTC</span><strong>${m.btcDominance}%</strong><em class="faint">estable</em></div>
            <div class="mini"><span>Activos seguidos</span><strong>${m.activeCoins}</strong><em class="faint">monitorizados</em></div>
          </div>
          <p class="muted" style="margin:14px 0 0;font-size:13px;line-height:1.55">${m.summary}</p>
        </div>
      </div>

      <div class="section-head" style="margin-top:26px"><h2>Señales IA destacadas</h2><span class="link" data-view-link="analysis">Ver análisis →</span></div>
      ${hasSignals
        ? `<div class="signal-strip">${featured.map(tile).join("")}</div>`
        : `<div class="card"><p class="muted" style="margin:0;font-size:13px;line-height:1.55">Las señales IA (Compra / Neutral / Venta) se generan en el <strong>Paso 2</strong> a partir de RSI, MACD y EMAs. Los datos de mercado de arriba ya son reales (CoinGecko).</p></div>`}

      <div class="section-head" style="margin-top:26px"><h2>Top oportunidades</h2><span class="faint" style="font-size:12px">por score técnico</span></div>
      <div class="card" style="padding:4px 16px">${(() => {
        const opps = r.oport.filter(hasFullAnalysis).slice(0, 5);
        return opps.length ? opps.map(oppRow).join("") : `<p class="muted" style="padding:16px 6px;font-size:13px">Sin oportunidades con datos suficientes en este momento.</p>`;
      })()}</div>

      <div class="grid cols-2" style="margin-top:16px">
        <div class="card">
          <div class="section-head"><h2>Top riesgos</h2></div>
          ${list(r.riesgos.filter(hasFullAnalysis), (c) => `<span style="display:inline-flex;gap:7px;align-items:center;justify-content:flex-end">${riskBadge(c.risk)}<span class="mono ${c.score >= 0 ? "pos" : "neg"}" style="min-width:30px">${fmtScore(c.score)}</span></span>`)}
        </div>
        <div class="card">
          <div class="section-head"><h2>Tendencias del día</h2></div>
          ${list(r.momentum, (c) => chg(c.change7d))}
        </div>
      </div>`;
  }

  /* =====================================================================
     PANTALLA · MERCADO
     ===================================================================== */
  function renderMarket() {
    const dir = state.sort.dir, key = state.sort.key;
    const sorted = [...DATA.coins].sort((a, b) => {
      const va = a[key], vb = b[key];
      return (dir === "asc" ? 1 : -1) * (va > vb ? 1 : va < vb ? -1 : 0);
    });
    const th = (label, k, left) => `<th class="sortable" data-action="sort" data-key="${k}" style="${left ? "text-align:left" : ""}">${label}${key === k ? ` <span class="arrow">${dir === "asc" ? "▲" : "▼"}</span>` : ""}</th>`;
    const rows = sorted.map((c) => `<tr data-coin="${c.symbol}">
      <td>${favStar(c.symbol)} ${coinCell(c)}</td>
      <td class="mono">${money(c.price)}</td>
      <td>${chg(c.change24h)}</td>
      <td>${chg(c.change7d)}</td>
      <td class="mono">${abbrev(c.volume)}</td>
      <td class="mono">${abbrev(c.marketCap)}</td>
      <td>${sparkSVG(c.series["1S"], c.change7d >= 0)}</td>
      <td>${signalBadge(c.signal, true)}</td>
      <td>${riskBadge(c.risk)}</td>
    </tr>`).join("");

    return `
      <div class="page-head"><h1>Mercado</h1><p>${DATA.coins.length} activos con precio, variación, volumen y señal del motor IA. Toca una fila para ver el perfil.</p></div>
      <div class="table-wrap"><table class="market">
        <thead><tr>
          ${th("Activo", "rank", true)}
          ${th("Precio", "price")}
          ${th("24 h", "change24h")}
          ${th("7 d", "change7d")}
          ${th("Volumen 24 h", "volume")}
          ${th("Cap. mercado", "marketCap")}
          <th style="cursor:default">Últimos 7 d</th>
          ${th("Señal IA", "score")}
          <th style="cursor:default">Riesgo</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  }

  /* =====================================================================
     PANTALLA · WATCHLIST
     ===================================================================== */
  function renderWatchlist() {
    const favs = state.fav.map((s) => DATA.coins.find((c) => c.symbol === s)).filter(Boolean);
    const head = `<div class="page-head"><h1>Watchlist</h1><p>Tus activos marcados. Tocá la ⭐ en Mercado o en el perfil de una moneda para agregar o quitar.</p></div>`;
    if (!favs.length) {
      return head + `<div class="card"><p class="muted" style="margin:0;line-height:1.6">Todavía no tenés activos en tu watchlist. En <span class="link" data-view-link="market">Mercado</span> tocá la <strong>☆</strong> de los que quieras seguir.</p></div>`;
    }
    const rows = favs.map((c) => `<tr data-coin="${c.symbol}">
      <td>${favStar(c.symbol)} ${coinCell(c)}</td>
      <td class="mono">${money(c.price)}</td>
      <td>${chg(c.change24h)}</td>
      <td>${sparkSVG(c.series["1S"], c.change7d >= 0)}</td>
      <td>${signalBadge(c.signal, true)}</td>
      <td class="mono ${c.score >= 0 ? "pos" : "neg"}">${fmtScore(c.score)}</td>
      <td>${riskBadge(c.risk)}</td>
    </tr>`).join("");
    return head + `<div class="table-wrap"><table class="market"><thead><tr>
      <th style="text-align:left">Activo</th><th>Precio</th><th>24 h</th><th style="cursor:default">7 d</th><th>Señal IA</th><th>Score</th><th>Riesgo</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /* =====================================================================
     PANTALLA · ANÁLISIS IA
     ===================================================================== */
  function renderAnalysis() {
    const order = { compra: 0, neutral: 1, venta: 2 };
    const hasSignals = DATA.coins.some((c) => c.signal != null);
    const ord = (s) => (order[s] != null ? order[s] : 9);
    const cs = [...DATA.coins].sort((a, b) => ord(a.signal) - ord(b.signal) || (b.confidence || 0) - (a.confidence || 0));
    const card = (c) => `<div class="card analysis-card" data-coin="${c.symbol}">
      <div class="analysis-top">${coinCell(c)}${signalBadge(c.signal)}</div>
      <div class="analysis-metrics">
        <div class="metric"><div class="m-label">Confianza</div><div class="m-val">${c.confidence != null ? c.confidence + "%" : "—"}</div></div>
        <div class="metric"><div class="m-label">Riesgo</div><div class="m-val" style="font-size:14px">${riskBadge(c.risk)}</div></div>
        <div class="metric"><div class="m-label">Score</div><div class="m-val ${c.score == null ? "muted" : c.score >= 0 ? "pos" : "neg"}">${c.score != null ? (c.score >= 0 ? "+" : "") + c.score : "—"}</div></div>
      </div>
      ${confbar(c.confidence)}
      ${c.factors && c.factors.length ? indChips(c) : ""}
      ${reasonsList(c.reasons, 3)}
      ${c.factors && c.factors.length ? `<div class="section-sub">Desglose auditable del score</div>${factorTable(c.factors, c.score)}` : ""}
    </div>`;
    return `
      <div class="page-head"><h1>Análisis IA</h1><p>Motor determinista y explicable: combina RSI, MACD, EMA 20/50/200, volumen y tendencia. Cada señal expone sus motivos.</p></div>
      ${hasSignals ? "" : `<div class="card" style="margin-bottom:16px"><p class="muted" style="margin:0;font-size:13px;line-height:1.55"><strong>Paso 2 pendiente.</strong> El análisis técnico (RSI, MACD, EMA 20/50/200) aún no está activo: por eso señal, confianza, riesgo y motivos figuran como “—”. Los datos de mercado ya son reales (CoinGecko).</p></div>`}
      <div class="analysis-grid">${cs.map(card).join("")}</div>`;
  }

  /* =====================================================================
     PANTALLA · PERFIL DE MONEDA
     ===================================================================== */
  function renderProfile(sym) {
    const c = coinBy(sym || state.coin);
    state.coin = c.symbol;
    const series = c.series[state.tf];
    const up = series[series.length - 1] >= series[0];
    const hasAnalysis = c.signal != null;
    const z = c.rsi == null ? { t: "—", cls: "muted" }
      : c.rsi < 30 ? { t: "Sobreventa", cls: "pos" }
      : c.rsi > 70 ? { t: "Sobrecompra", cls: "neg" }
      : { t: "Neutral", cls: "muted" };
    const tfs = ["1D", "1S", "1M", "1A"];
    const lo = c.support, hi = c.resistance, pos = Math.max(2, Math.min(98, (c.price - lo) / (hi - lo) * 100));
    const relNews = DATA.news.filter((n) => n.sym === c.symbol);
    const news = (relNews.length ? relNews : DATA.news.slice(0, 3));

    const ind = (name, val, extra) => `<div class="ind"><span class="ind-name">${name}</span><span class="ind-val ${extra || ""}">${val}</span></div>`;

    return `
      <div class="page-head" style="margin-bottom:16px">
        <div class="profile-head">
          ${coinLogo(c, 46)}
          <div style="flex:1">
            <div style="display:flex;align-items:baseline;gap:10px"><span style="font-size:20px;font-weight:700">${c.name}</span><span class="coin-sym">${c.symbol} · #${c.rank}</span><span style="font-size:18px">${favStar(c.symbol)}</span></div>
            <div style="display:flex;align-items:baseline;gap:12px;margin-top:2px"><span class="price">${money(c.price)}</span><span style="font-size:14px">${chg(c.change24h)}</span></div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">${signalBadge(c.signal)}${riskBadge(c.risk)}</div>
        </div>
      </div>

      <div class="grid split">
        <div class="card chart-card">
          <div class="chart-toolbar">${tfs.map((t) => `<button class="tf-btn ${t === state.tf ? "active" : ""}" data-action="tf" data-tf="${t}">${t}</button>`).join("")}</div>
          <div id="chartHost">${areaChart(series, up, c.support, c.resistance)}</div>
          <div class="faint" style="font-size:11.5px;padding:4px 2px 6px;display:flex;gap:16px"><span>— línea: precio</span><span style="color:var(--green)">- - soporte</span><span style="color:var(--red)">- - resistencia</span></div>
        </div>

        <div class="card">
          <div class="section-head"><h2>Análisis IA</h2></div>
          ${hasAnalysis ? `
          <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px;flex-wrap:wrap">${signalBadge(c.signal)}<span class="muted" style="font-size:13px">Score <strong class="${c.score >= 0 ? "pos" : "neg"}">${fmtScore(c.score)}</strong></span><span class="muted" style="font-size:13px">Confianza <strong style="color:var(--text)">${c.confidence}%</strong></span><span class="muted" style="font-size:13px">Riesgo ${riskBadge(c.risk)}</span></div>
          ${confbar(c.confidence)}
          <p class="muted" style="font-size:13px;line-height:1.5;margin:12px 0 10px">Señal de <strong style="color:var(--text)">${SIGNAL_LABEL[c.signal]}</strong> en temporalidad ${state.tf}, con riesgo <strong style="color:var(--text)">${cap(c.risk)}</strong>. Motivos principales:</p>
          ${reasonsList(c.reasons, 4)}
          ${c.factors && c.factors.length ? `<div class="section-sub">Desglose del score · ${fmtScore(c.score)} <span class="faint">(peso × indicador)</span></div>${factorBreakdown(c.factors, true)}` : ""}` : `
          <p class="muted" style="font-size:13px;line-height:1.6;margin:6px 0 0">La señal (Compra / Neutral / Venta), confianza, riesgo y motivos se calculan en el <strong>Paso 2</strong> con RSI, MACD y EMAs. El precio, la variación y el volumen de esta moneda ya son reales.</p>`}
        </div>
      </div>

      <div class="grid split" style="margin-top:16px">
        <div class="card">
          <div class="section-head"><h2>Indicadores técnicos</h2><span class="faint" style="font-size:12px">temporalidad diaria</span></div>
          <div class="ind-grid">
            ${ind("RSI (14)", c.rsi != null ? `${Math.round(c.rsi)} · <span class="${z.cls}">${z.t}</span>` : "—")}
            ${ind("MACD (hist.)", c.macd ? `${c.macd.hist >= 0 ? "▲" : "▼"} ${fmtNum(c.macd.hist)}` : "—", c.macd ? (c.macd.hist >= 0 ? "pos" : "neg") : "")}
            ${ind("EMA 20", money(c.ema20))}
            ${ind("EMA 50", money(c.ema50))}
            ${ind("EMA 200", money(c.ema200))}
            ${ind("Volumen 24 h", abbrev(c.volume))}
            ${ind("Tendencia", cap(c.trend), c.trend === "alcista" ? "pos" : c.trend === "bajista" ? "neg" : "muted")}
            ${ind("Cambio 7 d", chg(c.change7d))}
          </div>
        </div>

        <div class="card">
          <div class="section-head"><h2>Soportes y resistencias</h2></div>
          ${hasAnalysis ? `
          <div class="range-track"><span class="range-fill" style="width:${pos}%"></span><span class="range-dot" style="left:${pos}%"></span></div>
          <div class="range-legend">
            <div><span class="dotc pos"></span> Soporte <strong class="mono">${money(lo)}</strong></div>
            <div><span class="dotc neg"></span> Resistencia <strong class="mono">${money(hi)}</strong></div>
          </div>
          <p class="faint" style="font-size:12px;margin:12px 0 0;line-height:1.5">Precio a <strong class="pos">${((c.price - lo) / lo * 100).toFixed(1)}%</strong> sobre el soporte y a <strong class="neg">${((hi - c.price) / c.price * 100).toFixed(1)}%</strong> de la resistencia.</p>` : `
          <p class="muted" style="font-size:13px;line-height:1.6;margin:6px 0 0">Los niveles de soporte y resistencia se calculan en el <strong>Paso 2</strong> a partir del histórico de precios.</p>`}
        </div>
      </div>

      <div class="section-head" style="margin-top:26px"><h2>Noticias relacionadas</h2></div>
      <div class="card" style="padding:4px 16px">${news.map((n, i) => `<div data-action="noop" style="display:flex;gap:14px;align-items:center;padding:13px 0;${i < news.length - 1 ? "border-bottom:1px solid var(--border-soft)" : ""}">
        ${sentBadge(n.sentiment)}
        <div style="flex:1;min-width:0"><div style="font-weight:600;font-size:13.5px">${n.title}</div><div class="faint" style="font-size:12px;margin-top:2px">${n.source} · ${n.time}</div></div>
        <span class="impact">${impactDots(n.impact)}</span>
      </div>`).join("")}</div>`;
  }

  /* =====================================================================
     PANTALLA · ALERTAS
     ===================================================================== */
  const TYPE_LABEL = { rsi_low: "RSI bajo", rsi_high: "RSI alto", ema_cross: "Cruce EMA", vol_spike: "Volumen anormal", signal_change: "Cambio de señal" };
  function alertIcon(type) {
    const p = {
      rsi_low: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
      rsi_high: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
      ema_cross: '<path d="M4 18 20 6M4 6l16 12"/>',
      vol_spike: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
      signal_change: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
    }[type] || '<circle cx="12" cy="12" r="8"/>';
    return `<svg viewBox="0 0 24 24" class="ico">${p}</svg>`;
  }
  function renderAlerts() {
    const filters = [["todas", "Todas"], ["rsi", "RSI"], ["ema", "Cruces EMA"], ["vol", "Volumen"], ["signal", "Cambios de señal"]];
    const match = (a) => state.alertFilter === "todas"
      || (state.alertFilter === "rsi" && a.type.startsWith("rsi"))
      || (state.alertFilter === "ema" && a.type === "ema_cross")
      || (state.alertFilter === "vol" && a.type === "vol_spike")
      || (state.alertFilter === "signal" && a.type === "signal_change");
    const all = computeAlerts();
    const items = all.filter(match);
    const row = (a) => { const c = coinBy(a.sym); return `<div class="alert-item" data-coin="${a.sym}">
      <div class="alert-ico ${a.severity}">${alertIcon(a.type)}</div>
      <div class="alert-body">
        <div class="alert-title">${a.message}</div>
        <div class="alert-meta">${coinLogo(c, 18)} ${c.name} · ${TYPE_LABEL[a.type]}</div>
      </div>
      <div class="alert-time">${a.time}</div>
    </div>`; };
    return `
      <div class="page-head"><h1>Alertas</h1><p>Avisos por RSI extremo, cruces de EMA y volumen anormal. Activá/desactivá tipos y ajustá umbrales en <span class="link" data-view-link="settings">Configuración</span>.</p></div>
      <div class="filter-row">${filters.map(([k, l]) => `<button class="filter-btn ${state.alertFilter === k ? "active" : ""}" data-action="filter" data-filter="${k}">${l}</button>`).join("")}</div>
      <div class="card" style="padding:0">${items.length ? items.map(row).join("") : `<p class="muted" style="padding:24px;text-align:center">${all.length ? "Sin alertas para este filtro." : "No hay alertas activas con tu configuración y umbrales actuales."}</p>`}</div>`;
  }

  /* =====================================================================
     PANTALLA · NOTICIAS
     ===================================================================== */
  function impactDots(level) {
    const n = level === "alto" ? 3 : level === "medio" ? 2 : 1;
    return `Impacto <span class="impact-dots">${[0, 1, 2].map((i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</span>`;
  }
  function renderNews() {
    const count = (s) => DATA.news.filter((n) => n.sentiment === s).length;
    const card = (n) => { const c = n.sym ? coinBy(n.sym) : null; return `<div class="card news-card" ${c ? `data-coin="${c.symbol}"` : ""}>
      <div class="news-top"><span class="news-source">${n.source}</span><span class="faint" style="font-size:12px">${n.time}</span></div>
      <div class="news-title">${n.title}</div>
      <div class="news-foot">${sentBadge(n.sentiment)}<span class="impact">${impactDots(n.impact)}</span></div>
      ${c ? `<div style="margin-top:4px">${chip(coinLogo(c, 18) + " " + c.symbol)}</div>` : ""}
    </div>`; };
    return `
      <div class="page-head"><h1>Noticias</h1><p>Titulares con clasificación de sentimiento e impacto estimado sobre el mercado.</p></div>
      <div class="filter-row">
        <span class="chip"><span class="pip" style="background:var(--green)"></span> ${count("positivo")} positivas</span>
        <span class="chip"><span class="pip" style="background:var(--text-faint)"></span> ${count("neutral")} neutrales</span>
        <span class="chip"><span class="pip" style="background:var(--red)"></span> ${count("negativo")} negativas</span>
      </div>
      <div class="news-grid">${DATA.news.map(card).join("")}</div>`;
  }
  const chip = (inner) => `<span class="chip">${inner}</span>`;

  /* =====================================================================
     PANTALLA · CONFIGURACIÓN
     ===================================================================== */
  const ALERT_PREFS = [
    { key: "rsi", label: "RSI extremo", desc: "Avisar cuando el RSI cruce sobreventa (< 30) o sobrecompra (> 70)." },
    { key: "ema", label: "Cruces de EMA", desc: "Golden cross / death cross (EMA 50 vs EMA 200)." },
    { key: "vol", label: "Volumen anormal", desc: "Volumen por encima del múltiplo configurado de la media." },
    { key: "signal", label: "Cambios de señal", desc: "Cuando la señal IA cambia (p. ej. Neutral → Compra)." },
  ];
  function renderSettings() {
    const sw = (key, on) => `<label class="switch"><input type="checkbox" data-action="pref" data-key="${key}" ${on ? "checked" : ""}><span class="slider"></span></label>`;
    const favChips = DATA.coins.map((c) => `<span class="chip fav-chip ${state.fav.includes(c.symbol) ? "on" : ""}" data-action="fav" data-sym="${c.symbol}">${coinLogo(c, 18)} ${c.symbol}</span>`).join("");
    const num = (key, val) => `<input class="num-input" type="number" step="0.1" value="${val}" data-action="thresh" data-key="${key}">`;
    return `
      <div class="page-head"><h1>Configuración</h1><p>Preferencias locales del prototipo. En producción se guardan en la tabla <span class="mono">settings</span>.</p></div>
      <div class="grid cols-2">
        <div class="card">
          <div class="section-head"><h2>Monedas favoritas</h2><span class="faint" style="font-size:12px">${state.fav.length} activas</span></div>
          <p class="muted" style="font-size:13px;margin:0 0 14px">Selecciona los activos que quieres priorizar en el dashboard.</p>
          <div class="fav-grid">${favChips}</div>
        </div>

        <div class="card">
          <div class="section-head"><h2>Apariencia</h2></div>
          <div class="set-row"><div class="set-text"><strong>Tema oscuro</strong><small>Cambia entre el tema oscuro y claro.</small></div>
            <label class="switch"><input type="checkbox" data-action="theme" ${state.theme === "dark" ? "checked" : ""}><span class="slider"></span></label></div>
          <div class="set-row"><div class="set-text"><strong>Densidad de datos</strong><small>Prioriza legibilidad y números (recomendado).</small></div><span class="chip">Cómoda</span></div>
        </div>

        <div class="card span-2">
          <div class="section-head"><h2>Alertas</h2><span class="faint" style="font-size:12px">qué eventos te notifican</span></div>
          ${ALERT_PREFS.map((p) => `<div class="set-row"><div class="set-text"><strong>${p.label}</strong><small>${p.desc}</small></div>${sw(p.key, state.prefs[p.key])}</div>`).join("")}
          <div class="set-row"><div class="set-text"><strong>Umbrales</strong><small>Valores que disparan las alertas de RSI y volumen.</small></div>
            <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
              <label class="faint" style="font-size:12px">RSI bajo ${num("rsiLow", state.thresholds.rsiLow)}</label>
              <label class="faint" style="font-size:12px">RSI alto ${num("rsiHigh", state.thresholds.rsiHigh)}</label>
              <label class="faint" style="font-size:12px">Vol × ${num("volMult", state.thresholds.volMult)}</label>
            </div>
          </div>
        </div>
      </div>`;
  }

  /* =====================================================================
     PANTALLA · RENDIMIENTO DEL MOTOR
     ===================================================================== */
  /* ---------- Mini-gráficos SVG (reusan el estilo actual) ---------- */
  function miniLine(vals) {
    if (!vals || vals.length < 2) return `<div class="chart-empty">Necesita más datos evaluados</div>`;
    const w = 300, h = 90;
    const pts = vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(h - 3 - (v / 100) * (h - 8)).toFixed(1)}`).join(" ");
    const y50 = (h - 3 - 0.5 * (h - 8)).toFixed(1);
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="evo-svg">
      <line x1="0" y1="${y50}" x2="${w}" y2="${y50}" stroke="var(--border)" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>
      <polyline points="${pts}" fill="none" stroke="var(--primary)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    </svg>`;
  }
  function miniBars(vals) {
    if (!vals || !vals.length) return `<div class="chart-empty">Necesita más datos</div>`;
    const w = 300, h = 90, max = Math.max.apply(null, vals.concat(1)), bw = w / vals.length;
    const bars = vals.map((v, i) => { const bh = (v / max) * (h - 8); return `<rect x="${(i * bw + 1).toFixed(1)}" y="${(h - bh - 1).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="var(--primary)"/>`; }).join("");
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="evo-svg">${bars}</svg>`;
  }
  function distBar(d) {
    const total = (d.compra + d.neutral + d.venta) || 1;
    const seg = (v, c) => (v ? `<span style="width:${(v / total * 100).toFixed(1)}%;background:${c}"></span>` : "");
    return `<div class="distbar">${seg(d.compra, "var(--green)")}${seg(d.neutral, "var(--text-faint)")}${seg(d.venta, "var(--red)")}</div>
      <div class="distlegend"><span><i style="background:var(--green)"></i>Compra ${d.compra}</span><span><i style="background:var(--text-faint)"></i>Neutral ${d.neutral}</span><span><i style="background:var(--red)"></i>Venta ${d.venta}</span></div>`;
  }

  /* ---------- Modal de trazabilidad de una señal histórica ---------- */
  function recordModalHTML(r) {
    const c = coinBy(r.symbol);
    const fecha = new Date(r.ts).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const ev = (e, lbl) => `<div class="metric"><div class="m-label">${lbl}</div><div class="m-val ${e ? (e.ret >= 0 ? "pos" : "neg") : "muted"}" style="font-size:15px">${e ? (e.ret >= 0 ? "+" : "") + e.ret.toFixed(2) + "%" : "pendiente"}</div></div>`;
    return `<div class="modal-backdrop">
      <div class="modal-card">
        <span class="modal-close" title="Cerrar">✕</span>
        <div class="coin" style="margin-bottom:4px">${coinLogo(c)}<span><span class="coin-name">${r.name || r.symbol}</span> <span class="coin-sym">${r.symbol}</span></span></div>
        <div class="faint" style="font-size:12px;margin-bottom:12px">${fecha} · registro: ${r.trigger || "—"}</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:12px">${signalBadge(r.signal)}${riskBadge(r.risk)}<span class="muted" style="font-size:13px">Score <strong class="${r.score >= 0 ? "pos" : "neg"}">${fmtScore(r.score)}</strong></span><span class="muted" style="font-size:13px">Confianza <strong style="color:var(--text)">${r.confidence}%</strong></span><span class="muted" style="font-size:13px">Precio <strong class="mono">${money(r.price)}</strong></span></div>
        <div class="analysis-metrics" style="margin-bottom:14px">${ev(r.evals.d1, "Resultado 1d")}${ev(r.evals.d7, "Resultado 7d")}${ev(r.evals.d30, "Resultado 30d")}</div>
        <div class="section-sub">Indicadores al generar la señal</div>
        ${indChips(r)}
        <div class="section-sub">Desglose del score (peso × indicador)</div>
        ${r.factors && r.factors.length ? factorTable(r.factors, r.score) : `<p class="faint" style="font-size:12px">Trazabilidad detallada no disponible (señal registrada antes de esta versión).</p>`}
        ${r.reasons && r.reasons.length ? `<div class="section-sub">Motivos</div>${reasonsList(r.reasons, 4)}` : ""}
        <div style="margin-top:14px"><span class="link" data-coin="${r.symbol}">Ver perfil actual de ${r.symbol} →</span></div>
      </div>
    </div>`;
  }
  function openRecordModal(id) {
    const r = window.NexusHistory && window.NexusHistory.getById(id);
    if (!r) return;
    let host = document.getElementById("nexusModal");
    if (!host) { host = document.createElement("div"); host.id = "nexusModal"; document.body.appendChild(host); }
    host.innerHTML = recordModalHTML(r);
  }
  function closeModal() { const host = document.getElementById("nexusModal"); if (host) host.innerHTML = ""; }

  function renderPerformance() {
    const H = window.NexusHistory;
    const records = H ? H.getAll() : [];
    const head = `<div class="page-head"><h1>Rendimiento del Motor</h1><p>Estadísticas, historial auditable y observaciones del motor. Todo se mide con precios reales; no ajusta pesos ni el scoring.</p></div>`;
    if (!H || !records.length) {
      return head + `<div class="card"><p class="muted" style="margin:0;line-height:1.6">Aún no hay señales registradas. Se registran automáticamente cuando un activo <strong>genera o cambia</strong> de señal, o cuando su score salta ≥ 20 puntos. Dejá la app abierta unos días y las estadísticas se completarán solas.</p></div>`;
    }

    const h = state.perfHorizon || "d7";
    const s = H.stats(h), sm = H.summary(), evo = H.evolution(), ins = H.insights();
    const pct = (v) => (v == null ? "—" : Math.round(v) + "%");
    const ret = (v) => `<span class="${v >= 0 ? "pos" : "neg"}">${v >= 0 ? "+" : ""}${v.toFixed(2)}%</span>`;
    const sret = (v) => (v == null ? "—" : `<span class="${v >= 0 ? "pos" : "neg"}">${v >= 0 ? "+" : ""}${v.toFixed(2)}%</span>`);
    const hbtn = (k, l) => `<button class="filter-btn ${h === k ? "active" : ""}" data-action="perf" data-h="${k}">${l}</button>`;
    const card = (label, value, sub) => `<div class="card stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div>${sub ? `<div class="stat-sub faint">${sub}</div>` : ""}</div>`;

    const stats4 = `<div class="grid cols-4">
      ${card("Señales totales", sm.total)}
      ${card("Compras", `<span class="pos">${sm.compras}</span>`)}
      ${card("Ventas", `<span class="neg">${sm.ventas}</span>`)}
      ${card("Neutrales", `<span class="muted">${sm.neutrales}</span>`)}
      ${card("Aciertos 1d", pct(sm.hit1))}
      ${card("Aciertos 7d", pct(sm.hit7))}
      ${card("Aciertos 30d", pct(sm.hit30))}
      ${card("Retorno prom.", sret(sm.avgRet), "por señal (7d)")}
      ${card("Mejor activo", sm.bestAsset ? sm.bestAsset.symbol : "—", sm.bestAsset ? `${sm.bestAsset.ret >= 0 ? "+" : ""}${sm.bestAsset.ret.toFixed(1)}% (7d)` : "")}
      ${card("Peor activo", sm.worstAsset ? sm.worstAsset.symbol : "—", sm.worstAsset ? `${sm.worstAsset.ret >= 0 ? "+" : ""}${sm.worstAsset.ret.toFixed(1)}% (7d)` : "")}
    </div>`;

    const evoCards = `<div class="grid cols-3" style="margin-top:16px">
      <div class="card"><div class="section-head"><h2>Acierto acumulado</h2><span class="faint" style="font-size:12px">7d</span></div>${miniLine(evo.cumAccuracy.map((p) => p.acc))}</div>
      <div class="card"><div class="section-head"><h2>Señales por semana</h2></div>${miniBars(evo.perWeek)}</div>
      <div class="card"><div class="section-head"><h2>Distribución</h2></div>${distBar(evo.distribution)}</div>
    </div>`;

    const obs = `<div class="card" style="margin-top:16px"><div class="section-head"><h2>Observaciones del motor</h2><span class="faint" style="font-size:12px">insights automáticos</span></div>
      <ul class="reasons">${ins.lines.map((l) => `<li><span class="r-pip r-neu"></span><span>${l}</span></li>`).join("")}</ul></div>`;

    const grpRows = (g, isSignal) => Object.keys(g).sort((a, b) => g[b].n - g[a].n).map((key) => {
      const o = g[key]; const hit = o.dir ? (o.hit / o.dir) * 100 : null;
      const label = isSignal ? signalBadge(key, true) : `<span data-coin="${key}" style="cursor:pointer">${key}</span>`;
      return `<tr><td>${label}</td><td>${o.n}</td><td>${pct(hit)}</td><td>${ret(o.ret / o.n)}</td></tr>`;
    }).join("");
    const tables = `<div class="grid cols-2" style="margin-top:16px">
      <div class="card"><div class="section-head"><h2>Por activo</h2><span class="faint" style="font-size:12px">${{ d1: "1d", d7: "7d", d30: "30d" }[h]}</span></div><table class="ftable"><thead><tr><th>Activo</th><th>Señales</th><th>Aciertos</th><th>Ret. prom.</th></tr></thead><tbody>${grpRows(s.byAsset, false)}</tbody></table></div>
      <div class="card"><div class="section-head"><h2>Por tipo de señal</h2></div><table class="ftable"><thead><tr><th>Tipo</th><th>Señales</th><th>Aciertos</th><th>Ret. prom.</th></tr></thead><tbody>${grpRows(s.bySignal, true)}</tbody></table></div>
    </div>`;

    const TRIG = { inicial: "inicio", "señal": "cambio", "convicción": "convicción" };
    const evalCell = (e) => (e ? ret(e.ret) : `<span class="faint">—</span>`);
    const estado = (r) => (r.evals.d1 || r.evals.d7 || r.evals.d30) ? `<span class="badge sent-positivo" style="font-size:10.5px">Evaluado</span>` : `<span class="badge sent-neutral" style="font-size:10.5px">Pendiente</span>`;
    const logRows = [...records].sort((a, b) => b.ts - a.ts).map((r) => `<tr data-record="${r.id}" title="Ver trazabilidad">
      <td>${new Date(r.ts).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" })}</td>
      <td>${r.symbol} <span class="faint" style="font-size:10px">${TRIG[r.trigger] || ""}</span></td>
      <td class="mono">${money(r.price)}</td>
      <td class="mono">${fmtScore(r.score)}</td>
      <td>${signalBadge(r.signal, true)}</td>
      <td>${riskBadge(r.risk)}</td>
      <td class="mono">${r.confidence != null ? r.confidence + "%" : "—"}</td>
      <td>${evalCell(r.evals.d1)}</td>
      <td>${evalCell(r.evals.d7)}</td>
      <td>${evalCell(r.evals.d30)}</td>
      <td>${estado(r)}</td>
    </tr>`).join("");

    return head + `
      <div class="filter-row">${hbtn("d1", "1 día")}${hbtn("d7", "7 días")}${hbtn("d30", "30 días")}<span class="faint" style="align-self:center;font-size:12px;margin-left:6px">horizonte para comparativas</span></div>
      <div class="section-head"><h2>Centro de estadísticas</h2></div>
      ${stats4}
      <div class="section-head" style="margin-top:26px"><h2>Evolución</h2></div>
      ${evoCards}
      ${obs}
      ${tables}
      <div class="section-head" style="margin-top:26px"><h2>Historial completo</h2><span class="faint" style="font-size:12px">${records.length} señales · clic en una fila para su trazabilidad</span></div>
      <div class="table-wrap"><table class="ftable" style="min-width:780px"><thead><tr><th>Fecha</th><th>Activo</th><th>Precio</th><th>Score</th><th>Señal</th><th>Riesgo</th><th>Conf.</th><th>1d</th><th>7d</th><th>30d</th><th>Estado</th></tr></thead><tbody>${logRows}</tbody></table></div>
      <div class="filter-row" style="margin-top:18px">
        <button class="filter-btn" data-action="hist-export">Exportar respaldo (JSON)</button>
        <label class="filter-btn" style="cursor:pointer">Importar JSON<input type="file" accept="application/json" data-action="hist-import" style="display:none"></label>
        <button class="filter-btn" data-action="hist-clear">Borrar historial</button>
      </div>
      <p class="faint" style="font-size:12px;margin-top:10px;line-height:1.5">Guardado en este navegador (localStorage). Exportá un respaldo para no perderlo.${H.available ? "" : " ⚠ localStorage no disponible: el historial no persistirá al cerrar."}</p>`;
  }

  function downloadJSON(text, filename) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  /* =====================================================================
     PANTALLA · ESTADO DEL SISTEMA
     ===================================================================== */
  function ago(ts) {
    if (!ts) return "—";
    const m = Math.round((Date.now() - ts) / 60000);
    return m < 1 ? "recién" : m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`;
  }
  function renderSystem() {
    const st = (window.DataService && window.DataService.status) ? window.DataService.status() : {};
    const H = window.NexusHistory;
    const recs = H ? H.getAll() : [];
    const sm = H ? H.summary() : { total: 0, compras: 0, ventas: 0, neutrales: 0, hit1: null, hit7: null, hit30: null, avgRet: null, bestAsset: null, worstAsset: null };
    const evaluadas = recs.filter((r) => r.evals.d1 || r.evals.d7 || r.evals.d30).length;
    const pendientes = recs.length - evaluadas;
    let bytes = 0; try { bytes = (localStorage.getItem("nexus.history.v1") || "").length; } catch (e) {}
    const sizeTxt = bytes >= 1024 ? (bytes / 1024).toFixed(1) + " KB" : bytes + " B";
    const first = recs.length ? new Date(Math.min.apply(null, recs.map((r) => r.ts))).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
    const host = location.hostname;
    const onPages = /github\.io$/i.test(host);
    const isLocal = host === "localhost" || host === "127.0.0.1" || location.protocol === "file:";

    const pill = (s, txt) => `<span class="badge ${s === "ok" ? "sent-positivo" : s === "bad" ? "sent-negativo" : "sent-neutral"}">${txt}</span>`;
    const cgState = st.coingecko === true ? "ok" : st.coingecko === false ? "bad" : "neu";
    const fngState = st.fng === true ? "ok" : st.fng === false ? "bad" : "neu";
    const engState = (st.engineSignals || 0) > 0 ? "ok" : "neu";
    const health = (st.source === "live" && st.coingecko) ? ["ok", "Operativo"] : st.source === "cache" ? ["neu", "Datos en caché"] : st.source === "fallback" ? ["bad", "Sin conexión (demo)"] : ["neu", "Inicializando…"];

    const pct = (v) => (v == null ? "—" : Math.round(v) + "%");
    const card = (label, value, sub) => `<div class="card stat-card"><div class="stat-label">${label}</div><div class="stat-value" style="font-size:20px">${value}</div>${sub ? `<div class="stat-sub faint">${sub}</div>` : ""}</div>`;
    const srow = (label, s, txt, sub) => `<div class="set-row"><div class="set-text"><strong>${label}</strong>${sub ? `<small>${sub}</small>` : ""}</div>${pill(s, txt)}</div>`;
    const TRIG = { inicial: "inicio", "señal": "cambio", "convicción": "convicción" };
    const ret = (e) => e ? `<span class="${e.ret >= 0 ? "pos" : "neg"}">${e.ret >= 0 ? "+" : ""}${e.ret.toFixed(2)}%</span>` : `<span class="faint">—</span>`;
    const logRows = [...recs].sort((a, b) => b.ts - a.ts).slice(0, 10).map((r) => `<tr data-record="${r.id}" title="Ver trazabilidad">
      <td>${new Date(r.ts).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" })}</td>
      <td>${r.symbol} <span class="faint" style="font-size:10px">${TRIG[r.trigger] || ""}</span></td>
      <td>${signalBadge(r.signal, true)}</td>
      <td class="mono">${fmtScore(r.score)}</td>
      <td>${ret(r.evals.d1)}</td>
      <td>${ret(r.evals.d7)}</td>
      <td>${ret(r.evals.d30)}</td>
    </tr>`).join("");

    return `
      <div class="page-head"><h1>Estado del Sistema</h1><p>Visibilidad completa del motor, las fuentes de datos y el historial — sin abrir DevTools.</p></div>

      <div class="grid cols-2">
        <div class="card"><div class="section-head"><h2>Salud general</h2></div>
          <div style="font-size:18px;font-weight:700">${pill(health[0], health[1])}</div>
          <p class="faint" style="font-size:12px;margin:10px 0 0;line-height:1.5">Última actualización de datos: <strong style="color:var(--text)">${ago(st.lastUpdate)}</strong>${st.error ? `<br>Último error: ${st.error}` : ""}</p>
        </div>
        <div class="card"><div class="section-head"><h2>Estado de servicios</h2></div>
          ${srow("CoinGecko", cgState, cgState === "ok" ? "Operativo" : cgState === "bad" ? "Caído" : "En caché", "Precios, mercado e históricos")}
          ${srow("Fear &amp; Greed", fngState, fngState === "ok" ? "Operativo" : fngState === "bad" ? "Caído" : "En caché", "Alternative.me")}
          ${srow("Motor de análisis", engState, engState === "ok" ? `Activo · ${st.engineSignals} señales` : "Sin señales", "RSI / MACD / EMA → score")}
          ${srow("GitHub Pages", onPages ? "ok" : "neu", onPages ? "Publicado" : isLocal ? "Local" : host, onPages ? host : "origen actual")}
        </div>
      </div>

      <div class="section-head" style="margin-top:26px"><h2>Centro de estadísticas</h2></div>
      <div class="grid cols-4">
        ${card("Total señales", recs.length)}
        ${card("Pendientes", `<span class="muted">${pendientes}</span>`)}
        ${card("Evaluadas", `<span class="pos">${evaluadas}</span>`)}
        ${card("Tamaño historial", sizeTxt)}
        ${card("Acierto 1d", pct(sm.hit1))}
        ${card("Acierto 7d", pct(sm.hit7))}
        ${card("Acierto 30d", pct(sm.hit30))}
        ${card("Retorno prom.", sm.avgRet == null ? "—" : `<span class="${sm.avgRet >= 0 ? "pos" : "neg"}">${sm.avgRet >= 0 ? "+" : ""}${sm.avgRet.toFixed(2)}%</span>`, "por señal (7d)")}
        ${card("Mejor activo", sm.bestAsset ? sm.bestAsset.symbol : "—", sm.bestAsset ? `${sm.bestAsset.ret >= 0 ? "+" : ""}${sm.bestAsset.ret.toFixed(1)}% (7d)` : "")}
        ${card("Peor activo", sm.worstAsset ? sm.worstAsset.symbol : "—", sm.worstAsset ? `${sm.worstAsset.ret >= 0 ? "+" : ""}${sm.worstAsset.ret.toFixed(1)}% (7d)` : "")}
        ${card("Primera señal", first)}
        ${card("Persistencia", H && H.available ? "OK" : "—", "localStorage")}
      </div>

      <div class="section-head" style="margin-top:26px"><h2>Últimas señales</h2><span class="link" data-view-link="performance">Ver historial completo →</span></div>
      <div class="table-wrap"><table class="ftable" style="min-width:560px"><thead><tr><th>Fecha</th><th>Activo</th><th>Señal</th><th>Score</th><th>1d</th><th>7d</th><th>30d</th></tr></thead><tbody>${logRows || `<tr><td colspan="7" class="faint" style="padding:18px;text-align:center">Aún no hay señales registradas.</td></tr>`}</tbody></table></div>

      <div class="filter-row" style="margin-top:18px">
        <button class="filter-btn" data-action="recalc">↻ Recalcular estadísticas</button>
        <button class="filter-btn" data-action="hist-export">Exportar historial</button>
        <label class="filter-btn" style="cursor:pointer">Importar historial<input type="file" accept="application/json" data-action="hist-import" style="display:none"></label>
        <button class="filter-btn" data-action="backup">Descargar respaldo completo</button>
      </div>
      <p class="faint" style="font-size:12px;margin-top:10px;line-height:1.5">El respaldo completo incluye historial + ajustes. Importar fusiona sin duplicar. Todo se guarda en este navegador (localStorage).</p>`;
  }

  /* =====================================================================
     ROUTER + EVENTOS
     ===================================================================== */
  const VIEWS = {
    dashboard: renderDashboard, market: renderMarket, watchlist: renderWatchlist, analysis: renderAnalysis,
    profile: () => renderProfile(state.coin), alerts: renderAlerts, news: renderNews,
    performance: renderPerformance, system: renderSystem, settings: renderSettings,
  };

  function setView(view, coinSym) {
    if (!VIEWS[view]) view = "dashboard";
    closeModal(); // cerrar el modal de trazabilidad al navegar
    state.view = view;
    if (coinSym) state.coin = coinSym;
    $$(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.view === view));
    $("#view").innerHTML = VIEWS[view]();
    window.scrollTo(0, 0);
    closeSidebar();
    if (location.hash.slice(1) !== view) history.replaceState(null, "", "#" + view);
  }
  function rerender() { $("#view").innerHTML = VIEWS[state.view](); }

  function handleAction(el) {
    const a = el.dataset.action;
    if (a === "sort") {
      const k = el.dataset.key;
      state.sort = { key: k, dir: state.sort.key === k && state.sort.dir === "desc" ? "asc" : "desc" };
      rerender();
    } else if (a === "tf") {
      state.tf = el.dataset.tf;
      const c = coinBy(state.coin), s = c.series[state.tf];
      $("#chartHost").innerHTML = areaChart(s, s[s.length - 1] >= s[0], c.support, c.resistance);
      $$(".tf-btn").forEach((b) => b.classList.toggle("active", b.dataset.tf === state.tf));
    } else if (a === "filter") {
      state.alertFilter = el.dataset.filter;
      rerender();
    } else if (a === "fav") {
      const sym = el.dataset.sym, i = state.fav.indexOf(sym);
      if (i > -1) state.fav.splice(i, 1); else state.fav.push(sym);
      saveSettings(); rerender();
    } else if (a === "theme") {
      setTheme(el.checked ? "dark" : "light");
    } else if (a === "pref") {
      state.prefs[el.dataset.key] = el.checked; saveSettings();
      updateAlertBadge(); if (state.view === "alerts") rerender();
    } else if (a === "thresh") {
      state.thresholds[el.dataset.key] = parseFloat(el.value) || 0; saveSettings();
      updateAlertBadge(); if (state.view === "alerts") rerender();
    } else if (a === "perf") {
      state.perfHorizon = el.dataset.h; rerender();
    } else if (a === "recalc") {
      refresh(true).then(() => rerender());
    } else if (a === "hist-export") {
      downloadJSON(window.NexusHistory.exportJSON(), "nexus-historial.json");
    } else if (a === "backup") {
      let settings = null; try { settings = JSON.parse(localStorage.getItem("nexus.settings") || "null"); } catch (e) {}
      downloadJSON(JSON.stringify({ v: 1, exportedAt: Date.now(), history: window.NexusHistory.getAll(), settings }, null, 2), "nexus-respaldo.json");
    } else if (a === "hist-clear") {
      if (window.confirm("¿Borrar todo el historial de señales? Esta acción no se puede deshacer.")) {
        window.NexusHistory.clear(); rerender();
      }
    }
  }

  function setTheme(t) {
    state.theme = t;
    document.documentElement.dataset.theme = t;
    saveSettings();
    if (state.view === "settings") rerender();
  }

  /* Sidebar móvil */
  function openSidebar() { $("#sidebar").classList.add("open"); $("#scrim").hidden = false; }
  function closeSidebar() { $("#sidebar").classList.remove("open"); $("#scrim").hidden = true; }

  function doSearch(q) {
    q = (q || "").trim().toLowerCase(); if (!q) return;
    const c = DATA.coins.find((x) => x.symbol.toLowerCase() === q)
      || DATA.coins.find((x) => x.symbol.toLowerCase().startsWith(q) || x.name.toLowerCase().includes(q));
    if (c) { setView("profile", c.symbol); $("#globalSearch").blur(); }
  }

  function onClick(e) {
    if (e.target.classList && (e.target.classList.contains("modal-backdrop") || e.target.closest(".modal-close"))) { closeModal(); return; }
    const nav = e.target.closest(".nav-item");
    if (nav) { e.preventDefault(); setView(nav.dataset.view); return; }
    const link = e.target.closest("[data-view-link]");
    if (link) { setView(link.dataset.viewLink); return; }
    const act = e.target.closest("[data-action]");
    const changeDriven = act && ["theme", "pref", "thresh", "hist-import"].indexOf(act.dataset.action) > -1;
    if (act && !changeDriven) { handleAction(act); return; }
    const recEl = e.target.closest("[data-record]");
    if (recEl) { openRecordModal(recEl.dataset.record); return; }
    const coinEl = e.target.closest("[data-coin]");
    if (coinEl) { setView("profile", coinEl.dataset.coin); }
  }
  function onChange(e) {
    const act = e.target.closest("[data-action]");
    if (!act) return;
    const a = act.dataset.action;
    if (a === "theme" || a === "pref" || a === "thresh") { handleAction(act); return; }
    if (a === "hist-import" && act.files && act.files[0]) {
      const reader = new FileReader();
      reader.onload = () => { window.NexusHistory.importJSON(reader.result) ? rerender() : window.alert("No se pudo importar: archivo inválido."); };
      reader.readAsText(act.files[0]);
    }
  }

  /* ---------- Estado de datos (topbar) ---------- */
  function setStatus(source) {
    const map = {
      connecting: ["Conectando…", "var(--amber)"],
      live: ["En vivo", "var(--green)"],
      cache: ["Caché", "var(--amber)"],
      fallback: ["Sin conexión · demo", "var(--red)"],
    };
    const [txt, col] = map[source] || ["—", "var(--text-faint)"];
    const s = $("#dataStatus"), d = $("#dataDot");
    if (s) s.textContent = txt;
    if (d) d.style.background = col;
  }

  function applyData(res) {
    DATA = (res && res.data) || window.NEXUS_FALLBACK;
    window.NEXUS_DATA = DATA; // expone los datos vigentes (reales o fallback)
    updateAlertBadge(); // contador según tipos/umbrales configurados
    $("#lastUpdated").textContent = "Actualizado " + new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    setStatus(res ? res.source : "fallback");
  }

  /* ---------- Init: listeners (una sola vez) ---------- */
  function init() {
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    $("#globalSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(e.target.value); });
    $("#themeToggle").addEventListener("click", () => setTheme(state.theme === "dark" ? "light" : "dark"));
    $("#menuToggle").addEventListener("click", openSidebar);
    $("#scrim").addEventListener("click", closeSidebar);
    window.addEventListener("hashchange", () => { const v = location.hash.slice(1); if (v && v !== state.view && VIEWS[v]) setView(v); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
    setView(location.hash.slice(1) || "dashboard");
  }

  /* ---------- Refresco de datos ---------- */
  let _refreshing = false, _lastRefresh = 0;
  async function refresh(force) {
    if (_refreshing) return;
    if (!force && Date.now() - _lastRefresh < 90000) return; // throttle
    _refreshing = true;
    try {
      const res = await window.DataService.load(force);
      applyData(res);
      _lastRefresh = Date.now();
      if (state.view === "dashboard" || state.view === "market") rerender();
    } finally { _refreshing = false; }
  }

  /* ---------- Arranque async: carga datos reales y luego renderiza ---------- */
  async function boot() {
    loadSettings();
    document.documentElement.dataset.theme = state.theme;
    setStatus("connecting");
    let res = null;
    try { if (window.DataService) res = await window.DataService.load(false); }
    catch (e) { console.warn("[NEXUS] boot:", e); }
    applyData(res); // si res es null → usa NEXUS_FALLBACK
    _lastRefresh = Date.now();
    init();
    setInterval(() => { if (!document.hidden) refresh(true); }, 120000); // refresco suave 2 min
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
