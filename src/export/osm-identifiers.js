const TYPES = ["node", "way", "rel"];
const TYPE = Object.assign(Object.create(null), { N: "node", W: "way", R: "relation", n: "node", w: "way", r: "relation", node: "node", way: "way", relation: "relation", rel: "relation" });
export const normalizeOsmType = (value) => {
  const raw = String(value ?? "").trim();
  return TYPE[raw] || TYPE[raw.toLowerCase()] || "";
};
export const getOsmReference = (feature, numericOnly = false) => {
  const properties = feature?.properties || feature || {};
  let type = normalizeOsmType(properties.osm_type) || normalizeOsmType(properties.type);
  let id = type && (properties.osm_id ?? properties.id) != null ? String(properties.osm_id ?? properties.id) : "";
  if (!type || !id || numericOnly && !/^\d+$/.test(id)) {
    for (const value of [properties.osm_url, feature?.id, properties["@id"], properties.id]) {
      const source = String(value ?? "");
      const match = source.match(/(node|way|relation)[/:](\d+)$/i) || source.match(/^([nwr])(\d+)$/i);
      if (!match) continue;
      type = normalizeOsmType(match[1]);
      id = match[2];
      break;
    }
  }
  return type && id ? { type, id, short: type[0] } : null;
};
export const getIdentifier = (feature) => {
  const reference = getOsmReference(feature, true);
  if (!reference || !/^\d+$/.test(reference.id)) return null;
  const id = Number(reference.id);
  return Number.isSafeInteger(id) && id > 0 ? { type: reference.type === "relation" ? "rel" : reference.type, id } : null;
};
export const collectOsmIds = (features, enabled = { node: true, way: true, rel: true }) => {
  const sets = { node: new Set(), way: new Set(), rel: new Set() };
  let omitted = 0;
  for (const feature of features) {
    const item = getIdentifier(feature);
    if (!item) { omitted++; continue; }
    if (enabled[item.type]) sets[item.type].add(item.id);
  }
  const groups = Object.fromEntries(TYPES.map((type) => [type, [...sets[type]].sort((a, b) => a - b)]));
  return { groups, count: TYPES.reduce((total, type) => total + groups[type].length, 0), omitted };
};
const JOSM_PREFIX = { node: "n", way: "w", rel: "r" };
export const formatJosmIds = (groups) => ["node", "way", "rel"].flatMap((type) => (groups[type] || []).map((id) => `${JOSM_PREFIX[type]}${id}`));
