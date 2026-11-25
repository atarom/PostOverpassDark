import { QLEVER_ENDPOINT } from "../core/servers.js";
const QUERY = "PREFIX osmmeta: <https://www.openstreetmap.org/meta/>\nSELECT (MAX(?timestamp) AS ?lastUpdate) WHERE { ?osm osmmeta:timestamp ?timestamp. }";
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;
const formatDate = new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
let cached = null;
let pending = null;
export const parseQLeverTimestamp = (data) => {
  const value = data?.results?.bindings?.[0]?.lastUpdate?.value;
  if (typeof value !== "string" || !DATE_TIME.test(value)) return null;
  const time = Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value + "Z");
  return Number.isFinite(time) && time <= Date.now() ? time : null;
};
export const getQLeverTimestamp = (fetcher = fetch) => {
  if (cached !== null) return Promise.resolve(cached);
  if (pending) return pending;
  pending = Promise.resolve().then(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetcher(QLEVER_ENDPOINT, { method: "POST", headers: { Accept: "application/sparql-results+json" }, body: new URLSearchParams({ query: QUERY }), cache: "no-store", signal: controller.signal });
      if (!response.ok) return null;
      const timestamp = parseQLeverTimestamp(await response.json());
      if (timestamp !== null) cached = timestamp;
      return timestamp;
    } catch { return null; }
    finally { clearTimeout(timeout); }
  }).finally(() => { pending = null; });
  return pending;
};
export const describeQLeverTimestamp = (timestamp, now = Date.now()) => {
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes / 60) % 24;
  const rest = minutes % 60;
  const age = days ? `${days} ${days === 1 ? "día" : "días"}${hours ? ` y ${hours} h` : ""}` : hours ? `${hours} h${rest ? ` y ${rest} min` : ""}` : minutes ? `${minutes} min` : "menos de 1 minuto";
  const color = days <= 7 ? "#8ad6a3" : days <= 14 ? "#e4d27b" : days <= 30 ? "#f2ad71" : "#ed9986";
  return { text: `Última edición OSM: ${formatDate.format(timestamp)} UTC · Antigüedad: ${age}`, color };
};
