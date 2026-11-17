import { esc } from "../core/utils.js";
import { normalizeOsmType } from "../export/osm-identifiers.js";
export const OSM_TYPES = ["node", "way", "relation"];
const originalPostpass = new WeakMap();
export const originalPostpassGeoJSON = (geo) => geo && originalPostpass.get(geo) || null;
export const updateOriginalPostpassGeoJSON = (geo, raw) => { if (geo) originalPostpass.set(geo, raw); };
const postpassType = (properties) => normalizeOsmType(properties.osm_type || properties.type);
export const countOsmPairs = (elements) => {
  const count = { node: 0, way: 0, relation: 0, total: 0 };
  const seen = new Set();
  for (const [type, id] of elements) {
    if (!OSM_TYPES.includes(type) || id == null) continue;
    const key = `${type}/${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    count[type]++;
    count.total++;
  }
  return count;
};
const count = (value) => countOsmPairs(value?.nodeType ? [...value.querySelectorAll("node,way,relation")].map((element) => [element.localName, element.getAttribute("id")]) : (Array.isArray(value?.elements) ? value.elements : Array.isArray(value) ? value : []).map(({ type, id }) => [type, id]));
const countPostpass = (geo) => countOsmPairs((geo.features || []).map((feature) => {
  const properties = feature.properties || {};
  return [postpassType(properties), properties.osm_id ?? properties.id];
}));
const preferCenter = (geo) => {
  const centerIds = new Set(geo.features.filter((feature) => feature.id != null && feature.geometry?.type === "Point" && feature.properties?.geometry === "center").map((feature) => feature.id));
  const seen = new Set();
  geo.features = geo.features.filter((feature) => {
    if (!centerIds.has(feature.id)) return true;
    if (feature.geometry?.type !== "Point" || feature.properties?.geometry !== "center" || seen.has(feature.id)) return false;
    seen.add(feature.id);
    return true;
  });
  return geo;
};
const cleanText = (value) => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const ERROR_RX = /\berror\b|parse error|static error|runtime error|timeout|time-out|timed out|out of memory|rate limit|too many requests|bad request|failed|gateway|service unavailable/i;
export const readResponseJson = (text, contentType) => {
  if (!/json/i.test(contentType) && !/^\s*[\[{]/.test(text)) return null;
  try { return { value: JSON.parse(text) }; } catch { return { invalid: true }; }
};
export const responseError = (text, contentType, status, statusText, decoded = null) => {
  const raw = String(text ?? "").trim();
  const bad = status < 200 || status >= 300;
  const jsonLike = /json/i.test(contentType) || /^\s*[\[{]/.test(raw);
  const markup = /html|xml/i.test(contentType) || /^\s*</.test(raw);
  let messages = [];
  if (jsonLike) {
    try {
      const value = decoded ? decoded.value : JSON.parse(raw);
      messages = [value?.remark, value?.error, value?.message, value?.detail].filter((entry) => typeof entry === "string" && (bad || ERROR_RX.test(entry))).map(cleanText);
    } catch {}
  } else if (markup) {
    const html = /html/i.test(contentType) || /^\s*(?:<!doctype\s+html|<html\b)/i.test(raw);
    const documentValue = new DOMParser().parseFromString(raw, html ? "text/html" : "text/xml");
    if (!documentValue.querySelector("parsererror")) {
      messages = [...documentValue.querySelectorAll("remark,p,pre")].map((entry) => cleanText(entry.textContent)).filter((entry) => ERROR_RX.test(entry));
      if (bad && !messages.length) {
        const main = cleanText(documentValue.querySelector("h1,h2,title")?.textContent);
        if (main) messages.push(main);
      }
    }
  }
  if (bad && !messages.length && !jsonLike && !markup && raw) messages = [cleanText(raw)];
  messages = [...new Set(messages.map((entry) => cleanText(entry).replace(/^error\s*:\s*/i, "").replace(/^remark\s*:\s*/i, "")).filter(Boolean))];
  return !bad && !messages.length ? null : { status, title: messages[0] || cleanText(statusText) || `Error HTTP ${status}`, detail: messages.slice(1).join("\n"), raw };
};
export const errorStatusHtml = (value, fallback) => ["<strong>Error de consulta</strong>", value?.status >= 400 ? `<strong>HTTP ${esc(value.status)}</strong>` : "", `<strong>${esc(value?.title || fallback || "Error")}</strong>`, value?.detail ? esc(value.detail).replace(/\n/g, "<br>") : ""].filter(Boolean).join("<br>");
const outputFormat = (query) => {
  const source = String(query ?? "").replace(/^(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*/, "");
  const header = source.match(/^((?:\[(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\]"'])*\]\s*)+);/);
  const directives = header?.[1].match(/\[(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\]"'])*\]/g) || [];
  const format = directives.map((directive) => directive.match(/^\[\s*out\s*:\s*(xml|json|csv|custom|popup)\b/i)?.[1]).find(Boolean);
  return format?.toLowerCase() || "xml";
};
export const parseResponse = (text, contentType, engine, query, postpassTextOnly = false, decoded = null) => {
  const postpass = engine === "postpass";
  const format = postpass ? "json" : outputFormat(query);
  if (postpass && postpassTextOnly) return { geo: null, cnt: null, raw: text, textOnly: true, format: "raw" };
  if (!postpass && ["csv", "custom", "popup"].includes(format)) return { geo: null, cnt: null, raw: text, textOnly: true, format };
  if (postpass || /json/i.test(contentType) || /^\s*[\[{]/.test(text)) {
    let value;
    try {
      if (decoded?.invalid) throw Error("JSON inválido");
      value = decoded ? decoded.value : JSON.parse(text);
    } catch {
      throw Error("Respuesta JSON inválida" + (postpass ? " de Postpass" : ""));
    }
    if (postpass && (value?.type !== "FeatureCollection" || !Array.isArray(value.features))) throw Error("Postpass no devolvió un GeoJSON FeatureCollection");
    if (postpass) originalPostpass.set(value, text);
    return { geo: postpass ? value : preferCenter(window.osmtogeojson(value)), cnt: postpass ? countPostpass(value) : count(value), raw: text, timestamp: postpass ? value.postpass_properties?.timestamp : value.osm3s?.timestamp_osm_base };
  }
  const value = new DOMParser().parseFromString(text, "text/xml");
  if (value.querySelector("parsererror")) throw Error("Respuesta XML inválida");
  return { geo: preferCenter(window.osmtogeojson(value)), cnt: count(value), raw: text, timestamp: value.querySelector("osm > meta[osm_base]")?.getAttribute("osm_base") };
};
export const purgeResponseRaw = (raw, engine, type, id, indices) => {
  if (engine === "postpass") {
    const value = JSON.parse(raw);
    if (!Array.isArray(value.features)) throw Error("Respuesta Postpass sin entidades");
    for (const index of indices) {
      if (!value.features[index]) throw Error("Entidad Postpass no encontrada");
      value.features.splice(index, 1);
    }
    return { raw: JSON.stringify(value), removed: indices.length };
  }
  if (/^\s*</.test(raw)) {
    const documentValue = new DOMParser().parseFromString(raw, "text/xml");
    if (documentValue.querySelector("parsererror")) throw Error("Respuesta OSM XML inválida");
    let removed = 0;
    for (const element of [...documentValue.documentElement.children]) {
      if (element.localName !== type || element.getAttribute("id") !== id) continue;
      element.remove();
      removed++;
    }
    return { raw: new XMLSerializer().serializeToString(documentValue), removed };
  }
  const value = JSON.parse(raw);
  if (!Array.isArray(value.elements)) throw Error("Respuesta OSM JSON sin elementos");
  const before = value.elements.length;
  value.elements = value.elements.filter((element) => element.type !== type || String(element.id) !== id);
  return { raw: JSON.stringify(value), removed: before - value.elements.length };
};
