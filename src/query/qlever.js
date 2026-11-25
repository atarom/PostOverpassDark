import { QLEVER_ENDPOINT } from "../core/servers.js";
const GEO = "http://www.opengis.net/ont/geosparql#wktLiteral";
const KEY_PREFIX = /^https?:\/\/(?:www\.|wiki\.)?openstreetmap\.org\/wiki\/Key:/;
const OSM_IRI = /^https?:\/\/(?:www\.)?openstreetmap\.org\/(node|way|relation)\/(\d+)$/;
const WKT_TYPE = /^(?:POINT|MULTIPOINT|LINESTRING|MULTILINESTRING|POLYGON|MULTIPOLYGON|GEOMETRYCOLLECTION)\s*(?:ZM|Z|M)?\s*(?:\(|EMPTY\b)/i;
const GEOMETRY_NAMES = ["geometry", "geom", "wkt", "hasgeometry"];
const ID_NAMES = ["osm", "osm_id", "element", "feature", "id"];
export const isQLeverSelected = () => globalThis.document?.getElementById("endpoint")?.value === QLEVER_ENDPOINT;
export const isQLeverTable = (query) => /^\s*#\s*POD:TABLE\s*(?:\r?\n|$)/i.test(query);
const osmReference = (binding) => typeof binding?.value === "string" && binding.value.match(OSM_IRI);
const unprefixWkt = (value) => {
  const text = String(value).trim();
  const match = text.match(/^<([^>]+)>\s*(.*)$/s);
  if (!match) return text;
  if (!/^https?:\/\/www\.opengis\.net\/def\/crs\/OGC\/(?:1\.3|0)\/CRS84$/i.test(match[1])) throw Error("QLever: CRS WKT no admitido: " + match[1]);
  return match[2];
};
const isGeometry = (binding) => binding?.datatype === GEO || typeof binding?.value === "string" && WKT_TYPE.test(binding.value.replace(/^<[^>]+>\s*/, ""));
const pickGeometry = (row) => {
  for (const key of GEOMETRY_NAMES) if (isGeometry(row[key])) return key;
  const keys = Object.keys(row).filter((key) => isGeometry(row[key]));
  if (keys.length > 1) throw Error("QLever: varias geometrías en una fila. Usa AS ?geometry para identificar la principal.");
  return keys[0];
};
const pickReference = (row) => {
  for (const key of ID_NAMES) if (osmReference(row[key])) return key;
  const keys = Object.keys(row).filter((key) => osmReference(row[key]));
  return keys.length === 1 ? keys[0] : undefined;
};
const tagKey = (binding) => {
  if (!binding || typeof binding.value !== "string") return null;
  const value = binding.value;
  if (KEY_PREFIX.test(value)) {
    const key = value.replace(KEY_PREFIX, "");
    try { return decodeURIComponent(key); } catch { return key; }
  }
  return binding.type === "literal" && value ? value : null;
};
const addValue = (tags, key, value) => {
  if (!key || value == null) return;
  if (!Object.hasOwn(tags, key)) tags[key] = value;
  else if (Array.isArray(tags[key])) {
    if (!tags[key].includes(value)) tags[key].push(value);
  } else if (tags[key] !== value) tags[key] = [tags[key], value];
};
const readTags = (row, tags, geometryKey, refKey) => {
  const keyBinding = row.key || row.tag || row.predicate;
  const valueBinding = row.value || row.tag_value;
  if (keyBinding && valueBinding) addValue(tags, tagKey(keyBinding), valueBinding.value);
  if (row.tags?.value) {
    try {
      const parsed = JSON.parse(row.tags.value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed)) for (const item of Array.isArray(value) ? value : [value]) addValue(tags, key, item);
      }
    } catch { addValue(tags, "tags", row.tags.value); }
  }
  for (const [key, binding] of Object.entries(row)) {
    if (key === geometryKey || key === refKey || key === "tags" || isGeometry(binding)) continue;
    if (keyBinding && valueBinding && (binding === keyBinding || binding === valueBinding)) continue;
    addValue(tags, key, binding.value);
  }
};
export const sparqlToGeoJSON = (data, ol, signal) => {
  if (!Array.isArray(data?.results?.bindings) || !Array.isArray(data?.head?.vars)) throw Error("QLever: respuesta SPARQL JSON inválida. Para ASK o consultas sin geometría añade # POD:TABLE al principio.");
  const rows = data.results.bindings;
  const wkt = new ol.format.WKT();
  const geojson = new ol.format.GeoJSON();
  const features = [];
  const byReference = new Map();
  let skipped = 0;
  for (const row of rows) {
    signal?.throwIfAborted();
    const geometryKey = pickGeometry(row);
    if (!geometryKey) { skipped++; continue; }
    const text = unprefixWkt(row[geometryKey].value);
    if (/\bEMPTY\s*$/i.test(text)) { skipped++; continue; }
    const refKey = pickReference(row);
    const ref = refKey && osmReference(row[refKey]);
    const id = ref ? `${ref[1]}/${ref[2]}` : null;
    const key = id ? `${id}\u0000${text}` : null;
    let feature = key && byReference.get(key);
    if (!feature) {
      let geometry;
      try {
        const parsed = wkt.readGeometry(text);
        if (!parsed || !parsed.getExtent().every(Number.isFinite)) throw Error("Geometría vacía o no finita");
        geometry = geojson.writeGeometryObject(parsed);
      } catch (error) { throw Error(`QLever: WKT inválido${id ? ` en ${id}` : ""}: ${error.message}`); }
      feature = { type: "Feature", geometry, properties: { tags: Object.create(null) } };
      if (ref) {
        feature.id = id;
        Object.assign(feature.properties, { osm_type: ref[1], osm_id: ref[2], osm_url: `https://www.openstreetmap.org/${id}` });
      }
      if (key) byReference.set(key, feature);
      features.push(feature);
    }
    readTags(row, feature.properties.tags, geometryKey, refKey);
  }
  if (rows.length && !features.length && skipped === rows.length) throw Error("QLever: no hay geometrías representables. Para resultados tabulares añade # POD:TABLE al principio.");
  return { type: "FeatureCollection", features, qlever_properties: { endpoint: QLEVER_ENDPOINT, rows: rows.length, skipped } };
};
export const requestQLever = async (url, body, signal, fetcher = fetch, ol = globalThis.ol) => {
  const query = body.get("data")?.trim();
  if (!query) throw Error("QLever: consulta vacía.");
  const response = await fetcher(url, { method: "POST", headers: { Accept: "application/sparql-results+json" }, body: new URLSearchParams({ query }), signal, cache: "no-store" });
  const raw = await response.text();
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    let message = raw;
    try { const data = JSON.parse(raw); message = data.exception || data.error || data.message || raw; } catch {}
    throw Error(`QLever HTTP ${response.status}: ${String(message).slice(0, 1500)}`);
  }
  let data;
  try { data = JSON.parse(raw); } catch { throw Error("QLever: respuesta JSON inválida."); }
  if (data.exception || data.error || data.status === "ERROR") throw Error(`QLever: ${data.exception || data.error || data.message || "error de consulta"}`);
  if (body.get("options[geojson]") === "false") return { status: response.status, statusText: response.statusText, contentType, text: raw };
  signal?.throwIfAborted();
  return { status: response.status, statusText: response.statusText, contentType: "application/geo+json", text: JSON.stringify(sparqlToGeoJSON(data, ol, signal)) };
};
const polygon = (west, south, east, north) => `(${west} ${south},${east} ${south},${east} ${north},${west} ${north},${west} ${south})`;
export const bboxLiteral = (bounds) => {
  const round = (value) => Number(value.toFixed(7));
  const wrap = (lon) => ((lon + 180) % 360 + 360) % 360 - 180;
  const { west, east } = bounds;
  const south = round(Math.max(-90, Math.min(90, bounds.south)));
  const north = round(Math.max(-90, Math.min(90, bounds.north)));
  if (![west, east, south, north].every(Number.isFinite) || east <= west || north <= south) throw Error("QLever: extensión del mapa no válida.");
  let shape;
  if (east - west >= 360) shape = `POLYGON(${polygon(-180, south, 180, north)})`;
  else {
    const left = round(wrap(west));
    const right = round(left + east - west);
    shape = right <= 180 ? `POLYGON(${polygon(left, south, right, north)})` : `MULTIPOLYGON((${polygon(left, south, 180, north)}),(${polygon(-180, south, round(right - 360), north)}))`;
  }
  return `"${shape}"^^<${GEO}>`;
};
export const prepareQLever = (query, getBounds) => {
  const tokens = /"""(?:\\[\s\S]|(?!""")[\s\S])*?"""|'''(?:\\[\s\S]|(?!''')[\s\S])*?'''|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|<[^<>\s"{}|^`\\]*>|#[^\r\n]*|\{\{\s*bbox\s*\}\}/gi;
  return query.replace(tokens, (token) => /^\{\{\s*bbox\s*\}\}$/i.test(token) ? bboxLiteral(getBounds()) : token).trim();
};
