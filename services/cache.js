/* =====================================================================
   NEXUS AI — Caché centralizada (localStorage + TTL + expiración)
   Punto único para guardar/leer datos con tiempo de vida. Pensado para
   crecer: snapshots de mercado, históricos, preferencias, etc.

   API:
     NexusCache.set(key, value)        guarda con marca de tiempo
     NexusCache.get(key, ttlMs)        devuelve el valor si no expiró, si no null
                                       (ttl = Infinity → ignora expiración)
     NexusCache.age(key)               edad del registro en ms (Infinity si no existe)
     NexusCache.remove(key)            borra una clave
     NexusCache.clear(prefix?)         borra todas las claves nexus.<prefix>*
   ===================================================================== */
window.NexusCache = (function () {
  "use strict";
  const PREFIX = "nexus.";

  // ¿Hay localStorage utilizable? (algunos navegadores lo restringen en file://)
  const ok = (function () {
    try { const k = "__nexus_test__"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; }
    catch (e) { return false; }
  })();

  // Respaldo en memoria si localStorage no está disponible.
  const mem = {};
  const key = (k) => (k.indexOf(PREFIX) === 0 ? k : PREFIX + k);

  function readRecord(k) {
    if (ok) {
      try { const raw = localStorage.getItem(k); if (raw) return JSON.parse(raw); }
      catch (e) { /* json corrupto: ignorar */ }
    }
    return mem[k] || null;
  }

  function set(k, value) {
    const full = key(k);
    const rec = { t: Date.now(), v: value };
    if (ok) {
      try { localStorage.setItem(full, JSON.stringify(rec)); return true; }
      catch (e) { /* cuota llena u otro: caer a memoria */ }
    }
    mem[full] = rec;
    return false;
  }

  function get(k, ttl) {
    const rec = readRecord(key(k));
    if (!rec) return null;
    if (ttl != null && ttl !== Infinity && (Date.now() - rec.t) >= ttl) return null;
    return rec.v;
  }

  function age(k) {
    const rec = readRecord(key(k));
    return rec ? (Date.now() - rec.t) : Infinity;
  }

  function remove(k) {
    const full = key(k);
    if (ok) { try { localStorage.removeItem(full); } catch (e) {} }
    delete mem[full];
  }

  function clear(prefix) {
    const full = PREFIX + (prefix || "");
    if (ok) {
      try { Object.keys(localStorage).filter((x) => x.indexOf(full) === 0).forEach((x) => localStorage.removeItem(x)); }
      catch (e) {}
    }
    Object.keys(mem).filter((x) => x.indexOf(full) === 0).forEach((x) => delete mem[x]);
  }

  return { set, get, age, remove, clear, available: ok };
})();
