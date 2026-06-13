# NEXUS AI

Plataforma **personal** de análisis inteligente de criptomonedas.
Análisis de calidad y señales razonables sobre datos reales — **no** predice el futuro.

---

## ▶️ Cómo abrir el prototipo

Es autocontenido (sin servidor ni `npm`): abre el archivo en el navegador.

- **Doble clic:** `NEXUSAI\index.html`
- **PowerShell:**
  ```powershell
  Start-Process "c:\Users\cunio\Documents\GitHub\NEXUSAI\index.html"
  ```

---

## 📁 Archivos

| Archivo | Qué es |
|---------|--------|
| `index.html` | Estructura (sidebar + topbar + contenedor de vistas). |
| `styles.css` | Sistema de diseño: tema oscuro/claro y todos los componentes. |
| `data.js` | Datos de ejemplo (12 cripto, indicadores, señales, noticias, alertas). |
| `app.js` | Router + render de las 7 pantallas + gráficos SVG + tema. |
| `ARQUITECTURA.md` | **Diseño completo**: stack, motor de análisis, BD, API, jobs y plan por fases. |

Las 7 pantallas: **Dashboard · Mercado · Análisis IA · Perfil de moneda · Alertas · Noticias · Configuración**.

---

## ✅ Estado actual

- **Fase 0 — Prototipo visual navegable: COMPLETADA.**
  Las 7 pantallas funcionan con datos de ejemplo, navegación real, búsqueda,
  tema oscuro/claro y diseño responsive.

## ⏭️ Cómo seguir avanzando

El plan por fases está en [`ARQUITECTURA.md`](ARQUITECTURA.md) (sección §9). Resumen:

1. **Fase 1 — Backend base:** PostgreSQL + ingesta de CoinGecko/Binance + endpoints `overview` y `assets`.
2. **Fase 2 — Motor de indicadores y señales:** RSI/MACD/EMA + scoring determinista + tabla `signals`.
3. **Fase 3 — Frontend Next.js real:** portar este prototipo a Next.js + TypeScript + Tailwind y conectar a la API.
4. **Fase 4 — Alertas** · **Fase 5 — Noticias y sentimiento** · **Fase 6 — Pulido y despliegue.**

> **Decisión clave:** el "motor de IA" **no es machine learning**, es un motor de
> *scoring ponderado, determinista y explicable* sobre indicadores técnicos.
> Ligero, barato y reproducible (cumple "evitar ML complejo").

---

## 🔁 Para retomar en una sesión nueva (tokens recargados)

Pega esto como primer mensaje para darle contexto a Claude rápidamente:

> Estoy construyendo **NEXUS AI**, una app personal de análisis de cripto.
> La carpeta del proyecto es `NEXUSAI/`. La **Fase 0 (prototipo visual)** ya está
> completa (`index.html`, `styles.css`, `data.js`, `app.js`). La arquitectura y el
> plan por fases están en `NEXUSAI/ARQUITECTURA.md`. Quiero continuar con la **Fase 1**
> (backend base: PostgreSQL + ingesta CoinGecko/Binance + endpoints). Lee primero
> `ARQUITECTURA.md` y propón el primer paso concreto.
