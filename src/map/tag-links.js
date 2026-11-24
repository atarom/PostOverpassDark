import { esc, val } from "../core/utils.js";
const CDN = "https://cdn.jsdelivr.net/npm/tag2link@latest/index.json";
const webUrl = (value) => {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value) || /[\s\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return !url.username && !url.password && url.hostname && (url.protocol === "https:" || url.protocol === "http:") ? url.href : null;
  } catch { return null; }
};
const buildTagLinks = (data) => {
  if (!Array.isArray(data)) return new Map();
  const grouped = new Map();
  for (const item of data) {
    if (!item || typeof item.key !== "string" || !item.key.startsWith("Key:") || !["preferred", "normal"].includes(item.rank) || !["osmwiki:P8", "wikidata:P1630"].includes(item.source) || typeof item.url !== "string" || !item.url.includes("$1") || !webUrl(item.url.replaceAll("$1", "example"))) continue;
    const key = item.key.slice(4);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }
  const result = new Map();
  for (const [key, items] of grouped) {
    const preferred = items.filter((item) => item.rank === "preferred");
    const ranked = preferred.length ? preferred : items;
    const urls = new Set(ranked.map((item) => item.url));
    if (urls.size === 1) { result.set(key, urls.values().next().value); continue; }
    const wiki = new Set(ranked.filter((item) => item.source === "osmwiki:P8").map((item) => item.url));
    const wikidata = new Set(ranked.filter((item) => item.source === "wikidata:P1630").map((item) => item.url));
    if (wiki.size === 1) result.set(key, wiki.values().next().value);
    else if (wikidata.size === 1) result.set(key, wikidata.values().next().value);
  }
  return result;
};
let templates = new Map();
let loading;
export const loadTagLinks = () => loading ||= Promise.resolve().then(() => fetch(CDN, { credentials: "omit", referrerPolicy: "no-referrer" })).then((response) => {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}).then((data) => {
  templates = buildTagLinks(data);
  return templates.size > 0;
}).catch(() => false);
const encode = (value) => {
  try { return encodeURIComponent(value); } catch { return null; }
};
const pageUrl = (value) => {
  const hash = value.indexOf("#");
  const page = (hash < 0 ? value : value.slice(0, hash)).trim().replace(/ /g, "_");
  const fragment = hash < 0 ? "" : value.slice(hash + 1).replace(/ /g, "_");
  const p = encode(page), f = encode(fragment);
  return page && p !== null && f !== null ? p + (fragment ? `#${f}` : "") : null;
};
const tagHref = (key, value) => {
  const direct = webUrl(value);
  if (direct) return direct;
  const wiki = /(?:^|:)wikipedia(?::([a-z][a-z0-9-]{0,20}))?$/.exec(key);
  if (wiki) {
    const prefixed = /^([a-z][a-z0-9-]{0,20}):(.+)$/i.exec(value);
    const lang = prefixed?.[1] || wiki[1];
    const page = pageUrl(prefixed?.[2] || value);
    return lang && page ? webUrl(`https://${lang.toLowerCase()}.wikipedia.org/wiki/${page}`) : null;
  }
  if (/(?:^|:)wikidata$/.test(key)) return /^Q[1-9]\d*$/i.test(value) ? `https://www.wikidata.org/wiki/${value.toUpperCase()}` : null;
  if (/(?:^|:)wikimedia_commons$/.test(key)) {
    const page = /^(?:file|category):.+/i.test(value) && pageUrl(value);
    return page ? webUrl(`https://commons.wikimedia.org/wiki/${page}`) : null;
  }
  if (/(?:^|:)email$/.test(key)) {
    const address = encode(value);
    return address !== null && /^[^\s@?&#;<>"']+@[^\s@?&#;<>"']+\.[^\s@?&#;<>"']+$/.test(value) ? `mailto:${address.replace("%40", "@")}` : null;
  }
  if (/(?:^|:)(?:phone|fax|mobile)$/.test(key)) {
    const phone = value.replace(/[\s().-]/g, "");
    return /^\+?\d{6,20}$/.test(phone) ? `tel:${phone}` : null;
  }
  if (/(?:^|:)(?:website|url)$/.test(key) && /^(?:[\w-]+\.)+[\w-]+(?::\d+)?(?:[/?#]\S*)?$/.test(value)) return webUrl(`https://${value}`);
  const template = templates.get(key);
  const encoded = encode(value);
  return template && encoded !== null ? webUrl(template.replaceAll("$1", encoded)) : null;
};
const anchor = (href, label) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer nofollow">${esc(label)}</a>`;
export const formatTagValue = (key, value) => {
  const text = val(value);
  if (typeof value !== "string" && typeof value !== "number") return esc(text);
  const direct = webUrl(text);
  if (direct && !/;\s*(?:https?:\/\/|www\.)/i.test(text)) return anchor(direct, text);
  return text.split(";").map((part) => {
    const trimmed = part.trim();
    const href = trimmed && tagHref(key, trimmed);
    if (!href) return esc(part);
    const start = part.indexOf(trimmed);
    return esc(part.slice(0, start)) + anchor(href, trimmed) + esc(part.slice(start + trimmed.length));
  }).join(";");
};
