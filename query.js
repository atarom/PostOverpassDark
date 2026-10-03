import { abortError } from "./utils.js";
export const createQueryPreparer = ({ map, storage, areaStoreKey, log }) => {
  let areaCache = {};
  try {
    const saved = JSON.parse(storage.getItem(areaStoreKey) || "{}");
    if (saved && typeof saved === "object" && !Array.isArray(saved)) areaCache = saved;
  } catch {}
  let lastNominatim = 0;
  const waitNominatim = (signal) => {
    const ms = Math.max(0, 1000 - (Date.now() - lastNominatim));
    if (!ms) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const id = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => {
        clearTimeout(id);
        reject(signal.reason || abortError("Proceso cancelado"));
      }, { once: true });
    });
  };
  const areaId = async (name, signal) => {
    const key = name.trim().toLocaleLowerCase();
    if (Number.isFinite(+areaCache[key])) {
      log("geocodeArea desde caché: " + name);
      return +areaCache[key];
    }
    log("Resolviendo geocodeArea: " + name);
    await waitNominatim(signal);
    let list;
    try {
      lastNominatim = Date.now();
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=10&q=${encodeURIComponent(name)}`, { signal });
      if (!response.ok) throw Error();
      list = await response.json();
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw Error("Respuesta inválida de Nominatim para: " + name);
    }
    const item = Array.isArray(list) && list.find((entry) => entry.osm_type === "relation");
    if (!item) throw Error("Sin relación OSM utilizable como geocodeArea: " + name);
    const id = 3600000000 + Number(item.osm_id);
    areaCache[key] = id;
    storage.setItem(areaStoreKey, JSON.stringify(areaCache));
    log("Área resuelta: " + (item.display_name || name));
    return id;
  };
  const turboDate = (spec) => {
    const match = String(spec).trim().toLowerCase().replace(/\s+/g, "").match(/^(\d+)(seconds?|minutes?|hours?|days?|weeks?|months?|years?)$/);
    if (!match) throw Error("Fecha relativa no válida: " + spec);
    const date = new Date();
    const amount = +match[1];
    const unit = match[2].replace(/s$/, "");
    const day = date.getUTCDate();
    if (unit === "month" || unit === "year") {
      date.setUTCDate(1);
      unit === "month" ? date.setUTCMonth(date.getUTCMonth() - amount) : date.setUTCFullYear(date.getUTCFullYear() - amount);
      date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
    } else {
      date.setTime(date.getTime() - amount * { second: 1e3, minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5 }[unit]);
    }
    return date.toISOString().replace(/\.\d{3}Z$/, "Z");
  };
  const stripComments = (text) => text.replace(/"(?:\\[\s\S]|[^"\\])*(?:"|\\?$)|'(?:\\[\s\S]|[^'\\])*(?:'|\\?$)|\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/g, (part) => part.startsWith("/") ? part.replace(/[^\n]/g, "") : part).replace(/^[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  const prepOverpass = async (input, signal) => {
    const vars = new Map();
    let text = input.replace(/\{\{\s*([A-Za-z_][\w-]*)\s*=\s*([^{}]+?)\s*\}\}/g, (_, key, value) => (vars.set(key, value.trim()), "")).replace(/\{\{style:[\s\S]*?\}\}/gi, "").replace(/\{\{date:([^}]+)\}\}/gi, (_, spec) => turboDate(spec)).replace(/\{\{\s*([A-Za-z_][\w-]*)\s*\}\}/g, (match, key) => vars.has(key) ? vars.get(key) : match);
    const bounds = map.getBounds();
    const center = map.getCenter();
    text = text.replaceAll("{{bbox}}", [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()].join(",")).replaceAll("{{center}}", `${center.lat},${center.lng}`).replaceAll("{{zoom}}", String(map.getZoom()));
    for (const match of [...text.matchAll(/\{\{geocodeArea:([^}]+)\}\}/gi)]) text = text.replace(match[0], `area(${await areaId(match[1].trim(), signal)})`);
    return stripComments(text);
  };
  const prepPostpass = (input) => {
    let text = input.replace(/\{\{\s*data\s*:\s*sql(?:,[^{}]*)?\}\}\s*/gi, "");
    const bounds = map.getBounds();
    const box = `ST_SetSRID(ST_MakeBox2D(ST_MakePoint(${bounds.getWest()},${bounds.getSouth()}),ST_MakePoint(${bounds.getEast()},${bounds.getNorth()})),4326)`;
    return text.replaceAll("{{bbox}}", box).trim();
  };
  return { prep: (text, signal, engine) => engine === "postpass" ? prepPostpass(text) : prepOverpass(text, signal) };
};
