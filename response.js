import { esc, json } from "./utils.js";
export const OSM_TYPES = ["node", "way", "relation"];
const PP_TYPES = { N: "node", W: "way", R: "relation", node: "node", way: "way", relation: "relation" };
const postpassType = (properties) => {
  const raw = String(properties.osm_type || properties.type || "").trim();
  return PP_TYPES[raw] || PP_TYPES[raw.toUpperCase()];
};
const countElements = (elements) => {
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
const count = (value) => countElements(value?.nodeType ? [...value.querySelectorAll("node,way,relation")].map((element) => [element.localName, element.getAttribute("id")]) : (Array.isArray(value?.elements) ? value.elements : Array.isArray(value) ? value : []).map(({ type, id }) => [type, id]));
const countPostpass = (geo) => countElements((geo.features || []).map((feature) => {
  const properties = feature.properties || {};
  return [postpassType(properties), properties.osm_id ?? properties.id];
}));
const cleanText = (value) => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const ERROR_RX = /\berror\b|parse error|static error|runtime error|timeout|time-out|timed out|out of memory|rate limit|too many requests|bad request|failed|gateway|service unavailable/i;
export const responseError = (text, contentType, status, statusText) => {
  const raw = String(text ?? "").trim();
  const bad = status < 200 || status >= 300;
  const jsonLike = /json/i.test(contentType) || /^\s*[\[{]/.test(raw);
  const markup = /html|xml/i.test(contentType) || /^\s*</.test(raw);
  let messages = [];
  if (jsonLike) {
    try {
      const value = JSON.parse(raw);
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
const outputFormat = (query) => query.match(/\[\s*out\s*:\s*(xml|json|csv|custom|popup)\b/i)?.[1]?.toLowerCase() || "xml";
export const parseResponse = (text, contentType, engine, query, postpassTextOnly = false) => {
  const postpass = engine === "postpass";
  const format = postpass ? "json" : outputFormat(query);
  if (postpass && postpassTextOnly) return { geo: null, cnt: null, raw: text, textOnly: true, format: "raw" };
  if (!postpass && ["csv", "custom", "popup"].includes(format)) return { geo: null, cnt: null, raw: text, textOnly: true, format };
  if (postpass || /json/i.test(contentType) || /^\s*[\[{]/.test(text)) {
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      throw Error("Respuesta JSON inválida" + (postpass ? " de Postpass" : ""));
    }
    if (postpass && (value?.type !== "FeatureCollection" || !Array.isArray(value.features))) throw Error("Postpass no devolvió un GeoJSON FeatureCollection");
    return { geo: postpass ? value : window.osmtogeojson(value), cnt: postpass ? countPostpass(value) : count(value), raw: json(value) };
  }
  const value = new DOMParser().parseFromString(text, "text/xml");
  if (value.querySelector("parsererror")) throw Error("Respuesta XML inválida");
  return { geo: window.osmtogeojson(value), cnt: count(value), raw: text };
};
