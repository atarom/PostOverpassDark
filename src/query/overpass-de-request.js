const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const KEY = "postoverpassdark:overpass-api.de";
const CACHE_MS = 300000;
const MIN_INTERVAL_MS = 3000;
const BACKOFF_MS = 30000;
const MAX_CACHE_ENTRIES = 4;
const MAX_CACHE_CHARS = 2000000;
export const createOverpassRequester = (storage) => {
  const cache = new Map();
  const read = async (url, body, signal) => {
    const options = { method: "POST", body, signal, cache: "no-store" };
    if (url !== OVERPASS_URL) {
      const response = await fetch(url, options);
      return { status: response.status, statusText: response.statusText, contentType: response.headers.get("content-type") || "", text: await response.text() };
    }
    const query = body.get("data");
    const now = Date.now();
    const cached = cache.get(query);
    if (cached && now - cached.at < CACHE_MS) return { ...cached.response, cached: true };
    if (cached) cache.delete(query);
    const blockedUntil = Number(storage.getItem(KEY + ":blocked-until")) || 0;
    if (blockedUntil > now) throw Error(`Overpass: espera ${Math.ceil((blockedUntil - now) / 1000)} s tras un error HTTP 429/406.`);
    const lastRequest = Number(storage.getItem(KEY + ":last-request")) || 0;
    if (lastRequest + MIN_INTERVAL_MS > now) throw Error(`Overpass: espera ${Math.ceil((lastRequest + MIN_INTERVAL_MS - now) / 1000)} s antes de otra consulta.`);
    storage.setItem(KEY + ":last-request", String(now));
    const referrer = location.protocol === "https:" ? new URL(".", location.href).href : "about:client";
    const response = await fetch(url, { ...options, referrer, referrerPolicy: "no-referrer-when-downgrade" });
    if (response.status === 429 || response.status === 406) storage.setItem(KEY + ":blocked-until", String(Date.now() + BACKOFF_MS));
    return { status: response.status, statusText: response.statusText, contentType: response.headers.get("content-type") || "", text: await response.text() };
  };
  const remember = (url, body, response) => {
    if (url !== OVERPASS_URL || response.cached || response.text.length > MAX_CACHE_CHARS) return;
    const query = body.get("data");
    if (!query) return;
    cache.delete(query);
    cache.set(query, { at: Date.now(), response });
    if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  };
  return { read, remember };
};
