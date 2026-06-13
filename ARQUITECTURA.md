# NEXUS AI — Arquitectura

> Plataforma **personal** de análisis inteligente de criptomonedas.
> Objetivo: tomar mejores decisiones de inversión con señales razonables basadas
> en datos reales. **No** predice el futuro, **no** es un producto comercial.

---

## 1. Principios de diseño

| Principio | Implicación concreta |
|-----------|----------------------|
| **Ligereza** | Sin ML pesado, sin GPU, sin colas de mensajes. Un proceso Node + Postgres. |
| **Economía** | Solo APIs con plan gratuito (CoinGecko + Binance público). Caché agresivo. |
| **Calidad > cantidad** | Pocas funciones, bien hechas. El motor de análisis es el corazón. |
| **Explicabilidad** | Cada señal expone *por qué*. Nada de cajas negras. |
| **Mantenibilidad** | Lógica determinista y testeable. Sin dependencias exóticas. |

La decisión más importante: **el "motor de IA" NO es machine learning**. Es un
**motor de scoring ponderado, determinista y explicable** sobre indicadores
técnicos. Opcionalmente, un LLM barato redacta la explicación en lenguaje
natural a partir de datos ya estructurados (ver §5). Esto cumple la restricción
"evitar ML complejo" y a la vez da análisis de calidad y reproducible.

---

## 2. Vista general del sistema

```
┌──────────────────────────────────────────────────────────────┐
│                        FUENTES EXTERNAS                        │
│   CoinGecko (mercado, F&G, market cap)   Binance (OHLCV velas) │
└───────────────┬───────────────────────────────┬───────────────┘
                │  (cron cada 5-15 min)          │
                ▼                                 ▼
        ┌───────────────────────────────────────────────┐
        │              WORKERS / JOBS (Node)              │
        │  1. Ingesta de precios y velas                  │
        │  2. Cálculo de indicadores (RSI, MACD, EMA...)  │
        │  3. Motor de señales (scoring) + alertas        │
        │  4. Ingesta + clasificación de noticias         │
        └───────────────────────┬───────────────────────┘
                                 │  escribe
                                 ▼
                       ┌───────────────────┐
                       │    PostgreSQL     │  ← única fuente de verdad
                       └─────────┬─────────┘
                                 │  lee (rápido, ya calculado)
                                 ▼
                       ┌───────────────────┐
                       │  API REST (Node)  │  Fastify / Express
                       └─────────┬─────────┘
                                 │  JSON
                                 ▼
                       ┌───────────────────┐
                       │  Frontend Next.js │  Tailwind + charts
                       └───────────────────┘
```

**Idea clave de costo:** el frontend **nunca** llama a CoinGecko/Binance ni
recalcula nada. Lee de Postgres datos *ya procesados* por los workers. Así las
APIs externas se consultan pocas veces (respetando los límites gratuitos) y la
interfaz es instantánea.

---

## 3. Stack tecnológico

| Capa | Tecnología | Por qué |
|------|-----------|---------|
| Frontend | **Next.js + TypeScript + Tailwind** | SSR/SSG, tipado, estilos rápidos. |
| Gráficos | **lightweight-charts** (TradingView) | ~45 kB, hecho para velas/líneas, gratis. |
| Backend | **Node.js + Fastify** | Ligero y rápido; Express es alternativa válida. |
| Base de datos | **PostgreSQL** | Relacional + `jsonb` para razones/metadatos. |
| Jobs | **node-cron** dentro del proceso backend | Sin infraestructura extra de colas. |
| Indicadores | **technicalindicators** (npm) o cálculo propio | Determinista, sin ML. |
| Hosting | Local, o VPS pequeño + Postgres gratis (Neon/Supabase) | Económico. |

> Para un proyecto **personal**, todo puede correr en un solo proceso Node
> (API + jobs) contra un Postgres gratuito gestionado. No hace falta más.

---

## 4. Modelo de datos (PostgreSQL)

```sql
-- Catálogo de activos seguidos
CREATE TABLE assets (
  id          TEXT PRIMARY KEY,          -- 'bitcoin'
  symbol      TEXT NOT NULL,             -- 'BTC'
  name        TEXT NOT NULL,
  rank        INT,
  market_cap  NUMERIC,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Velas OHLCV (Binance). Una fila por activo/intervalo/tiempo.
CREATE TABLE ohlc (
  asset_id  TEXT REFERENCES assets(id),
  interval  TEXT NOT NULL,               -- '1h','4h','1d'
  ts        TIMESTAMPTZ NOT NULL,
  open NUMERIC, high NUMERIC, low NUMERIC, close NUMERIC, volume NUMERIC,
  PRIMARY KEY (asset_id, interval, ts)
);

-- Indicadores ya calculados (evita recalcular en cada request)
CREATE TABLE indicators (
  asset_id   TEXT REFERENCES assets(id),
  interval   TEXT NOT NULL,
  ts         TIMESTAMPTZ NOT NULL,
  rsi        NUMERIC,
  macd       NUMERIC, macd_signal NUMERIC, macd_hist NUMERIC,
  ema20 NUMERIC, ema50 NUMERIC, ema200 NUMERIC,
  vol_avg20  NUMERIC,
  support    NUMERIC, resistance NUMERIC,
  PRIMARY KEY (asset_id, interval, ts)
);

-- Salida del motor: una señal vigente por activo/intervalo
CREATE TABLE signals (
  asset_id   TEXT REFERENCES assets(id),
  interval   TEXT NOT NULL,
  ts         TIMESTAMPTZ NOT NULL,
  signal     TEXT NOT NULL,              -- 'compra' | 'neutral' | 'venta'
  score      INT NOT NULL,               -- -100..100
  confidence INT NOT NULL,               -- 0..100
  risk       TEXT NOT NULL,              -- 'bajo' | 'medio' | 'alto'
  reasons    JSONB NOT NULL,             -- [{label, weight, polarity}]
  PRIMARY KEY (asset_id, interval, ts)
);

CREATE TABLE alerts (
  id         BIGSERIAL PRIMARY KEY,
  asset_id   TEXT REFERENCES assets(id),
  type       TEXT NOT NULL,              -- 'rsi_low','rsi_high','ema_cross','vol_spike','signal_change'
  message    TEXT NOT NULL,
  severity   TEXT NOT NULL,              -- 'info' | 'warning' | 'critical'
  created_at TIMESTAMPTZ DEFAULT now(),
  read       BOOLEAN DEFAULT false
);

CREATE TABLE news (
  id           BIGSERIAL PRIMARY KEY,
  source       TEXT, title TEXT NOT NULL, url TEXT,
  published_at TIMESTAMPTZ,
  sentiment    TEXT,                     -- 'positivo' | 'neutral' | 'negativo'
  impact       TEXT,                     -- 'bajo' | 'medio' | 'alto'
  asset_id     TEXT REFERENCES assets(id)
);

CREATE TABLE fear_greed (
  ts     TIMESTAMPTZ PRIMARY KEY,
  value  INT NOT NULL,                   -- 0..100
  label  TEXT NOT NULL                   -- 'Miedo extremo'...'Codicia extrema'
);

-- Preferencias (proyecto personal → una sola fila)
CREATE TABLE settings (
  id          INT PRIMARY KEY DEFAULT 1,
  favorites   TEXT[] DEFAULT '{}',
  theme       TEXT DEFAULT 'dark',
  thresholds  JSONB DEFAULT '{"rsiLow":30,"rsiHigh":70,"volSpike":2.0}'
);
```

---

## 5. Motor de análisis (el corazón)

Determinista, sin entrenamiento. Para cada activo e intervalo (por defecto `1d`):

### 5.1 Sub-scores por indicador → [-100, +100]
| Indicador | Regla (resumen) |
|-----------|-----------------|
| **RSI** | <30 alcista (+); >70 bajista (−); 45–55 neutral. |
| **MACD** | histograma > 0 y creciente → (+); cruce de señal hacia abajo → (−). |
| **EMA 20/50/200** | precio > EMA20 > EMA50 > EMA200 → alineación alcista fuerte (+). Cruce EMA50/200 (golden/death cross) pesa fuerte. |
| **Volumen** | volumen > 1.5× media20 confirmando dirección → (+/−). |
| **Tendencia** | máximos y mínimos crecientes → (+); decrecientes → (−). |
| **Soporte/Resistencia** | precio cerca de soporte → sesgo (+); cerca de resistencia → (−). |

### 5.2 Score compuesto y mapeo
```
score = Σ (sub_score_i × peso_i)        // pesos configurables, suman 1
señal  = score > +30 ? 'compra'
       : score < -30 ? 'venta'
       : 'neutral'
```

### 5.3 Confianza (0–100)
Mide **acuerdo entre indicadores**, no solo magnitud:
```
confianza = 0.6 × acuerdo_direccional + 0.4 × |score|
// acuerdo = % de indicadores que apuntan en la misma dirección que el score
```
Si los indicadores se contradicen → confianza baja aunque el score sea alto.

### 5.4 Riesgo (bajo/medio/alto)
Función de: **volatilidad** (ATR/desviación de retornos), **capitalización**
(small caps = más riesgo), y **distancia al soporte**. Independiente de la señal:
puede haber "compra de riesgo alto".

### 5.5 Explicación en lenguaje natural
Dos modos, configurables:
1. **Plantillas (por defecto, gratis):** se arma el texto a partir de `reasons[]`.
   Ej.: *"RSI saludable (54), cruce alcista EMA50/200, volumen creciente."*
2. **LLM (opcional, barato):** se envían las `reasons[]` ya calculadas a un modelo
   pequeño solo para **redactar** (no para analizar). Resultado cacheado. El
   análisis numérico nunca depende del LLM → reproducible y barato.

---

## 6. API REST

| Método | Ruta | Devuelve |
|--------|------|----------|
| GET | `/api/market/overview` | F&G, market cap total, dominancia BTC, vol 24h, resumen. |
| GET | `/api/market/assets` | Lista para la tabla de Mercado (precio, 24h, vol, señal, riesgo). |
| GET | `/api/assets/:symbol` | Perfil completo: indicadores, S/R, OHLC para el gráfico. |
| GET | `/api/assets/:symbol/analysis` | Señal, confianza, riesgo, razones, explicación. |
| GET | `/api/rankings` | `{ oportunidades[], riesgos[], momentum[] }` (top 10 c/u). |
| GET | `/api/alerts` | Alertas recientes. |
| GET | `/api/news` | Noticias con sentimiento e impacto. |
| GET/PUT | `/api/settings` | Favoritos, umbrales, tema. |

Todas leen de Postgres (rápido). Caché HTTP de 30–60 s suficiente.

---

## 7. Jobs programados (node-cron)

| Job | Frecuencia | Acción |
|-----|-----------|--------|
| **Ingesta mercado** | 5 min | CoinGecko: precios, market cap, F&G → `assets`, `fear_greed`. |
| **Ingesta velas** | 15 min | Binance klines `1h/4h/1d` → `ohlc`. |
| **Indicadores** | tras ingesta | Calcula RSI/MACD/EMA/etc → `indicators`. |
| **Señales** | tras indicadores | Motor de scoring → `signals`. Si cruza umbral → crea `alert`. |
| **Noticias** | 30 min | Feeds RSS/CryptoPanic → clasificación de sentimiento → `news`. |

Respeta límites gratuitos: pocas llamadas, en lote, con caché.

---

## 8. Frontend (mapa de pantallas → datos)

| Pantalla | Endpoint(s) | Componentes clave |
|----------|-------------|-------------------|
| **Dashboard** | `/market/overview`, `/rankings`, `/alerts` | Medidor F&G, tarjetas resumen, top oportunidades/riesgos, señales destacadas. |
| **Mercado** | `/market/assets` | Tabla ordenable con sparkline, señal IA, badge de riesgo. |
| **Análisis IA** | `/assets/:s/analysis` | Tarjetas con señal, % confianza, riesgo, motivos. |
| **Perfil de Moneda** | `/assets/:s`, `/assets/:s/analysis`, `/news` | Gráfico, indicadores, S/R, análisis IA, noticias. |
| **Alertas** | `/alerts` | Lista por tipo y severidad. |
| **Noticias** | `/news` | Tarjetas con sentimiento e impacto. |
| **Configuración** | `/settings` | Favoritos, umbrales de alerta, tema claro/oscuro. |

---

## 9. Plan por fases (para construir con tranquilidad)

> Cada fase es entregable y verificable por separado.

- **Fase 0 — Prototipo visual** ✅ *(este entregable)*
  HTML/CSS/JS autocontenido, navegable, con datos de ejemplo realistas.
  Sirve para validar diseño y UX **antes** de invertir en el backend.
- **Fase 1 — Backend base**
  Postgres + ingesta CoinGecko/Binance + endpoints `overview` y `assets`.
- **Fase 2 — Motor de indicadores y señales**
  Cálculo de RSI/MACD/EMA + scoring + tabla `signals`. Tests del motor.
- **Fase 3 — Frontend Next.js real**
  Portar el prototipo a Next.js + Tailwind y conectar a la API (reemplaza mocks).
- **Fase 4 — Alertas**
  Detección de cruces de umbral en el job de señales + pantalla de alertas viva.
- **Fase 5 — Noticias y sentimiento**
  Ingesta de feeds + clasificación (léxico o LLM barato) + pantalla de noticias.
- **Fase 6 — Pulido y despliegue**
  Caché, índices Postgres, modo LLM opcional para explicaciones, deploy económico.

---

## 10. Lo que deliberadamente NO hacemos

- ❌ Redes neuronales / modelos entrenados / predicción de precio.
- ❌ WebSockets en tiempo real (innecesario para uso personal; polling basta).
- ❌ Decenas de APIs (solo CoinGecko + Binance + un feed de noticias).
- ❌ Microservicios / colas / Kubernetes.
- ❌ Promesas de rentabilidad. Es una **herramienta de apoyo a la decisión**.
