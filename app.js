/* =====================================================================
   NEXUS AI — Lógica de la aplicación (prototipo navegable)
   Router por hash + render de 7 pantallas + gráficos SVG + tema.
   Sin dependencias externas. Datos desde data.js (window.NEXUS_DATA).
   ===================================================================== */
(function () {
  "use strict";
  const DATA = window.NEXUS_DATA;
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- Estado ---------- */
  const state = {
    view: "dashboard",
    coin: "BTC",
    tf: "1S",
    sort: { key: "marketCap", dir: "desc" },
    alertFilter: "todas",
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
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
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
  const signalBadge = (s, sm) => `<span class="badge signal-${SIGNAL_CLASS[s]}"${sm ? ' style="font-size:11px;padding:3px 8px"' : ""}><span class="pip"></span>${SIGNAL_LABEL[s]}</span>`;
  const riskBadge = (r) => `<span class="badge risk-${r}">${cap(r)}</span>`;
  const sentBadge = (s) => `<span class="badge sent-${s}">${cap(s)}</span>`;
  const confbar = (v) => `<div class="confbar"><span style="width:${v}%"></span></div>`;
  const reasonsList = (rs, max) => `<ul class="reasons">${rs.slice(0, max || 4).map((r) => `<li><span class="r-pip r-${r.p}"></span><span>${r.t}</span></li>`).join("")}</ul>`;

  function sparkSVG(arr, up) {
    const w = 92, h = 30, min = Math.min(...arr), max = Math.max(...arr), rng = (max - min) || 1;
    const pts = arr.map((v, i) => `${(i / (arr.length - 1) * w).toFixed(1)},${(h - 2 - ((v - min) / rng) * (h - 4)).toFixed(1)}`).join(" ");
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${up ? "var(--green)" : "var(--red)"}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
  }

  function areaChart(arr, up, sup, res) {
    const W = 720, H = 260, pT = 14, pB = 16;
    const lo = Math.min(...arr, sup), hi = Math.max(...arr, res), rng = (hi - lo) || 1;
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
      ${srLine(res, "var(--red)")}${srLine(sup, "var(--green)")}
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

  /* ---------- Rankings derivados ---------- */
  function riskScore(c) {
    const base = c.risk === "alto" ? 100 : c.risk === "medio" ? 60 : 30;
    return base + Math.abs(c.change24h) * 2 + (c.signal === "venta" ? 15 : c.signal === "compra" ? -5 : 0);
  }
  function rankings() {
    const cs = DATA.coins;
    return {
      oport: cs.filter((c) => c.signal === "compra").sort((a, b) => b.confidence - a.confidence),
      riesgos: [...cs].sort((a, b) => riskScore(b) - riskScore(a)),
      momentum: [...cs].sort((a, b) => b.change7d - a.change7d),
    };
  }

  /* =====================================================================
     PANTALLA · DASHBOARD
     ===================================================================== */
  function renderDashboard() {
    const m = DATA.market, r = rankings();
    const fecha = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

    const stat = (label, value, sub) => `<div class="card stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ""}</div>`;

    const list = (items, right) => `<div class="rank-list">${items.slice(0, 5).map((c, i) => `<div class="rank-item" data-coin="${c.symbol}"><span class="rank-n">${i + 1}</span>${coinCell(c)}<span class="right">${right(c)}</span></div>`).join("")}</div>`;

    const featured = ["SOL", "BTC", "XRP"].map(coinBy);
    const tile = (c) => `<div class="signal-tile" data-coin="${c.symbol}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">${coinCell(c)}${signalBadge(c.signal, true)}</div>
      <div style="display:flex;justify-content:space-between;font-size:12px" class="muted"><span>Confianza</span><strong style="color:var(--text)">${c.confidence}%</strong></div>
      <div style="margin:7px 0 9px">${confbar(c.confidence)}</div>
      <div class="faint" style="font-size:12px;line-height:1.4">${c.reasons[0].t}</div>
    </div>`;

    return `
      <div class="page-head"><h1>Dashboard</h1><p>${cap(fecha)} · visión general del mercado y señales del motor NEXUS.</p></div>

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
      <div class="signal-strip">${featured.map(tile).join("")}</div>

      <div class="grid cols-3" style="margin-top:26px">
        <div class="card">
          <div class="section-head"><h2>Top oportunidades</h2></div>
          ${list(r.oport, (c) => signalBadge(c.signal, true))}
        </div>
        <div class="card">
          <div class="section-head"><h2>Top riesgos</h2></div>
          ${list(r.riesgos, (c) => riskBadge(c.risk))}
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
      <td>${coinCell(c)}</td>
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
     PANTALLA · ANÁLISIS IA
     ===================================================================== */
  function renderAnalysis() {
    const order = { compra: 0, neutral: 1, venta: 2 };
    const cs = [...DATA.coins].sort((a, b) => order[a.signal] - order[b.signal] || b.confidence - a.confidence);
    const card = (c) => `<div class="card analysis-card" data-coin="${c.symbol}">
      <div class="analysis-top">${coinCell(c)}${signalBadge(c.signal)}</div>
      <div class="analysis-metrics">
        <div class="metric"><div class="m-label">Confianza</div><div class="m-val">${c.confidence}%</div></div>
        <div class="metric"><div class="m-label">Riesgo</div><div class="m-val" style="font-size:14px">${riskBadge(c.risk)}</div></div>
        <div class="metric"><div class="m-label">Score</div><div class="m-val ${c.score >= 0 ? "pos" : "neg"}">${c.score >= 0 ? "+" : ""}${c.score}</div></div>
      </div>
      ${confbar(c.confidence)}
      ${reasonsList(c.reasons, 3)}
    </div>`;
    return `
      <div class="page-head"><h1>Análisis IA</h1><p>Motor determinista y explicable: combina RSI, MACD, EMA 20/50/200, volumen y tendencia. Cada señal expone sus motivos.</p></div>
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
    const z = c.rsi < 30 ? { t: "Sobreventa", cls: "pos" } : c.rsi > 70 ? { t: "Sobrecompra", cls: "neg" } : { t: "Neutral", cls: "muted" };
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
            <div style="display:flex;align-items:baseline;gap:10px"><span style="font-size:20px;font-weight:700">${c.name}</span><span class="coin-sym">${c.symbol} · #${c.rank}</span></div>
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
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">${signalBadge(c.signal)}<span class="muted" style="font-size:13px">Confianza <strong style="color:var(--text)">${c.confidence}%</strong></span></div>
          ${confbar(c.confidence)}
          <p class="muted" style="font-size:13px;line-height:1.5;margin:12px 0 10px">Señal de <strong style="color:var(--text)">${SIGNAL_LABEL[c.signal]}</strong> en temporalidad ${state.tf}, con riesgo <strong style="color:var(--text)">${cap(c.risk)}</strong>. Motivos principales:</p>
          ${reasonsList(c.reasons, 4)}
        </div>
      </div>

      <div class="grid split" style="margin-top:16px">
        <div class="card">
          <div class="section-head"><h2>Indicadores técnicos</h2><span class="faint" style="font-size:12px">temporalidad diaria</span></div>
          <div class="ind-grid">
            ${ind("RSI (14)", `${c.rsi} · <span class="${z.cls}">${z.t}</span>`)}
            ${ind("MACD (hist.)", `${c.macd.hist >= 0 ? "▲" : "▼"} ${fmtNum(c.macd.hist)}`, c.macd.hist >= 0 ? "pos" : "neg")}
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
          <div class="range-track"><span class="range-fill" style="width:${pos}%"></span><span class="range-dot" style="left:${pos}%"></span></div>
          <div class="range-legend">
            <div><span class="dotc pos"></span> Soporte <strong class="mono">${money(lo)}</strong></div>
            <div><span class="dotc neg"></span> Resistencia <strong class="mono">${money(hi)}</strong></div>
          </div>
          <p class="faint" style="font-size:12px;margin:12px 0 0;line-height:1.5">Precio a <strong class="pos">${((c.price - lo) / lo * 100).toFixed(1)}%</strong> sobre el soporte y a <strong class="neg">${((hi - c.price) / c.price * 100).toFixed(1)}%</strong> de la resistencia.</p>
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
    const items = DATA.alerts.filter(match);
    const row = (a) => { const c = coinBy(a.sym); return `<div class="alert-item" data-coin="${a.sym}">
      <div class="alert-ico ${a.severity}">${alertIcon(a.type)}</div>
      <div class="alert-body">
        <div class="alert-title">${a.message}</div>
        <div class="alert-meta">${coinLogo(c, 18)} ${c.name} · ${TYPE_LABEL[a.type]}</div>
      </div>
      <div class="alert-time">${a.time}</div>
    </div>`; };
    return `
      <div class="page-head"><h1>Alertas</h1><p>Avisos automáticos por RSI extremo, cruces de EMA, volumen anormal y cambios de señal.</p></div>
      <div class="filter-row">${filters.map(([k, l]) => `<button class="filter-btn ${state.alertFilter === k ? "active" : ""}" data-action="filter" data-filter="${k}">${l}</button>`).join("")}</div>
      <div class="card" style="padding:0">${items.length ? items.map(row).join("") : '<p class="muted" style="padding:24px;text-align:center">Sin alertas para este filtro.</p>'}</div>`;
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
     ROUTER + EVENTOS
     ===================================================================== */
  const VIEWS = {
    dashboard: renderDashboard, market: renderMarket, analysis: renderAnalysis,
    profile: () => renderProfile(state.coin), alerts: renderAlerts, news: renderNews, settings: renderSettings,
  };

  function setView(view, coinSym) {
    if (!VIEWS[view]) view = "dashboard";
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
    } else if (a === "thresh") {
      state.thresholds[el.dataset.key] = parseFloat(el.value); saveSettings();
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
    const nav = e.target.closest(".nav-item");
    if (nav) { e.preventDefault(); setView(nav.dataset.view); return; }
    const link = e.target.closest("[data-view-link]");
    if (link) { setView(link.dataset.viewLink); return; }
    const act = e.target.closest("[data-action]");
    if (act && act.dataset.action !== "theme" && act.dataset.action !== "pref" && act.dataset.action !== "thresh") { handleAction(act); return; }
    const coinEl = e.target.closest("[data-coin]");
    if (coinEl) { setView("profile", coinEl.dataset.coin); }
  }
  function onChange(e) {
    const act = e.target.closest("[data-action]");
    if (act && (act.dataset.action === "theme" || act.dataset.action === "pref" || act.dataset.action === "thresh")) handleAction(act);
  }

  /* ---------- Init ---------- */
  function init() {
    loadSettings();
    document.documentElement.dataset.theme = state.theme;
    const badge = $("#navAlertCount");
    badge.textContent = DATA.alerts.length;
    badge.dataset.zero = DATA.alerts.length === 0;
    $("#lastUpdated").textContent = "Actualizado " + new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    $("#globalSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(e.target.value); });
    $("#themeToggle").addEventListener("click", () => setTheme(state.theme === "dark" ? "light" : "dark"));
    $("#menuToggle").addEventListener("click", openSidebar);
    $("#scrim").addEventListener("click", closeSidebar);
    window.addEventListener("hashchange", () => { const v = location.hash.slice(1); if (v && v !== state.view && VIEWS[v]) setView(v); });

    setView(location.hash.slice(1) || "dashboard");
  }
  document.addEventListener("DOMContentLoaded", init);
})();
